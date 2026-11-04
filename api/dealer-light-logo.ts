import type { IncomingMessage, ServerResponse } from 'node:http'
import { createClient } from '@supabase/supabase-js'
import { generateWhiteLogo, validatePrimaryLogoUrl } from './_lib/dealerLightLogo.js'

type JsonResponse = ServerResponse<IncomingMessage> & { json?: (value: unknown) => void }
type Body = { dealerId?: string }
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function send(response: JsonResponse, status: number, value: unknown) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'private, no-store, max-age=0')
  if (response.json) response.json(value); else response.end(JSON.stringify(value))
}

async function readBody(request: IncomingMessage): Promise<Body> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  if (chunks.reduce((total, chunk) => total + chunk.length, 0) > 4096) throw new Error('Request is too large.')
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) as Body : {}
}

function bearerToken(request: IncomingMessage): string | null {
  const value = Array.isArray(request.headers.authorization) ? request.headers.authorization[0] : request.headers.authorization
  return value?.match(/^Bearer\s+([^\s]+)$/i)?.[1] ?? null
}

export default async function handler(request: IncomingMessage, response: JsonResponse) {
  if (request.method !== 'POST') return send(response, 405, { error: 'Method not allowed.' })
  const token = bearerToken(request)
  if (!token) return send(response, 401, { error: 'Authentication required.' })
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return send(response, 500, { error: 'Dealer logo processing is not configured.' })

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  try {
    const body = await readBody(request)
    if (!body.dealerId || !uuidPattern.test(body.dealerId)) return send(response, 400, { error: 'A valid dealer is required.' })
    const { data: userData, error: userError } = await admin.auth.getUser(token)
    if (userError || !userData.user) return send(response, 401, { error: 'Authentication required.' })

    const [homeGuard, membership, dealerResult] = await Promise.all([
      admin.from('home_guard_admins').select('id').eq('user_id', userData.user.id).maybeSingle(),
      admin.from('dealer_users').select('id').eq('user_id', userData.user.id).eq('dealer_id', body.dealerId).maybeSingle(),
      admin.from('dealers').select('id,logo_url').eq('id', body.dealerId).maybeSingle(),
    ])
    const lookupError = homeGuard.error ?? membership.error ?? dealerResult.error
    if (lookupError) throw lookupError
    if (!homeGuard.data && !membership.data) return send(response, 403, { error: 'Dealer logo access required.' })
    if (!dealerResult.data) return send(response, 404, { error: 'Dealer not found.' })
    if (!dealerResult.data.logo_url) return send(response, 409, { error: 'Upload a primary logo first.' })

    const primaryUrl = validatePrimaryLogoUrl(dealerResult.data.logo_url, body.dealerId, supabaseUrl)
    const sourceResponse = await fetch(primaryUrl, { signal: AbortSignal.timeout(15_000) })
    if (!sourceResponse.ok) throw new Error(`Primary logo download failed (${sourceResponse.status}).`)
    const source = Buffer.from(await sourceResponse.arrayBuffer())
    const generated = await generateWhiteLogo(source)
    const objectPath = `${body.dealerId}/logo-generated-light.png`
    const { error: uploadError } = await admin.storage.from('dealer-logos').upload(objectPath, generated, { contentType: 'image/png', upsert: true })
    if (uploadError) throw uploadError
    const { data: publicUrl } = admin.storage.from('dealer-logos').getPublicUrl(objectPath)
    const generatedLightLogoUrl = `${publicUrl.publicUrl}?v=${Date.now()}`
    const { error: updateError } = await admin.from('dealers').update({ logo_generated_light_url: generatedLightLogoUrl }).eq('id', body.dealerId)
    if (updateError) throw updateError
    return send(response, 200, { generatedLightLogoUrl })
  } catch (error) {
    console.error('Dealer light-logo generation failed.', { message: error instanceof Error ? error.message : 'unknown' })
    return send(response, 500, { error: 'We could not generate the default light logo. Please try again.' })
  }
}
