import type { IncomingMessage, ServerResponse } from 'node:http'
import { createClient } from '@supabase/supabase-js'
import { authorizeBillingAccessManager } from './_lib/authorizeBillingAccessManager.js'

type JsonResponse = ServerResponse<IncomingMessage> & { json?: (value: unknown) => void }
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function send(response: JsonResponse, status: number, value: unknown) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'private, no-store, max-age=0')
  if (response.json) response.json(value); else response.end(JSON.stringify(value))
}

export default async function handler(request: IncomingMessage, response: JsonResponse) {
  if (request.method !== 'GET') return send(response, 405, { error: 'Method not allowed.' })
  const authorization = Array.isArray(request.headers.authorization) ? request.headers.authorization[0] : request.headers.authorization
  const access = await authorizeBillingAccessManager(authorization)
  if (!access.authorized) return send(response, access.status, { error: access.message })

  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return send(response, 500, { error: 'Dealer marketing management is not configured.' })
  const dealerId = new URL(request.url ?? '/', 'https://portal.local').searchParams.get('dealerId') ?? ''
  if (!uuidPattern.test(dealerId)) return send(response, 400, { error: 'A valid dealer is required.' })

  try {
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await admin.from('dealers').select('id,company_name,slug,logo_url,logo_light_url,primary_contact_name,email,phone,website,address,city,state,zip,primary_color,secondary_color,is_active,created_at,requested_slug,slug_request_status,slug_requested_at,heading_font_family,heading_font_weight,heading_font_size,body_font_family,body_font_weight,body_font_size,custom_heading_font_url,custom_heading_font_name,custom_heading_font_weight,custom_body_font_url,custom_body_font_name,custom_body_font_weight').eq('id', dealerId).maybeSingle()
    if (error) throw error
    if (!data) return send(response, 404, { error: 'Dealer not found.' })
    return send(response, 200, { dealer: data })
  } catch (error) {
    console.error('Dealer marketing context lookup failed.', { message: error instanceof Error ? error.message : 'unknown' })
    return send(response, 500, { error: 'Dealer marketing information could not be loaded.' })
  }
}
