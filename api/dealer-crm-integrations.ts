import type { IncomingMessage, ServerResponse } from 'node:http'
import { createClient } from '@supabase/supabase-js'
import { authorizeBillingAccessManager } from './_lib/authorizeBillingAccessManager.js'
import {
  dealerAllowsOptaDelivery,
  integrationAuditPlan,
  OPTA_LIVE_CONFIRMATION_PHRASE,
  validateIntegrationStateChange,
} from './_lib/crmIntegrationState.js'
import {
  CRM_PROVIDERS,
  assertValidFieldMapping,
  encryptCrmCredentials,
  isCrmCredentialEncryptionConfigured,
  validateCrmCredentials,
  type CrmIntegrationState,
  type CrmProvider,
} from './_lib/dealerCrmIntegration.js'
import { handleCrmDeliveryTrigger, handleOptaDeliveryCron, productionWorkerDeps } from './_lib/optaDeliveryHttp.js'
import { redactCredentialPatterns } from './_lib/optaDeliveryPolicy.js'

type JsonResponse = ServerResponse<IncomingMessage> & { json?: (value: unknown) => void }
type SaveBody = {
  action?: 'save'
  dealerId?: string
  provider?: string
  state?: string
  fieldMapping?: unknown
  credentials?: unknown
  liveConfirmation?: string
}
type IntegrationRow = {
  id: string
  dealer_id: string
  provider: CrmProvider
  state: 'disabled' | 'test' | 'live'
  field_mapping: Record<string, string>
  credentials_ciphertext?: string | null
  created_at: string
  updated_at: string
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_BODY_BYTES = 64 * 1024

function send(response: JsonResponse, status: number, value: unknown) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'private, no-store, max-age=0')
  if (response.json) response.json(value)
  else response.end(JSON.stringify(value))
}

async function readBody(request: IncomingMessage): Promise<SaveBody> {
  const body = (request as IncomingMessage & { body?: unknown }).body
  if (body !== undefined) {
    const raw = typeof body === 'string' ? body : JSON.stringify(body)
    if (Buffer.byteLength(raw) > MAX_BODY_BYTES) throw new Error('REQUEST_TOO_LARGE')
    try {
      const value: unknown = JSON.parse(raw)
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_JSON')
      return value as SaveBody
    } catch { throw new Error('INVALID_JSON') }
  }
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.byteLength
    if (size > MAX_BODY_BYTES) throw new Error('REQUEST_TOO_LARGE')
    chunks.push(buffer)
  }
  if (!chunks.length) return {}
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as SaveBody } catch { throw new Error('INVALID_JSON') }
}

function bytea(base64: string) {
  return `\\x${Buffer.from(base64, 'base64').toString('hex')}`
}

function safeIntegration(row: IntegrationRow) {
  return {
    id: row.id,
    dealerId: row.dealer_id,
    provider: row.provider,
    state: row.state,
    fieldMapping: row.field_mapping ?? {},
    hasCredentials: Boolean(row.credentials_ciphertext),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function publicDelivery(row: {
  id: string
  lead_id: string
  provider: string
  delivery_status: string
  attempt_count: number
  last_attempted_at: string | null
  http_status: number | null
  error_code: string | null
  error_message: string | null
  response_metadata: unknown
  updated_at: string
}) {
  const metadata = row.response_metadata && typeof row.response_metadata === 'object' && !Array.isArray(row.response_metadata)
    ? row.response_metadata as Record<string, unknown>
    : {}
  const disposition = typeof metadata.disposition === 'string' && /^[a-z_]{1,40}$/.test(metadata.disposition) ? metadata.disposition : null
  return {
    id: row.id,
    leadId: row.lead_id,
    provider: row.provider,
    deliveryStatus: row.delivery_status,
    attemptCount: row.attempt_count,
    lastAttemptedAt: row.last_attempted_at,
    httpStatus: row.http_status,
    errorCode: row.error_code,
    errorMessage: typeof row.error_message === 'string' ? redactCredentialPatterns(row.error_message) : null,
    disposition,
    updatedAt: row.updated_at,
  }
}

function validProvider(value: string | undefined): value is CrmProvider {
  return CRM_PROVIDERS.includes(value as CrmProvider)
}

function validatedFieldMapping(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_MAPPING')
  const entries = Object.entries(value)
  if (entries.length > 40 || entries.some(([, source]) => typeof source !== 'string')) throw new Error('INVALID_MAPPING')
  const mapping = Object.fromEntries(entries) as Record<string, string>
  assertValidFieldMapping(mapping)
  return mapping
}

export default async function handler(request: IncomingMessage, response: JsonResponse) {
  if (request.method !== 'GET' && request.method !== 'POST') return send(response, 405, { error: 'Method not allowed.' })
  // Hobby allows 12 serverless functions. These routes rewrite onto this existing function.
  const route = new URL(request.url ?? '/', 'https://portal.local')
  if (route.searchParams.get('deliveryTrigger') === '1' || route.pathname.endsWith('/crm-delivery-trigger')) {
    return handleCrmDeliveryTrigger(request, response, productionWorkerDeps())
  }
  if (route.searchParams.get('optaSweep') === '1' || route.pathname.endsWith('/cron-opta-delivery')) {
    return handleOptaDeliveryCron(request, response, productionWorkerDeps())
  }
  const authorization = Array.isArray(request.headers.authorization) ? request.headers.authorization[0] : request.headers.authorization
  const access = await authorizeBillingAccessManager(authorization)
  if (access.authorized === false) return send(response, access.status, { error: access.message })

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) return send(response, 500, { error: 'CRM integration management is not configured.' })
  const expectedProjectRef = 'udbcnpjtwhmjzpjjhoph'
  try {
    if (new URL(supabaseUrl).hostname.split('.')[0] !== expectedProjectRef) {
      return send(response, 500, { error: 'CRM integration management is not configured for HGI Portal Dev.' })
    }
  } catch {
    return send(response, 500, { error: 'CRM integration management is not configured.' })
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  try {
    const parsedUrl = new URL(request.url ?? '/', 'https://portal.local')
    const body = request.method === 'POST' ? await readBody(request) : {}
    const dealerId = body.dealerId ?? parsedUrl.searchParams.get('dealerId') ?? ''
    if (!uuidPattern.test(dealerId)) return send(response, 400, { error: 'A valid dealer is required.' })
    const { data: dealer, error: dealerError } = await admin.from('dealers').select('id,company_name,slug').eq('id', dealerId).maybeSingle()
    if (dealerError) throw dealerError
    if (!dealer) return send(response, 404, { error: 'Dealer not found.' })

    let notice: string | undefined
    if (request.method === 'POST') {
      if (body.action !== 'save' || !validProvider(body.provider)) return send(response, 400, { error: 'Choose a supported CRM provider.' })
      const stateChange = validateIntegrationStateChange({
        provider: body.provider,
        dealerSlug: dealer.slug,
        requestedState: body.state,
        liveConfirmation: body.liveConfirmation,
      })
      if (stateChange.ok === false) return send(response, stateChange.status, { error: stateChange.error })
      const nextState: CrmIntegrationState = stateChange.state
      let fieldMapping: Record<string, string>
      try { fieldMapping = validatedFieldMapping(body.fieldMapping) } catch { return send(response, 400, { error: 'Review the CRM field mapping and try again.' }) }

      const { data: current, error: currentError } = await admin
        .from('dealer_crm_integrations')
        .select('id,dealer_id,provider,state,field_mapping,credentials_ciphertext,created_at,updated_at')
        .eq('dealer_id', dealerId)
        .eq('provider', body.provider)
        .maybeSingle<IntegrationRow>()
      if (currentError) throw currentError

      const credentialsInput = body.credentials && typeof body.credentials === 'object' && !Array.isArray(body.credentials)
        ? body.credentials as Record<string, unknown>
        : null
      const hasCredentialUpdate = credentialsInput !== null && Object.keys(credentialsInput).length > 0
      let encrypted: ReturnType<typeof encryptCrmCredentials> | null = null
      if (hasCredentialUpdate) {
        const encryptionKey = process.env.CRM_CREDENTIAL_ENCRYPTION_KEY
        if (!isCrmCredentialEncryptionConfigured(encryptionKey)) {
          return send(response, 503, { error: 'Secure CRM credential storage is not configured.' })
        }
        try {
          encrypted = encryptCrmCredentials(validateCrmCredentials(body.provider, credentialsInput), encryptionKey as string)
        } catch {
          return send(response, 400, { error: 'Review the required provider credentials and try again.' })
        }
      }

      const timestamp = new Date().toISOString()
      const values = {
        dealer_id: dealerId,
        provider: body.provider,
        state: nextState,
        field_mapping: fieldMapping,
        updated_by: access.userId,
        updated_at: timestamp,
        ...(encrypted ? {
          credentials_ciphertext: bytea(encrypted.ciphertext),
          credentials_iv: bytea(encrypted.iv),
          credentials_auth_tag: bytea(encrypted.authTag),
          credential_key_version: encrypted.keyVersion,
        } : {}),
      }
      const result = current
        ? await admin.from('dealer_crm_integrations').update(values).eq('id', current.id).eq('dealer_id', dealerId).select('id,dealer_id,provider,state,field_mapping,credentials_ciphertext,created_at,updated_at').single<IntegrationRow>()
        : await admin.from('dealer_crm_integrations').insert({ ...values, created_by: access.userId }).select('id,dealer_id,provider,state,field_mapping,credentials_ciphertext,created_at,updated_at').single<IntegrationRow>()
      if (result.error) throw result.error

      const auditActions = integrationAuditPlan({
        isNew: !current,
        previousState: current?.state ?? null,
        nextState,
        credentialsChanged: Boolean(encrypted),
      })
      const { error: auditError } = await admin.from('dealer_crm_integration_audit_log').insert(auditActions.map((action) => ({
        integration_id: result.data.id,
        dealer_id: dealerId,
        actor_user_id: access.userId,
        action,
        previous_state: current?.state ?? null,
        next_state: nextState,
      })))
      if (auditError) throw auditError
      notice = current
        ? 'CRM integration settings saved securely.'
        : nextState === 'disabled'
          ? 'CRM integration added in Disabled mode.'
          : 'CRM integration added.'
    }

    const [{ data: integrations, error: integrationsError }, { data: audit, error: auditError }, { data: deliveries, error: deliveriesError }] = await Promise.all([
      admin.from('dealer_crm_integrations').select('id,dealer_id,provider,state,field_mapping,credentials_ciphertext,created_at,updated_at').eq('dealer_id', dealerId).order('created_at'),
      admin.from('dealer_crm_integration_audit_log').select('id,integration_id,action,previous_state,next_state,created_at').eq('dealer_id', dealerId).order('created_at', { ascending: false }).limit(25),
      admin.from('dealer_crm_lead_deliveries').select('id,lead_id,provider,delivery_status,attempt_count,last_attempted_at,http_status,error_code,error_message,response_metadata,updated_at').eq('dealer_id', dealerId).order('updated_at', { ascending: false }).limit(20),
    ])
    if (integrationsError || auditError || deliveriesError) throw integrationsError ?? auditError ?? deliveriesError
    const safeIntegrations = (integrations as IntegrationRow[] | null ?? []).map(safeIntegration)
    const providerByIntegration = new Map(safeIntegrations.map((integration) => [integration.id, integration.provider]))
    return send(response, 200, {
      dealer: { id: dealer.id, name: dealer.company_name, slug: dealer.slug },
      integrations: safeIntegrations,
      deliveries: (deliveries ?? []).map(publicDelivery),
      auditHistory: (audit ?? []).map((entry) => ({
        id: entry.id,
        provider: providerByIntegration.get(entry.integration_id) ?? null,
        action: entry.action,
        previousState: entry.previous_state,
        nextState: entry.next_state,
        createdAt: entry.created_at,
      })),
      encryptionConfigured: isCrmCredentialEncryptionConfigured(process.env.CRM_CREDENTIAL_ENCRYPTION_KEY),
      allowedStates: dealerAllowsOptaDelivery(dealer.slug) ? ['disabled', 'test', 'live'] : ['disabled'],
      optaDeliveryAvailable: dealerAllowsOptaDelivery(dealer.slug),
      liveConfirmationPhrase: OPTA_LIVE_CONFIRMATION_PHRASE,
      notice,
    })
  } catch (error) {
    const reason = error instanceof Error && ['REQUEST_TOO_LARGE', 'INVALID_JSON'].includes(error.message) ? error.message : 'SERVER_ERROR'
    console.error('Dealer CRM integration management failed.', { reason })
    const status = reason === 'REQUEST_TOO_LARGE' ? 413 : reason === 'INVALID_JSON' ? 400 : 500
    return send(response, status, { error: status === 500 ? 'Unable to load or save CRM integration settings.' : 'The request could not be processed.' })
  }
}
