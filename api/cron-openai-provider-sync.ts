import { timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { runOpenAiProviderSync } from './_lib/runOpenAiProviderSync.js'

type JsonResponse = ServerResponse<IncomingMessage> & { json?: (value: unknown) => void }

function sendJson(response: JsonResponse, status: number, value: unknown): void {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'private, no-store, max-age=0')
  if (response.json) response.json(value)
  else response.end(JSON.stringify(value))
}

function authorized(value: string | undefined, secret: string): boolean {
  const supplied = value?.match(/^Bearer\s+(.+)$/i)?.[1] ?? ''
  if (!secret || supplied.length !== secret.length) return false
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(secret))
}

export default async function handler(request: IncomingMessage, response: JsonResponse): Promise<void> {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    sendJson(response, 405, { error: 'Method not allowed.' })
    return
  }
  const authorization = Array.isArray(request.headers.authorization) ? request.headers.authorization[0] : request.headers.authorization
  if (!authorized(authorization, process.env.CRON_SECRET ?? '')) {
    sendJson(response, 401, { error: 'Authentication required.' })
    return
  }
  try {
    const report = await runOpenAiProviderSync()
    sendJson(response, report.status === 'conflict' ? 409 : 200, report)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Provider synchronization failed.'
    sendJson(response, 502, { error: message })
  }
}
