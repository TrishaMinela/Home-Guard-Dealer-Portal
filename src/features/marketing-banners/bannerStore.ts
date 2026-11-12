import { resolveMarketingBanners, type BannerLibraryData, type RemoteBannerInput } from './catalog.ts'
import type { BannerPlacement } from './placement.ts'
import { normalizePlacement } from './placement.ts'

export type BannerSaveResult =
  | { ok: true }
  | { ok: false; unavailable: boolean; message: string }

type BannerRow = {
  slot: number
  headline: string | null
  image_path: string | null
  image_width: number | null
  image_height: number | null
  placement: unknown
  placement_verified: boolean | null
}

const UNAVAILABLE = 'Banner template storage is not available yet. Apply the marketing banner migration before saving.'
const FORBIDDEN = 'Only Home Guard admins can change banner templates or placements.'

async function client() {
  const { supabase } = await import('../../lib/supabase')
  return supabase
}

function unavailable(error: { code?: string; message?: string } | null): boolean {
  const code = error?.code ?? ''
  const message = error?.message ?? ''
  return code === '42P01' || code === 'PGRST205' || code === 'PGRST204' || /schema cache|relation|bucket|not found/i.test(message)
}

export async function loadMarketingBanners(): Promise<BannerLibraryData> {
  try {
    const supabase = await client()
    const { data, error } = await supabase
      .from('marketing_banner_templates')
      .select('slot,headline,image_path,image_width,image_height,placement,placement_verified')
      .order('slot')
    if (error || !data) return resolveMarketingBanners(null)
    const rows = await Promise.all((data as BannerRow[]).map(async (row) => {
      let imageUrl: string | null = null
      if (row.image_path) {
        const signed = await supabase.storage.from('marketing-banner-templates').createSignedUrl(row.image_path, 60 * 30)
        imageUrl = signed.data?.signedUrl ?? null
      }
      const remote: RemoteBannerInput = {
        slot: row.slot,
        headline: row.headline,
        imageUrl,
        imageWidth: row.image_width,
        imageHeight: row.image_height,
        placement: row.placement,
        placementVerified: row.placement_verified,
      }
      return remote
    }))
    return resolveMarketingBanners(rows)
  } catch (error) {
    console.warn('Marketing banner templates fell back to demo fixtures.', error instanceof Error ? error.name : 'unavailable')
    return resolveMarketingBanners(null)
  }
}

async function postBannerUpdate(body: Record<string, unknown>): Promise<'ok' | 'forbidden' | 'unavailable'> {
  const supabase = await client()
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return 'forbidden'
  const response = await fetch('/api/marketing-banners', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const contentType = response.headers.get('content-type') ?? ''
  if (response.status === 401 || response.status === 403) return 'forbidden'
  if (!response.ok || !contentType.includes('application/json')) return 'unavailable'
  const result = await response.json() as { ok?: boolean; unavailable?: boolean }
  if (result.ok === true) return 'ok'
  if (result.unavailable) return 'unavailable'
  return 'unavailable'
}

async function savePlacementWithSession(slot: number, placement: BannerPlacement, placementVerified: boolean): Promise<BannerSaveResult> {
  try {
    const supabase = await client()
    const { error } = await supabase
      .from('marketing_banner_templates')
      .update({ placement, placement_verified: placementVerified })
      .eq('slot', slot)
    if (!error) return { ok: true }
    if (error.code === '42501') return { ok: false, unavailable: false, message: FORBIDDEN }
    if (unavailable(error)) return { ok: false, unavailable: true, message: UNAVAILABLE }
    return { ok: false, unavailable: true, message: UNAVAILABLE }
  } catch {
    return { ok: false, unavailable: true, message: UNAVAILABLE }
  }
}

export async function saveMarketingBannerPlacement(input: {
  slot: number
  placement: BannerPlacement
  placementVerified: boolean
}): Promise<BannerSaveResult> {
  const placement = normalizePlacement(input.placement)
  if (!placement) return { ok: false, unavailable: false, message: 'That placement is outside the template.' }
  const apiResult = await postBannerUpdate({
    slot: input.slot,
    placement,
    placementVerified: input.placementVerified,
  })
  if (apiResult === 'ok') return { ok: true }
  if (apiResult === 'forbidden') return { ok: false, unavailable: false, message: FORBIDDEN }
  return savePlacementWithSession(input.slot, placement, input.placementVerified)
}

function extensionFor(file: File): string | null {
  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/jpeg') return 'jpg'
  if (file.type === 'image/webp') return 'webp'
  return null
}

export async function saveMarketingBannerImage(input: {
  slot: number
  file: File
  width: number
  height: number
}): Promise<BannerSaveResult & { previewUrl?: string }> {
  if (input.slot < 1 || input.slot > 8) return { ok: false, unavailable: false, message: 'Choose a banner from 1 to 8.' }
  const extension = extensionFor(input.file)
  if (!extension) return { ok: false, unavailable: false, message: 'Upload a PNG, JPEG, or WebP template.' }
  if (input.file.size > 15 * 1024 * 1024) return { ok: false, unavailable: false, message: 'Template images must be 15 MB or smaller.' }
  if (input.width < 1 || input.height < 1) return { ok: false, unavailable: false, message: 'The template image could not be read.' }
  const path = `${input.slot}/template.${extension}`
  try {
    const supabase = await client()
    const { error: uploadError } = await supabase.storage
      .from('marketing-banner-templates')
      .upload(path, input.file, { contentType: input.file.type, upsert: true })
    if (uploadError) {
      if (unavailable(uploadError) || /row-level security|not authorized|403/i.test(uploadError.message)) {
        const denied = /row-level security|not authorized|403/i.test(uploadError.message)
        return { ok: false, unavailable: !denied, message: denied ? FORBIDDEN : UNAVAILABLE }
      }
      return { ok: false, unavailable: true, message: UNAVAILABLE }
    }
    const apiResult = await postBannerUpdate({
      slot: input.slot,
      imagePath: path,
      imageWidth: input.width,
      imageHeight: input.height,
    })
    if (apiResult === 'forbidden') return { ok: false, unavailable: false, message: FORBIDDEN }
    if (apiResult === 'ok') return { ok: true, previewUrl: URL.createObjectURL(input.file) }
    const { error } = await supabase
      .from('marketing_banner_templates')
      .update({ image_path: path, image_width: input.width, image_height: input.height })
      .eq('slot', input.slot)
    if (!error) return { ok: true, previewUrl: URL.createObjectURL(input.file) }
    if (error.code === '42501') return { ok: false, unavailable: false, message: FORBIDDEN }
    return { ok: false, unavailable: true, message: UNAVAILABLE }
  } catch {
    return { ok: false, unavailable: true, message: UNAVAILABLE }
  }
}
