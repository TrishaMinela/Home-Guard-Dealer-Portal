export const DOOR_BUILDER_PAGE_BACKGROUND = '#f5f7f7'
export const DOOR_BUILDER_HEADER_FALLBACK = '#05040b'
export const DOOR_BUILDER_PRIMARY_FALLBACK = '#0d666c'

const hexColorPattern = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

export type DealerLogoVariant = 'original' | 'light'

export type DealerLogoVariantSource = {
  logo_url?: string | null
  logo_light_url?: string | null
  logo_generated_light_url?: string | null
  logo_generated_light_usable?: boolean | null
  logo_header_variant?: string | null
  logo_pages_variant?: string | null
  primary_color?: string | null
  secondary_color?: string | null
}

function cleanUrl(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export function doorBuilderColor(value: string | null | undefined, fallback: string) {
  const candidate = value?.trim() ?? ''
  if (!hexColorPattern.test(candidate)) return fallback
  if (candidate.length === 4) {
    const [red, green, blue] = candidate.slice(1).split('')
    return `#${red}${red}${green}${green}${blue}${blue}`.toLowerCase()
  }
  return candidate.toLowerCase()
}

function relativeLuminance(color: string) {
  const channel = (start: number) => {
    const srgb = Number.parseInt(color.slice(start, start + 2), 16) / 255
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

export function isLightBrandColor(value: string) {
  if (!hexColorPattern.test(value) || value.length !== 7) return false
  const luminance = relativeLuminance(value)
  const contrastWithBlack = (luminance + 0.05) / 0.05
  const contrastWithWhite = 1.05 / (luminance + 0.05)
  return contrastWithBlack >= contrastWithWhite
}

export function coloredLogoNeedsNeutralPlate(background: string) {
  return !isLightBrandColor(background)
}

export function normalizeLogoVariant(value: string | null | undefined): DealerLogoVariant | null {
  return value === 'original' || value === 'light' ? value : null
}

export function resolveLightLogoUrl(dealer: DealerLogoVariantSource) {
  const custom = cleanUrl(dealer.logo_light_url)
  if (custom) return custom
  if (dealer.logo_generated_light_usable === true) return cleanUrl(dealer.logo_generated_light_url)
  return null
}

export function resolveVariantLogoUrl(dealer: DealerLogoVariantSource, variant: DealerLogoVariant | null) {
  if (variant === 'original') return cleanUrl(dealer.logo_url)
  if (variant === 'light') return resolveLightLogoUrl(dealer)
  return null
}

export type DoorBuilderLegacySurface = 'dark-header' | 'light-surface' | 'hero'

/**
 * Door Builder PR #11 keeps today's logo when logo_header_variant or
 * logo_pages_variant is null. A null usable flag still counts as the legacy
 * generated light logo there. The Portal does not offer that file until the
 * flag is true.
 */
export function doorBuilderLegacyLightLogo(dealer: DealerLogoVariantSource) {
  const custom = cleanUrl(dealer.logo_light_url)
  if (custom) return custom
  if (dealer.logo_generated_light_usable === false) return null
  return cleanUrl(dealer.logo_generated_light_url)
}

export function doorBuilderLogoWhenVariantUnset(dealer: DealerLogoVariantSource, surface: DoorBuilderLegacySurface) {
  const light = doorBuilderLegacyLightLogo(dealer)
  const original = cleanUrl(dealer.logo_url)
  if (surface === 'dark-header') return light || original
  return original || light
}

export function logoVariantWrite(header: DealerLogoVariant | null, pages: DealerLogoVariant | null) {
  return {
    logo_header_variant: normalizeLogoVariant(header),
    logo_pages_variant: normalizeLogoVariant(pages),
  }
}

export function generatedLightLogoMessage(usable: boolean | null, source: 'primary' | 'regenerate') {
  if (usable === true) {
    return source === 'primary'
      ? 'Primary logo and default light logo updated successfully.'
      : 'Default light logo generated successfully.'
  }
  return source === 'primary'
    ? 'Primary logo updated. The generated light logo is not readable enough to use as White/Light.'
    : 'A light logo was generated, but it is not readable enough to use as White/Light.'
}

export function lightLogoEyebrow(dealer: DealerLogoVariantSource) {
  if (cleanUrl(dealer.logo_light_url)) return 'Custom override'
  if (cleanUrl(dealer.logo_generated_light_url) && dealer.logo_generated_light_usable === true) return 'Generated default'
  if (cleanUrl(dealer.logo_generated_light_url)) return 'Generated, not usable'
  return 'Light logo'
}
