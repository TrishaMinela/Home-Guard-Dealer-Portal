import { timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseOptaDeliveryStore, type CrmAdminClient } from './optaDeliveryStore.js'
import { deliverSubmittedLead, sweepOptaDeliveries, type OptaWorkerDeps } from './optaDeliveryWorker.js'
import type { OptaTransport } from './optaLeadDelivery.js'

type JsonResponse = ServerResponse<IncomingMessage> & { json?: (value: unknown) => void }

const MAX_BODY_BYTES = 16 * 1024
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export const CRM_DELIVERY_TRIGGER_HEADER = 'x-crm-delivery-secret'
const PORTAL_DEV_PROJECT_REF = 'udbcnpjtwhmjzpjjhoph'

export function sharedSecretsEqual(supplied: string | undefined, expected: string | undefined) {
  if (!supplied || !expected) return false
  const left = Buffer.from(supplied)
  const right = Buffer.from(expected)
  if (left.length !== right.length || left.length === 0) return false
  return timingSafeEqual(left, right)
}

export function createOptaFetchTransport(fetchImpl: typeof fetch = globalThis.fetch): OptaTransport {
  return async (url, init) => {
    const response = await fetchImpl(url, {
      method: init.method,
      headers: init.headers,
      body: init.body,
      redirect: init.redirect,
      signal: AbortSignal.timeout(20_000),
    })
    return { status: response.status, text: () => response.text() }
  }
}

export function productionWorkerDeps(env: Record<string, string | undefined> = process.env): OptaWorkerDeps | null {
  const url = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) return null
  try {
    if (new URL(url).hostname.split('.')[0] !== PORTAL_DEV_PROJECT_REF) return null
  } catch {
    return null
  }
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  return {
    store: createSupabaseOptaDeliveryStore(admin as unknown as CrmAdminClient, env.CRM_CREDENTIAL_ENCRYPTION_KEY),
    transport: createOptaFetchTransport(),
    env,
    logger: (line) => { console.info(line) },
  }
}

export async function handleCrmDeliveryTrigger(request: IncomingMessage, response: JsonResponse, deps: OptaWorkerDeps | null) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return send(response, 405, { error: 'Method not allowed.' })
  }
  const supplied = headerValue(request.headers, CRM_DELIVERY_TRIGGER_HEADER)
  const expected = (deps?.env ?? process.env).CRM_DELIVERY_TRIGGER_SECRET
  if (!sharedSecretsEqual(supplied, expected)) return send(response, 401, { error: 'Authentication required.' })
  if (!deps) return send(response, 500, { error: 'CRM delivery is not configured.' })
  let body: { submissionId?: unknown; leadId?: unknown }
  try {
    body = await readJson(request)
  } catch (error) {
    const reason = error instanceof Error && error.message === 'REQUEST_TOO_LARGE' ? 413 : 400
    return send(response, reason, { error: 'The request could not be processed.' })
  }
  const submissionId = typeof body.submissionId === 'string' ? body.submissionId.trim() : ''
  const leadId = typeof body.leadId === 'string' ? body.leadId.trim() : ''
  if (!UUID_PATTERN.test(submissionId) && !UUID_PATTERN.test(leadId)) {
    return send(response, 400, { error: 'A lead or submission id is required.' })
  }
  try {
    const result = await deliverSubmittedLead(deps, {
      submissionId: UUID_PATTERN.test(submissionId) ? submissionId : undefined,
      leadId: UUID_PATTERN.test(leadId) ? leadId : undefined,
    })
    return send(response, result.httpStatus, result.body)
  } catch {
    deps.logger?.(JSON.stringify({ event: 'opta_delivery', disposition: 'error', code: 'UNHANDLED' }))
    return send(response, 500, { error: 'CRM delivery could not be completed.' })
  }
}

export async function handleOptaDeliveryCron(request: IncomingMessage, response: JsonResponse, deps: OptaWorkerDeps | null) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    return send(response, 405, { error: 'Method not allowed.' })
  }
  const authorization = headerValue(request.headers, 'authorization')
  const supplied = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!sharedSecretsEqual(supplied, (deps?.env ?? process.env).CRON_SECRET)) return send(response, 401, { error: 'Authentication required.' })
  if (!deps) return send(response, 500, { error: 'CRM delivery is not configured.' })
  try {
    const report = await sweepOptaDeliveries(deps)
    return send(response, 200, { ok: true, ...report })
  } catch {
    deps.logger?.(JSON.stringify({ event: 'opta_delivery', disposition: 'error', code: 'SWEEP_FAILED' }))
    return send(response, 500, { error: 'CRM delivery could not be completed.' })
  }
}

function headerValue(headers: IncomingMessage['headers'], name: string) {
  const value = headers[name]
  return Array.isArray(value) ? value[0] : value
}

async function readJson(request: IncomingMessage) {
  // Vercel may have already parsed JSON before invoking the function.
  const parsedBody = (request as IncomingMessage & { body?: unknown }).body
  if (parsedBody !== undefined) {
    const raw = typeof parsedBody === 'string' ? parsedBody : JSON.stringify(parsedBody)
    if (Buffer.byteLength(raw) > MAX_BODY_BYTES) throw new Error('REQUEST_TOO_LARGE')
    try {
      const value: unknown = JSON.parse(raw)
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_JSON')
      return value as { submissionId?: unknown; leadId?: unknown }
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
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as { submissionId?: unknown; leadId?: unknown }
  } catch {
    throw new Error('INVALID_JSON')
  }
}

function send(response: JsonResponse, status: number, value: unknown) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'private, no-store, max-age=0')
  if (response.json) response.json(value)
  else response.end(JSON.stringify(value))
}
