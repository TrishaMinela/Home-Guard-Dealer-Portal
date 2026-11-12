export type DealerLogoSource = {
  id: string
  company_name: string
  slug?: string
  logo_url: string | null
  logo_light_url: string | null
  logo_generated_light_url?: string | null
}

export type DealerLogoVariantId = 'primary' | 'light-custom' | 'light-generated'

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

export function dealerLogoVariants(dealer: DealerLogoSource): DealerLogoVariant[] {
  const variants: DealerLogoVariant[] = []
  const primary = cleanUrl(dealer.logo_url)
  const customLight = cleanUrl(dealer.logo_light_url)
  const generatedLight = cleanUrl(dealer.logo_generated_light_url)
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
      label: 'Light logo (generated)',
      description: 'The generated light logo created from the primary logo.',
      url: generatedLight,
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
