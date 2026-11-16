export type DealerLogoSource = {
  id: string
  company_name: string
  slug?: string
  logo_url: string | null
  logo_light_url: string | null
  logo_generated_light_url?: string | null
  logo_generated_light_usable?: boolean | null
  logo_black_url?: string | null
  logo_generated_black_url?: string | null
  logo_generated_black_usable?: boolean | null
}

export type DealerLogoVariantId = 'primary' | 'light-custom' | 'light-generated' | 'black-custom' | 'black-generated'

export type DealerLogoVariant = {
  id: DealerLogoVariantId
  label: string
  description: string
  url: string
}

function cleanUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export function automaticBannerLogo(dealer: DealerLogoSource): string | null {
  const customLight = cleanUrl(dealer.logo_light_url)
  if (customLight) return customLight
  if (dealer.logo_generated_light_usable === true) {
    const generatedLight = cleanUrl(dealer.logo_generated_light_url)
    if (generatedLight) return generatedLight
  }
  return cleanUrl(dealer.logo_url)
}

export function dealerLogoVariants(dealer: DealerLogoSource): DealerLogoVariant[] {
  const variants: DealerLogoVariant[] = []
  const primary = cleanUrl(dealer.logo_url)
  const customLight = cleanUrl(dealer.logo_light_url)
  const generatedLight = dealer.logo_generated_light_usable === true
    ? cleanUrl(dealer.logo_generated_light_url)
    : null
  if (primary) {
    variants.push({
      id: 'primary',
      label: 'Primary logo',
      description: 'The standard logo already saved for this dealership.',
      url: primary,
    })
  }
  if (customLight) {
    variants.push({
      id: 'light-custom',
      label: 'Light logo (custom)',
      description: 'The custom light logo uploaded for dark backgrounds.',
      url: customLight,
    })
  }
  if (generatedLight) {
    variants.push({
      id: 'light-generated',
      label: 'White logo (generated)',
      description: 'The generated white logo, included because it passed the readability check.',
      url: generatedLight,
    })
  }
  const customBlack = cleanUrl(dealer.logo_black_url)
  const generatedBlack = dealer.logo_generated_black_usable === true ? cleanUrl(dealer.logo_generated_black_url) : null
  if (customBlack) {
    variants.push({
      id: 'black-custom',
      label: 'Black logo (custom)',
      description: 'The custom black logo uploaded for light backgrounds.',
      url: customBlack,
    })
  }
  if (generatedBlack) {
    variants.push({
      id: 'black-generated',
      label: 'Black logo (generated)',
      description: 'The generated black logo, included because it passed the readability check.',
      url: generatedBlack,
    })
  }
  return variants
}

export const SAMPLE_BANNER_LOGOS = [
  {
    id: 'sample-wide',
    label: 'Sample wide logo',
    description: 'A wide transparent sample, for placement checks only.',
    url: '/marketing-banner-fixtures/samples/wide.png',
  },
  {
    id: 'sample-tall',
    label: 'Sample tall logo',
    description: 'A tall transparent sample, for placement checks only.',
    url: '/marketing-banner-fixtures/samples/tall.png',
  },
  {
    id: 'sample-square',
    label: 'Sample square logo',
    description: 'A square sample with transparent corners.',
    url: '/marketing-banner-fixtures/samples/square.png',
  },
  {
    id: 'sample-transparent',
    label: 'Sample transparent logo',
    description: 'A partially transparent sample so the banner shows through.',
    url: '/marketing-banner-fixtures/samples/transparent.png',
  },
] as const
