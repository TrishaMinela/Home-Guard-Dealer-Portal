import type { IncomingMessage, ServerResponse } from 'node:http'
import { authorizeHgiAdmin } from './_lib/authorizeHgiAdmin.js'
import { allowedRecoveryWindow, applyProviderRecovery } from './_lib/openaiProviderRecovery.js'

type JsonResponse = ServerResponse<IncomingMessage> & { json?: (value: unknown) => void }

function sendJson(response: JsonResponse, status: number, value: unknown): void {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'private, no-store, max-age=0')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  if (response.json) response.json(value)
  else response.end(JSON.stringify(value))
}

async function requestBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let length = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    length += buffer.length
    if (length > 4096) throw new Error('Request body is too large.')
    chunks.push(buffer)
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown : null
}

function rangeFromBody(body: unknown): { start: string; endExclusive: string } | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const record = body as Record<string, unknown>
  if (Object.keys(record).some((key) => !['start', 'endExclusive'].includes(key))) return null
  if (typeof record.start !== 'string' || typeof record.endExclusive !== 'string') return null
  return { start: record.start, endExclusive: record.endExclusive }
}

export default async function handler(request: IncomingMessage, response: JsonResponse): Promise<void> {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    sendJson(response, 405, { error: 'Method not allowed.' })
    return
  }
  const authorization = Array.isArray(request.headers.authorization) ? request.headers.authorization[0] : request.headers.authorization
  const access = await authorizeHgiAdmin(authorization)
  if (!access.authorized) {
    sendJson(response, access.status, { error: access.message })
    return
  }
  try {
    const range = rangeFromBody(await requestBody(request))
    if (!range || !allowedRecoveryWindow(range.start, range.endExclusive)) {
      sendJson(response, 400, { error: 'Only the approved provider recovery windows may be imported.' })
      return
    }
    const accessToken = authorization?.replace(/^Bearer\s+/i, '') ?? ''
    const report = await applyProviderRecovery({
      ...range,
      adminApiKey: process.env.OPENAI_ADMIN_API_KEY ?? '',
      supabaseUrl: process.env.VITE_SUPABASE_URL ?? '',
      supabasePublishableKey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
      accessToken,
    })
    sendJson(response, 200, report)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Provider recovery import failed.'
    sendJson(response, 502, { error: message })
  }
}
