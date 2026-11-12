import type { IncomingMessage, ServerResponse } from 'node:http'
import { createClient } from '@supabase/supabase-js'
import { authorizeHgiAdmin } from './_lib/authorizeHgiAdmin.js'
import { normalizePlacement } from '../src/features/marketing-banners/placement.js'

type JsonResponse = ServerResponse<IncomingMessage> & { json?: (value: unknown) => void }
type Body = {
  slot?: number
  placement?: unknown
  placementVerified?: boolean
  imagePath?: string
  imageWidth?: number
  imageHeight?: number
}

const imagePathPattern = /^([1-8])\/template\.(png|jpe?g|webp)$/

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
  if (chunks.reduce((total, chunk) => total + chunk.length, 0) > 32_768) throw new Error('Request is too large.')
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) as Body : {}
}

function unavailable(error: { code?: string; message?: string } | null) {
  const code = error?.code ?? ''
  const message = error?.message ?? ''
  return code === '42P01' || code === 'PGRST205' || /schema cache|relation|bucket|not found/i.test(message)
}

export default async function handler(request: IncomingMessage, response: JsonResponse) {
  if (request.method !== 'POST') return send(response, 405, { ok: false, error: 'Method not allowed.' })
  const authorization = Array.isArray(request.headers.authorization) ? request.headers.authorization[0] : request.headers.authorization
  const access = await authorizeHgiAdmin(authorization)
  if (!access.authorized) return send(response, access.status, { ok: false, error: access.message })

  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return send(response, 500, { ok: false, error: 'Banner template management is not configured.' })

  let body: Body
  try {
    body = await readBody(request)
  } catch {
    return send(response, 400, { ok: false, error: 'The banner update could not be read.' })
  }

  const slot = body.slot
  if (typeof slot !== 'number' || !Number.isInteger(slot) || slot < 1 || slot > 8) {
    return send(response, 400, { ok: false, error: 'A banner from 1 to 8 is required.' })
  }

  const update: Record<string, unknown> = { updated_by: access.userId }
  if (body.placement !== undefined) {
    const placement = normalizePlacement(body.placement)
    if (!placement) return send(response, 400, { ok: false, error: 'That placement is outside the template.' })
    update.placement = placement
    update.placement_verified = body.placementVerified === true
  }
  if (body.imagePath !== undefined || body.imageWidth !== undefined || body.imageHeight !== undefined) {
    const match = typeof body.imagePath === 'string' ? imagePathPattern.exec(body.imagePath) : null
    if (!match || Number(match[1]) !== slot) return send(response, 400, { ok: false, error: 'The template file path is not valid for this banner.' })
    if (typeof body.imageWidth !== 'number' || typeof body.imageHeight !== 'number' || body.imageWidth < 1 || body.imageHeight < 1 || body.imageWidth > 8000 || body.imageHeight > 8000) {
      return send(response, 400, { ok: false, error: 'The template dimensions are not valid.' })
    }
    update.image_path = body.imagePath
    update.image_width = Math.round(body.imageWidth)
    update.image_height = Math.round(body.imageHeight)
  }
  if (Object.keys(update).length === 1) return send(response, 400, { ok: false, error: 'A placement or template image is required.' })

  try {
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
    if (typeof update.image_path === 'string') {
      const folder = String(slot)
      const { data: objects, error: listError } = await admin.storage.from('marketing-banner-templates').list(folder, { search: 'template' })
      if (listError) {
        if (unavailable(listError)) return send(response, 503, { ok: false, unavailable: true, error: 'Banner template storage is not available yet.' })
        throw listError
      }
      const filename = update.image_path.slice(folder.length + 1)
      if (!objects?.some((object) => object.name === filename)) {
        return send(response, 400, { ok: false, error: 'Upload the template image before saving it.' })
      }
    }
    const { data, error } = await admin
      .from('marketing_banner_templates')
      .update(update)
      .eq('slot', slot)
      .select('slot')
      .maybeSingle()
    if (error) {
      if (unavailable(error)) return send(response, 503, { ok: false, unavailable: true, error: 'Banner template storage is not available yet.' })
      throw error
    }
    if (!data) return send(response, 404, { ok: false, error: 'That banner template was not found.' })
    return send(response, 200, { ok: true })
  } catch (error) {
    console.error('Marketing banner template update failed.', { message: error instanceof Error ? error.message : 'unknown' })
    return send(response, 500, { ok: false, error: 'The banner template could not be saved.' })
  }
}
