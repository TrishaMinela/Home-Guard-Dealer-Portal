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

/** Selected second-logo file only. A missing white or black file does not switch to another color. */
export function selectedSecondaryLogoUrl(
  dealer: DealerLogoVariantSource & {
    logo_secondary_url?: string | null
    logo_secondary_light_url?: string | null
    logo_secondary_generated_light_url?: string | null
    logo_secondary_generated_light_usable?: boolean | null
    logo_secondary_black_url?: string | null
    logo_secondary_generated_black_url?: string | null
    logo_secondary_generated_black_usable?: boolean | null
  },
  variant: DealerLogoVariant | null,
  surface: 'header' | 'hero',
): string | null {
  const second = secondaryLogoSource(dealer)
  if (variant === 'white') return resolveWhiteLogoUrl(second)
  if (variant === 'black') return resolveBlackLogoUrl(second)
  if (variant === 'original') return cleanUrl(second.logo_url)
  return previewLogoUrl(second, null, surface)
}

export type DoorBuilderPreviewSurface = 'home-header' | 'home-hero' | 'page-header' | 'find-my-door'

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
    logo_secondary_header_variant?: string | null
    logo_secondary_pages_variant?: string | null
  },
  surface: DoorBuilderPreviewSurface,
) {
  const placement = dealer.logo_placement === 'header' ? 'header' : 'hero'
  if (surface === 'home-header' && placement !== 'header') return null
  if (surface === 'home-hero' && placement !== 'hero') return null
  const pageVariant = surface === 'home-header' || surface === 'home-hero'
  const variant = normalizeLogoVariant(pageVariant ? dealer.logo_header_variant : dealer.logo_pages_variant)
  const secondaryChoice = normalizeLogoVariant(pageVariant ? dealer.logo_secondary_header_variant : dealer.logo_secondary_pages_variant)
  const primaryUrl = surface === 'home-hero'
    ? (variant ? resolveDisplayedLogo(dealer, variant) : doorBuilderLogoWhenVariantUnset(dealer, 'light-surface'))
    : previewLogoUrl(dealer, variant, 'header')
  const secondaryUrl = normalizeLogoDisplay(dealer.logo_display) === 'dual' && primaryUrl
    ? selectedSecondaryLogoUrl(dealer, secondaryChoice ?? variant, surface === 'home-hero' ? 'hero' : 'header')
    : null
  const background = surface === 'home-hero'
    ? '#ffffff'
    : surface === 'find-my-door'
      ? '#05040b'
      : doorBuilderHeaderSurface(dealer)
  const color = isLightBrandColor(background) || background === '#ffffff' ? '#101417' : '#ffffff'
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
 * A transparent file can be chosen on any background. Contrast does not disable a choice.
 * A missing file, a solid background, or a generated file that is unreadable or unchecked stays unavailable.
 */
export function logoVariantOffers(_surfaceIsLight: boolean, ink: { original: LogoInkStatus; white: LogoInkStatus; black: LogoInkStatus }): Record<DealerLogoVariant, LogoVariantOffer> {
  const available = (status: LogoInkStatus, missingReason: string) => offerFromInk(status, {
    allowWithoutContrast: true,
    blockedReason: null,
    missingReason,
    contrastReason: missingReason,
  })
  return {
    original: available(ink.original, 'Upload a primary logo before choosing Original.'),
    white: available(ink.white, `White is not offered. ${unreadableGenerated}`),
    black: available(ink.black, `Black is not offered. ${unreadableGenerated}`),
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

/** NULL means Logo 2 follows Logo 1 for that placement and uses Logo 2's own files. */
export function secondaryLogoVariantWrite(header: DealerLogoVariant | null, pages: DealerLogoVariant | null) {
  return {
    logo_secondary_header_variant: normalizeLogoVariant(header),
    logo_secondary_pages_variant: normalizeLogoVariant(pages),
  }
}

export type LogoVariantSavePlan =
  | { mode: 'primary'; fields: ReturnType<typeof logoVariantWrite> }
  | { mode: 'all'; fields: ReturnType<typeof logoVariantWrite> & ReturnType<typeof secondaryLogoVariantWrite> }

/** Single-logo dealers write Logo 1 only. Dual writes all four choices together. */
export function logoVariantSavePlan(
  display: string | null | undefined,
  header: DealerLogoVariant | null,
  pages: DealerLogoVariant | null,
  secondaryHeader: DealerLogoVariant | null,
  secondaryPages: DealerLogoVariant | null,
): LogoVariantSavePlan {
  const primary = logoVariantWrite(header, pages)
  if (normalizeLogoDisplay(display) !== 'dual') return { mode: 'primary', fields: primary }
  return { mode: 'all', fields: { ...primary, ...secondaryLogoVariantWrite(secondaryHeader, secondaryPages) } }
}

/** Saved choices to show again when a save fails, so the form matches the database. */
export function logoChoicesAfterFailedSave(dealer: {
  logo_header_variant?: string | null
  logo_pages_variant?: string | null
  logo_secondary_header_variant?: string | null
  logo_secondary_pages_variant?: string | null
}) {
  return {
    header: normalizeLogoVariant(dealer.logo_header_variant),
    pages: normalizeLogoVariant(dealer.logo_pages_variant),
    secondaryHeader: normalizeLogoVariant(dealer.logo_secondary_header_variant),
    secondaryPages: normalizeLogoVariant(dealer.logo_secondary_pages_variant),
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
