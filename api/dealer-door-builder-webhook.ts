import type { IncomingMessage, ServerResponse } from 'node:http'
import { createClient } from '@supabase/supabase-js'
import { authorizeDoorBuilderWebhookManager } from './_lib/authorizeHgiAdmin.js'
import { decryptCrmCredentials, encryptCrmCredentials } from './_lib/dealerCrmIntegration.js'
import { executeDoorBuilderWebhookRequest, validateZapierCatchHookUrl, type WebhookEnvelope } from './_lib/doorBuilderWebhookPolicy.js'
import { createSupabaseDoorBuilderWebhookStore, type WebhookAdminClient } from './_lib/doorBuilderWebhookStore.js'

type JsonResponse = ServerResponse<IncomingMessage> & { json?: (value: unknown) => void }
type RequestBody = { action?: string; dealerId?: string; webhookUrl?: unknown; contact?: unknown; submissionId?: unknown; confirm?: unknown }

const MAX_BODY_BYTES = 8 * 1024
const EXPECTED_PROJECT_REF = 'udbcnpjtwhmjzpjjhoph'

function send(response: JsonResponse, status: number, value: unknown) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'private, no-store, max-age=0')
  if (response.json) response.json(value)
  else response.end(JSON.stringify(value))
}

async function readBody(request: IncomingMessage): Promise<RequestBody> {
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
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as RequestBody
  } catch {
    throw new Error('INVALID_JSON')
  }
}

function encryptionKey() {
  return process.env.DOOR_BUILDER_WEBHOOK_ENCRYPTION_KEY
}

function webhookKeyConfigured(value: string | undefined) {
  if (!value) return false
  try { return Buffer.from(value, 'base64').byteLength === 32 } catch { return false }
}

function encryptWebhook(webhookUrl: string, key: string): WebhookEnvelope {
  const envelope = encryptCrmCredentials({ webhookUrl: validateZapierCatchHookUrl(webhookUrl) }, key)
  return { ciphertext: envelope.ciphertext, iv: envelope.iv, authTag: envelope.authTag, keyVersion: envelope.keyVersion }
}

function decryptWebhook(envelope: WebhookEnvelope, key: string) {
  const parsed = decryptCrmCredentials(envelope, key)
  return validateZapierCatchHookUrl(parsed.webhookUrl)
}

export default async function handler(request: IncomingMessage, response: JsonResponse) {
  if (request.method !== 'GET' && request.method !== 'POST') return send(response, 405, { error: 'Method not allowed.' })
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) return send(response, 500, { error: 'Door Builder webhook management is not configured.' })
  try {
    if (new URL(supabaseUrl).hostname.split('.')[0] !== EXPECTED_PROJECT_REF) {
      return send(response, 500, { error: 'Door Builder webhook management is not configured for HGI Portal Dev.' })
    }
  } catch {
    return send(response, 500, { error: 'Door Builder webhook management is not configured.' })
  }

  let body: RequestBody = {}
  if (request.method === 'POST') {
    try {
      body = await readBody(request)
    } catch (error) {
      const tooLarge = error instanceof Error && error.message === 'REQUEST_TOO_LARGE'
      return send(response, tooLarge ? 413 : 400, { error: tooLarge ? 'The webhook request is too large.' : 'The webhook request could not be read.' })
    }
  }
  const parsedUrl = new URL(request.url ?? '/', 'https://portal.local')
  const dealerId = body.dealerId ?? parsedUrl.searchParams.get('dealerId') ?? ''
  const authorization = Array.isArray(request.headers.authorization) ? request.headers.authorization[0] : request.headers.authorization
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const key = encryptionKey()
  const result = await executeDoorBuilderWebhookRequest({
    method: request.method,
    dealerId,
    action: body.action,
    webhookUrl: body.webhookUrl,
    contact: body.contact,
    submissionId: body.submissionId,
    confirm: body.confirm,
    authorization,
    authorize: authorizeDoorBuilderWebhookManager,
    store: createSupabaseDoorBuilderWebhookStore(admin as unknown as WebhookAdminClient),
    fetchImpl: globalThis.fetch,
    encryptionConfigured: webhookKeyConfigured(key),
    encryptionKey: key,
    encrypt: encryptWebhook,
    decrypt: decryptWebhook,
  })
  return send(response, result.status, result.body)
}
