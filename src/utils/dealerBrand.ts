import type { CSSProperties } from 'react'

export const DEFAULT_DEALER_PRIMARY = '#0d666c'
export const DEFAULT_DEALER_SECONDARY = '#f8d30e'

const hexColorPattern = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

export function normalizeBrandColor(value: string | null | undefined, fallback: string) {
  const candidate = value?.trim()
  if (!candidate || !hexColorPattern.test(candidate)) return fallback

  if (candidate.length === 4) {
    const [r, g, b] = candidate.slice(1).split('')
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }

  return candidate.toLowerCase()
}

function contrastColor(background: string) {
  const red = Number.parseInt(background.slice(1, 3), 16) / 255
  const green = Number.parseInt(background.slice(3, 5), 16) / 255
  const blue = Number.parseInt(background.slice(5, 7), 16) / 255
  const linearize = (channel: number) => channel <= 0.03928
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4
  const luminance = 0.2126 * linearize(red) + 0.7152 * linearize(green) + 0.0722 * linearize(blue)

  const whiteContrast = 1.05 / (luminance + 0.05)
  const darkContrast = (luminance + 0.05) / 0.05
  return darkContrast >= whiteContrast ? '#101718' : '#ffffff'
}

export function dealerInitials(companyName: string) {
  const initials = companyName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('')

  return initials || 'D'
}

function uniqueLogoCandidates(...values: Array<string | null>) {
  return values.filter((value, index, items): value is string => Boolean(value) && items.indexOf(value) === index)
}

export type DealerBrand = {
  dealerId: string
  companyName: string
  slug: string
  initials: string
  primary: string
  secondary: string
  primaryContrast: string
  secondaryContrast: string
  sidebarLogos: string[]
  mobileLogos: string[]
  themeStyle: CSSProperties
}

type DealerBrandSource = {
  id: string
  company_name: string
  slug: string
  logo_url: string | null
  logo_light_url: string | null
  primary_color: string | null
  secondary_color: string | null
}

export function getDealerBrand(dealer: DealerBrandSource): DealerBrand {
  const primary = normalizeBrandColor(dealer.primary_color, DEFAULT_DEALER_PRIMARY)
  const secondary = normalizeBrandColor(dealer.secondary_color, DEFAULT_DEALER_SECONDARY)

  return {
    dealerId: dealer.id,
    companyName: dealer.company_name,
    slug: dealer.slug,
    initials: dealerInitials(dealer.company_name),
    primary,
    secondary,
    primaryContrast: contrastColor(primary),
    secondaryContrast: contrastColor(secondary),
    sidebarLogos: uniqueLogoCandidates(dealer.logo_light_url, dealer.logo_url),
    mobileLogos: uniqueLogoCandidates(dealer.logo_url, dealer.logo_light_url),
    themeStyle: {
      '--dealer-primary': primary,
      '--dealer-secondary': secondary,
      '--dealer-primary-contrast': contrastColor(primary),
      '--dealer-secondary-contrast': contrastColor(secondary),
    } as CSSProperties,
  }
}
