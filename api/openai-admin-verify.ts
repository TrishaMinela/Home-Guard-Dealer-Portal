import type { IncomingMessage, ServerResponse } from 'node:http'
import { authorizeHgiAdmin } from './_lib/authorizeHgiAdmin.ts'
import { verifyOpenAiAdminConnection } from './_lib/openaiAdminVerification.ts'

type JsonResponse = ServerResponse<IncomingMessage> & {
  json?: (value: unknown) => void
}

function sendJson(response: JsonResponse, status: number, value: unknown): void {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'private, no-store, max-age=0')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  if (response.json) response.json(value)
  else response.end(JSON.stringify(value))
}

export default async function handler(
  request: IncomingMessage,
  response: JsonResponse,
): Promise<void> {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    sendJson(response, 405, { error: 'Method not allowed.' })
    return
  }

  const authorization = Array.isArray(request.headers.authorization)
    ? request.headers.authorization[0]
    : request.headers.authorization
  const access = await authorizeHgiAdmin(authorization)
  if (!access.authorized) {
    sendJson(response, access.status, { error: access.message })
    return
  }

  const report = await verifyOpenAiAdminConnection({
    adminApiKey: process.env.OPENAI_ADMIN_API_KEY ?? '',
  })
  const status = report.authentication.verified && report.errors.length === 0 ? 200 : 502
  sendJson(response, status, report)
}
