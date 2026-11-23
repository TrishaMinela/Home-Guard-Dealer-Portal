import type { IncomingMessage, ServerResponse } from 'node:http'
import { createClient } from '@supabase/supabase-js'
import { performDealerNotification, performSalespersonNotification } from './_lib/leadRoutingActions.ts'
import { dealerNotificationsMode, leadRoutingEnabled, personifyNotificationsMode } from './_lib/leadRoutingFlags.ts'
import { createLeadRoutingGateway, serviceRoleClient, type DealerSendContext } from './_lib/leadRoutingGateway.ts'

type JsonResponse = ServerResponse<IncomingMessage> & { json?: (value: unknown) => void }
type Actor = { userId: string; isAdmin: boolean }
type Body = {
  action?: string
  caseId?: string
  dealerId?: string
  zip?: string
  salespersonId?: string | null
  userId?: string
  displayName?: string
  email?: string
  personifyContactId?: string
  active?: boolean
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function send(response: JsonResponse, status: number, value: unknown) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'private, no-store, max-age=0')
  if (response.json) response.json(value)
  else response.end(JSON.stringify(value))
}

async function readBody(request: IncomingMessage): Promise<Body> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  if (!chunks.length) return {}
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Body : {}
}

export async function authorizeLeadRoutingActor(authorization: string | undefined): Promise<
  | { authorized: true; actor: Actor }
  | { authorized: false; status: 401 | 403 | 500; message: string }
> {
  const token = authorization?.match(/^Bearer\s+([^\s]+)$/i)?.[1]
  if (!token) return { authorized: false, status: 401, message: 'Authentication required.' }
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabasePublishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!supabaseUrl || !supabasePublishableKey) return { authorized: false, status: 500, message: 'Server authentication is not configured.' }
  const supabase = createClient(supabaseUrl, supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  if (userError || !userData.user) return { authorized: false, status: 401, message: 'Authentication required.' }
  const { data: admin, error: adminError } = await supabase.from('home_guard_admins').select('id').eq('user_id', userData.user.id).maybeSingle()
  if (adminError) return { authorized: false, status: 500, message: 'Unable to verify account access.' }
  if (admin) return { authorized: true, actor: { userId: userData.user.id, isAdmin: true } }
  const { data: salesperson, error: salespersonError } = await supabase.from('salespeople').select('id, is_active').eq('user_id', userData.user.id).maybeSingle()
  if (salespersonError) {
    const missing = salespersonError.code === 'PGRST205' || salespersonError.code === '42P01'
    if (missing) return { authorized: false, status: 403, message: 'Home Guard lead routing access required.' }
    return { authorized: false, status: 500, message: 'Unable to verify account access.' }
  }
  if (!salesperson?.is_active) return { authorized: false, status: 403, message: 'Home Guard lead routing access required.' }
  return { authorized: true, actor: { userId: userData.user.id, isAdmin: false } }
}

export default async function handler(request: IncomingMessage, response: JsonResponse) {
  if (request.method !== 'POST') return send(response, 405, { error: 'Method not allowed.' })
  const authorization = Array.isArray(request.headers.authorization) ? request.headers.authorization[0] : request.headers.authorization
  const access = await authorizeLeadRoutingActor(authorization)
  if (!access.authorized) return send(response, access.status, { error: access.message })
  if (!leadRoutingEnabled()) return send(response, 409, { error: 'lead_routing_disabled' })

  let body: Body
  try {
    body = await readBody(request)
  } catch {
    return send(response, 400, { error: 'Request body is invalid.' })
  }

  const admin = serviceRoleClient()
  if (!admin) return send(response, 500, { error: 'Lead routing is not configured.' })
  const gateway = createLeadRoutingGateway(admin, process.env.PORTAL_URL?.trim())
  const actor = access.actor

  try {
    const settings = await gateway.settings()
    if (!settings.routingEnabled) return send(response, 409, { error: 'lead_routing_disabled' })

    if (body.action === 'send_dealer_notification') {
      if (!uuidPattern.test(body.caseId ?? '') || !uuidPattern.test(body.dealerId ?? '')) return send(response, 400, { error: 'A lead and dealer are required.' })
      if (dealerNotificationsMode() === 'disabled' || settings.dealerMode === 'disabled' || dealerNotificationsMode() !== settings.dealerMode) {
        return send(response, 409, { error: 'lead_routing_disabled' })
      }
      const context = await gateway.readDealerSend(body.caseId ?? '')
      if (!context || context.proposedDealerId !== body.dealerId) return send(response, 409, { error: 'dealer_mismatch' })
      if (!context.dealerEmail) return send(response, 409, { error: 'dealer_email_missing' })
      const outcome = await performDealerNotification({
        env: process.env,
        settings,
        claim: async () => claimPayload(await gateway.claimDealer(context.caseId, actor.userId, body.dealerId ?? '')),
        complete: (attemptId, result, safeError) => gateway.completeDealer(attemptId, result, safeError),
        loadPayload: async () => payloadFrom(context),
      })
      return send(response, outcome.httpStatus, outcome.body)
    }

    if (body.action === 'repropose_dealer') {
      if (!uuidPattern.test(body.caseId ?? '')) return send(response, 400, { error: 'A lead is required.' })
      const result = await gateway.repropose(body.caseId ?? '', actor.userId)
      return send(response, 200, { result: result.result ?? 'ignored', dealerId: result.dealerId ?? null })
    }

    if (body.action === 'notify_salesperson') {
      if (!uuidPattern.test(body.caseId ?? '')) return send(response, 400, { error: 'A lead is required.' })
      if (personifyNotificationsMode() === 'disabled' || settings.personifyMode === 'disabled' || personifyNotificationsMode() !== settings.personifyMode) {
        return send(response, 409, { error: 'lead_routing_disabled' })
      }
      const notification = await gateway.readSalespersonNotify(body.caseId ?? '')
      if (!notification?.reviewUrl) return send(response, 409, { error: 'review_link_not_configured' })
      const outcome = await performSalespersonNotification({
        env: process.env,
        settings,
        notification,
        claim: async () => claimPayload(await gateway.claimSalesperson(body.caseId ?? '', actor.userId)),
        complete: (attemptId, result, safeError) => gateway.completeSalesperson(attemptId, result, safeError),
      })
      return send(response, outcome.httpStatus, outcome.body)
    }

    if (!actor.isAdmin) return send(response, 403, { error: 'Home Guard administrator access required.' })

    if (body.action === 'save_territory') {
      const salespersonId = body.salespersonId ?? null
      if (salespersonId && !uuidPattern.test(salespersonId)) return send(response, 400, { error: 'Salesperson is invalid.' })
      const result = await gateway.saveTerritory(actor.userId, body.zip ?? '', salespersonId, body.active !== false)
      return send(response, result.result === 'saved' ? 200 : 409, result)
    }
    if (body.action === 'save_coverage') {
      if (!uuidPattern.test(body.dealerId ?? '')) return send(response, 400, { error: 'Dealer is invalid.' })
      const result = await gateway.saveCoverage(actor.userId, body.dealerId ?? '', body.zip ?? '', body.active !== false)
      return send(response, result.result === 'saved' ? 200 : 409, result)
    }
    if (body.action === 'save_salesperson') {
      if (!uuidPattern.test(body.userId ?? '')) return send(response, 400, { error: 'User is invalid.' })
      const result = await gateway.saveSalesperson(actor.userId, body.userId ?? '', body.displayName ?? '', body.email ?? '', body.personifyContactId ?? '', body.active !== false)
      return send(response, result.result === 'saved' ? 200 : 409, result)
    }
    return send(response, 400, { error: 'Action is invalid.' })
  } catch {
    return send(response, 500, { error: 'Lead routing could not be completed.' })
  }
}

function claimPayload(result: { result?: string; attemptId?: string; idempotencyKey?: string; leadId?: string; dealerId?: string }) {
  return { result: result.result ?? 'ignored', attemptId: result.attemptId, idempotencyKey: result.idempotencyKey, leadId: result.leadId, dealerId: result.dealerId }
}

function payloadFrom(context: DealerSendContext) {
  if (!context.payload || !context.dealerEmail) return Promise.resolve(null)
  return Promise.resolve({ ...context.payload, idempotencyKey: 'pending', dealerEmail: context.dealerEmail })
}
