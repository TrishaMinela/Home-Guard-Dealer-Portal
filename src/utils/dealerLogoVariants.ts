export const DOOR_BUILDER_PAGE_BACKGROUND = '#f5f7f7'
export const DOOR_BUILDER_HEADER_FALLBACK = '#05040b'
export const DOOR_BUILDER_PRIMARY_FALLBACK = '#0d666c'

const hexColorPattern = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

export type DealerLogoVariant = 'original' | 'black' | 'white'

export type DealerLogoVariantSource = {
  logo_url?: string | null
  logo_source_url?: string | null
  logo_light_url?: string | null
  logo_generated_light_url?: string | null
  logo_generated_light_usable?: boolean | null
  logo_black_url?: string | null
  logo_generated_black_url?: string | null
  logo_generated_black_usable?: boolean | null
  logo_header_variant?: string | null
  logo_pages_variant?: string | null
  logo_placement?: string | null
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

export function normalizeLogoVariant(value: string | null | undefined): DealerLogoVariant | null {
  return value === 'original' || value === 'black' || value === 'white' ? value : null
}

export type DealerLogoDisplay = 'single' | 'dual'

export function normalizeLogoDisplay(value: string | null | undefined): DealerLogoDisplay {
  return value === 'dual' ? 'dual' : 'single'
}

export function secondaryLogoSource(dealer: DealerLogoVariantSource & {
  logo_secondary_url?: string | null
  logo_secondary_light_url?: string | null
  logo_secondary_generated_light_url?: string | null
  logo_secondary_generated_light_usable?: boolean | null
  logo_secondary_black_url?: string | null
  logo_secondary_generated_black_url?: string | null
  logo_secondary_generated_black_usable?: boolean | null
}): DealerLogoVariantSource {
  return {
    ...dealer,
    logo_url: dealer.logo_secondary_url,
    logo_light_url: dealer.logo_secondary_light_url,
    logo_generated_light_url: dealer.logo_secondary_generated_light_url,
    logo_generated_light_usable: dealer.logo_secondary_generated_light_usable,
    logo_black_url: dealer.logo_secondary_black_url,
    logo_generated_black_url: dealer.logo_secondary_generated_black_url,
    logo_generated_black_usable: dealer.logo_secondary_generated_black_usable,
  }
}

/** Same decision as Door Builder secondaryLogoUrlForSurface. A missing file does not fall back to another color. */
export function secondaryLogoUrlForSurface(input: {
  variant: DealerLogoVariant | null
  surfaceIsDark: boolean
  originalUrl: string | null
  whiteUrl: string | null
  blackUrl: string | null
}): string | null {
  if (input.variant === 'white') return input.surfaceIsDark ? input.whiteUrl : null
  if (input.variant === 'black') return input.surfaceIsDark ? null : input.blackUrl
  if (input.variant === 'original') return input.originalUrl
  return input.surfaceIsDark ? input.whiteUrl : input.originalUrl
}

export type DoorBuilderPreviewSurface = 'home-header' | 'home-hero' | 'page-header'

export function doorBuilderLogoPreview(
  dealer: DealerLogoVariantSource & {
    logo_display?: string | null
    logo_placement?: string | null
    logo_secondary_url?: string | null
    logo_secondary_light_url?: string | null
    logo_secondary_generated_light_url?: string | null
    logo_secondary_generated_light_usable?: boolean | null
    logo_secondary_black_url?: string | null
    logo_secondary_generated_black_url?: string | null
    logo_secondary_generated_black_usable?: boolean | null
  },
  surface: DoorBuilderPreviewSurface,
) {
  const placement = dealer.logo_placement === 'header' ? 'header' : 'hero'
  if (surface === 'home-header' && placement !== 'header') return null
  if (surface === 'home-hero' && placement !== 'hero') return null
  const variant = normalizeLogoVariant(surface === 'page-header' ? dealer.logo_pages_variant : dealer.logo_header_variant)
  const headerDark = !isLightBrandColor(doorBuilderHeaderSurface(dealer))
  const primaryUrl = surface === 'home-hero'
    ? (variant ? resolveDisplayedLogo(dealer, variant) : doorBuilderLogoWhenVariantUnset(dealer, 'light-surface'))
    : previewLogoUrl(dealer, variant, 'header')
  const heroDark = surface === 'home-hero' && (
    (variant === 'white' && Boolean(resolveWhiteLogoUrl(dealer)))
    || (!variant && !cleanUrl(dealer.logo_url) && Boolean(doorBuilderLegacyLightLogo(dealer)))
  )
  const surfaceIsDark = surface === 'home-hero' ? heroDark : headerDark
  const second = secondaryLogoSource(dealer)
  const secondaryUrl = normalizeLogoDisplay(dealer.logo_display) === 'dual' && primaryUrl
    ? secondaryLogoUrlForSurface({
      variant,
      surfaceIsDark,
      originalUrl: cleanUrl(second.logo_url),
      whiteUrl: resolveWhiteLogoUrl(second),
      blackUrl: resolveBlackLogoUrl(second),
    })
    : null
  const background = surface === 'home-hero' ? (heroDark ? '#111827' : '#ffffff') : doorBuilderHeaderSurface(dealer)
  const color = surfaceIsDark ? '#ffffff' : '#101417'
  return { primaryUrl, secondaryUrl, showPair: Boolean(secondaryUrl), background, color }
}

export function previewLogoUrl(dealer: DealerLogoVariantSource, variant: DealerLogoVariant | null, surface: 'header' | 'hero') {
  if (variant) return resolveDisplayedLogo(dealer, variant)
  const headerIsLight = isLightBrandColor(doorBuilderHeaderSurface(dealer))
  if (surface === 'hero') return doorBuilderLogoWhenVariantUnset(dealer, 'light-surface')
  return doorBuilderLogoWhenVariantUnset(dealer, headerIsLight ? 'light-surface' : 'dark-header')
}

export function resolveWhiteLogoUrl(dealer: DealerLogoVariantSource) {
  const custom = cleanUrl(dealer.logo_light_url)
  if (custom) return custom
  if (dealer.logo_generated_light_usable === true) return cleanUrl(dealer.logo_generated_light_url)
  return null
}

export function resolveBlackLogoUrl(dealer: DealerLogoVariantSource) {
  const custom = cleanUrl(dealer.logo_black_url)
  if (custom) return custom
  if (dealer.logo_generated_black_usable === true) return cleanUrl(dealer.logo_generated_black_url)
  return null
}

export function resolveLightLogoUrl(dealer: DealerLogoVariantSource) {
  return resolveWhiteLogoUrl(dealer)
}

export function resolveVariantLogoUrl(dealer: DealerLogoVariantSource, variant: DealerLogoVariant | null) {
  if (variant === 'original') return cleanUrl(dealer.logo_url)
  if (variant === 'white') return resolveWhiteLogoUrl(dealer)
  if (variant === 'black') return resolveBlackLogoUrl(dealer)
  return null
}

export function resolveDisplayedLogo(dealer: DealerLogoVariantSource, variant: DealerLogoVariant | null) {
  return resolveVariantLogoUrl(dealer, variant) ?? (variant ? cleanUrl(dealer.logo_url) : null)
}

/** Homepage header background. Door Builder paints `.dealer-cobranded > header` with the secondary color. */
export function doorBuilderHeaderSurface(dealer: DealerLogoVariantSource) {
  return doorBuilderColor(dealer.secondary_color, DOOR_BUILDER_HEADER_FALLBACK)
}

/**
 * Normal pages draw the logo in that same header, including when the homepage
 * logo is placed in the hero. The hero itself is a separate light surface and
 * is not this selector.
 */
export function doorBuilderPagesSurface(dealer: DealerLogoVariantSource) {
  return doorBuilderHeaderSurface(dealer)
}

export type LogoInkStatus = { transparent: boolean; contrasts: boolean; contrastingShare: number } | 'missing' | 'pending' | 'unreadable'

export type LogoVariantOffer = { enabled: boolean; reason: string | null }

const darkOriginalContrast = 'Original does not have enough contrast on this dark header. At least 30% of its opaque ink needs a 3:1 ratio against the header color.'
const solidBackground = 'This file still has a solid background, so it is not offered. Upload it again to save a transparent PNG.'
const unreadableGenerated = 'A generated file is offered only when it is marked readable. An unreadable or unchecked file is never selected.'

function offerFromInk(
  status: LogoInkStatus,
  options: { allowWithoutContrast: boolean; blockedReason: string | null; missingReason: string; contrastReason: string },
): LogoVariantOffer {
  if (options.blockedReason) return { enabled: false, reason: options.blockedReason }
  if (status === 'missing') return { enabled: false, reason: options.missingReason }
  if (status === 'pending') return { enabled: false, reason: 'Checking this logo against the header color.' }
  if (status === 'unreadable') return { enabled: false, reason: 'This logo could not be checked, so it is not offered.' }
  if (!status.transparent) return { enabled: false, reason: solidBackground }
  if (!options.allowWithoutContrast && !status.contrasts) return { enabled: false, reason: options.contrastReason }
  return { enabled: true, reason: null }
}

/**
 * Dark header: Original when its ink already contrasts, plus a readable transparent White.
 * Light header: Original and Black by default. White and Black that fail the surface are disabled.
 */
export function logoVariantOffers(surfaceIsLight: boolean, ink: { original: LogoInkStatus; white: LogoInkStatus; black: LogoInkStatus }): Record<DealerLogoVariant, LogoVariantOffer> {
  const lightBlocked = 'White is turned off on this light header because white ink does not contrast with it.'
  const darkBlocked = 'Black is turned off on this dark header because black ink does not contrast with it.'
  if (surfaceIsLight) {
    return {
      original: offerFromInk(ink.original, { allowWithoutContrast: true, blockedReason: null, missingReason: 'Upload a primary logo before choosing Original.', contrastReason: darkOriginalContrast }),
      black: offerFromInk(ink.black, { allowWithoutContrast: true, blockedReason: null, missingReason: `Black is not offered. ${unreadableGenerated}`, contrastReason: darkOriginalContrast }),
      white: offerFromInk(ink.white, { allowWithoutContrast: false, blockedReason: lightBlocked, missingReason: lightBlocked, contrastReason: lightBlocked }),
    }
  }
  return {
    original: offerFromInk(ink.original, { allowWithoutContrast: false, blockedReason: null, missingReason: 'Upload a primary logo before choosing Original.', contrastReason: darkOriginalContrast }),
    white: offerFromInk(ink.white, { allowWithoutContrast: false, blockedReason: null, missingReason: `White is not offered. ${unreadableGenerated}`, contrastReason: 'White does not have enough contrast on this header.' }),
    black: offerFromInk(ink.black, { allowWithoutContrast: false, blockedReason: darkBlocked, missingReason: darkBlocked, contrastReason: darkBlocked }),
  }
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
