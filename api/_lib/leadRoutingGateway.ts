import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { RoutingSettings } from './leadRoutingActions.ts'
import type { NotificationMode } from './leadRoutingFlags.ts'
import { absoluteReviewUrl, personifyIdempotencyKey } from './zipLeadRouting.ts'

type RpcResult = { result?: string; attemptId?: string; idempotencyKey?: string; leadId?: string; dealerId?: string }

function asMode(value: unknown): NotificationMode {
  return value === 'dry_run' || value === 'live' ? value : 'disabled'
}

export type DealerSendContext = {
  caseId: string
  leadId: string
  proposedDealerId: string | null
  dealerEmail: string | null
  zip: string | null
  payload: {
    leadId: string
    dealerId: string
    zip: string | null
    dealerEmail: string | null
    customer: { firstName: string; lastName: string; email: string; phone: string | null; comments: string | null }
    doorConfiguration: unknown
  } | null
}

export type SalespersonNotifyContext = {
  salespersonContactId: string
  salespersonEmail: string
  reviewUrl: string
  zip: string
  leadId: string
  idempotencyKey: string
} | null

export function createLeadRoutingGateway(admin: SupabaseClient, portalOrigin: string | undefined) {
  return {
    async settings(): Promise<RoutingSettings> {
      const { data, error } = await admin.from('lead_routing_settings').select('routing_enabled, personify_mode, dealer_notifications_mode').limit(1).maybeSingle()
      if (error || !data) return { routingEnabled: false, personifyMode: 'disabled', dealerMode: 'disabled' }
      return {
        routingEnabled: data.routing_enabled === true,
        personifyMode: asMode(data.personify_mode),
        dealerMode: asMode(data.dealer_notifications_mode),
      }
    },
    async readDealerSend(caseId: string): Promise<DealerSendContext | null> {
      const { data, error } = await admin
        .from('lead_routing_cases')
        .select('id, lead_id, normalized_zip, proposed_dealer_id, leads(first_name, last_name, email, phone, comments, zip, door_configuration), dealers:proposed_dealer_id(email)')
        .eq('id', caseId)
        .maybeSingle()
      if (error || !data) return null
      const lead = firstRelation(data.leads)
      const dealer = firstRelation(data.dealers)
      const dealerId = typeof data.proposed_dealer_id === 'string' ? data.proposed_dealer_id : null
      return {
        caseId: data.id,
        leadId: data.lead_id,
        proposedDealerId: dealerId,
        dealerEmail: text(dealer?.email),
        zip: text(data.normalized_zip) ?? text(lead?.zip),
        payload: lead && dealerId ? {
          leadId: data.lead_id,
          dealerId,
          zip: text(data.normalized_zip) ?? text(lead.zip),
          dealerEmail: text(dealer?.email),
          customer: {
            firstName: text(lead.first_name) ?? '',
            lastName: text(lead.last_name) ?? '',
            email: text(lead.email) ?? '',
            phone: text(lead.phone),
            comments: text(lead.comments),
          },
          doorConfiguration: lead.door_configuration ?? null,
        } : null,
      }
    },
    async claimDealer(caseId: string, actorId: string, dealerId: string) {
      return rpc(admin, 'lead_routing_claim_dealer_send', { p_case_id: caseId, p_actor: actorId, p_dealer_id: dealerId })
    },
    async completeDealer(attemptId: string, outcome: 'succeeded' | 'failed' | 'dry_run', safeError: string | null) {
      await rpc(admin, 'lead_routing_complete_dealer_send', { p_attempt_id: attemptId, p_result: outcome, p_error: safeError, p_provider_reference: null })
    },
    async repropose(caseId: string, actorId: string) {
      return rpc(admin, 'lead_routing_repropose_dealer', { p_case_id: caseId, p_actor: actorId })
    },
    async readSalespersonNotify(caseId: string): Promise<SalespersonNotifyContext> {
      const { data, error } = await admin
        .from('lead_routing_cases')
        .select('lead_id, normalized_zip, salesperson_id, salespeople:salesperson_id(email, personify_contact_id)')
        .eq('id', caseId)
        .maybeSingle()
      if (error || !data || !data.salesperson_id || !portalOrigin) return null
      const person = firstRelation(data.salespeople)
      const reviewUrl = absoluteReviewUrl(portalOrigin, data.lead_id)
      if (!person || !reviewUrl) return null
      return {
        salespersonContactId: text(person.personify_contact_id) ?? '',
        salespersonEmail: text(person.email) ?? '',
        reviewUrl,
        zip: text(data.normalized_zip) ?? '',
        leadId: data.lead_id,
        idempotencyKey: personifyIdempotencyKey(data.lead_id, data.salesperson_id),
      }
    },
    async claimSalesperson(caseId: string, actorId: string) {
      return rpc(admin, 'lead_routing_claim_salesperson_notify', { p_case_id: caseId, p_actor: actorId })
    },
    async completeSalesperson(attemptId: string, outcome: 'succeeded' | 'failed' | 'dry_run', safeError: string | null) {
      await rpc(admin, 'lead_routing_complete_salesperson_notify', { p_attempt_id: attemptId, p_result: outcome, p_error: safeError, p_provider_reference: null })
    },
    async saveTerritory(actorId: string, zip: string, salespersonId: string | null, active: boolean) {
      return rpc(admin, 'lead_routing_save_territory', { p_actor: actorId, p_zip: zip, p_salesperson_id: salespersonId, p_is_active: active })
    },
    async saveCoverage(actorId: string, dealerId: string, zip: string, active: boolean) {
      return rpc(admin, 'lead_routing_save_coverage', { p_actor: actorId, p_dealer_id: dealerId, p_zip: zip, p_is_active: active })
    },
    async saveSalesperson(actorId: string, userId: string, displayName: string, email: string, personifyContactId: string, active: boolean) {
      return rpc(admin, 'lead_routing_save_salesperson', {
        p_actor: actorId,
        p_user_id: userId,
        p_display_name: displayName,
        p_email: email,
        p_personify_contact_id: personifyContactId,
        p_is_active: active,
      })
    },
  }
}

export function serviceRoleClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return null
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function rpc(admin: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<RpcResult> {
  const { data, error } = await admin.rpc(fn, args)
  if (error) throw new Error('lead_routing_rpc_failed')
  return data && typeof data === 'object' ? data as RpcResult : {}
}

function firstRelation<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}
