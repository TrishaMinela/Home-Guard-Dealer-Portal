/** http(s) only. javascript:, data:, and other schemes are rejected. */
const HTTP_URL = /^https?:\/\/\S+$/i
const MAX_LOGO_WEBSITE_LENGTH = 2000

function hasControlCharacter(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 31 || code === 127) return true
  }
  return false
}

export type LogoWebsiteResult = { url: string | null; error: string | null }

export function normalizeLogoWebsiteUrl(value: string | null | undefined): LogoWebsiteResult {
  const trimmed = (value ?? '').trim()
  if (!trimmed) return { url: null, error: null }
  if (trimmed.length > MAX_LOGO_WEBSITE_LENGTH || hasControlCharacter(trimmed) || !HTTP_URL.test(trimmed)) {
    return { url: null, error: 'Enter an http:// or https:// website address.' }
  }
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { url: null, error: 'Enter an http:// or https:// website address.' }
    }
  } catch {
    return { url: null, error: 'Enter an http:// or https:// website address.' }
  }
  return { url: trimmed, error: null }
}

/** Href-safe form of a logo website. Invalid values become null. */
export function logoWebsiteHref(value: string | null | undefined, fallback?: string | null): string | null {
  const explicit = normalizeLogoWebsiteUrl(value)
  const chosen = explicit.url ?? (fallback === undefined ? null : normalizeLogoWebsiteUrl(fallback).url)
  if (!chosen) return null
  return new URL(chosen).href
}

/** Logo 1 shows its saved address, or the company website when that address is empty. */
export function logoWebsiteFieldValue(explicit: string | null | undefined, fallback?: string | null) {
  const saved = explicit?.trim() ?? ''
  if (saved) return saved
  return fallback?.trim() ?? ''
}

export function logoWebsiteSaveError(error: unknown) {
  const message = error && typeof error === 'object' && 'message' in error
    ? String((error as { message?: unknown }).message ?? '')
    : error instanceof Error
      ? error.message
      : ''
  if (/update_my_dealer_logo_website_url|update_my_dealer_secondary_logo_website_url|logo_website_url|logo_secondary_website_url|schema cache/i.test(message)) {
    return 'Logo website addresses are not available until the logo website migration is applied.'
  }
  if (/http or https|22023|dealers_logo_website_url_check|dealers_logo_secondary_website_url_check/i.test(message)) {
    return 'Enter an http:// or https:// website address.'
  }
  return 'This website address was not saved.'
}
