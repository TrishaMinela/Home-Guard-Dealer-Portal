import { normalizePlacement, type BannerPlacement } from './placement.ts'

export type BannerCategory = 'landscape' | 'square'

export type MarketingBannerDefinition = {
  slot: number
  category: BannerCategory
  headline: string
  width: number
  height: number
  placement: BannerPlacement
  /** Approximate region. These are unverified defaults for Phase 1. */
  region: string
}

export const MARKETING_BANNERS: readonly MarketingBannerDefinition[] = [
  {
    slot: 1,
    category: 'landscape',
    headline: 'Build a Door Made for Your Home',
    width: 851,
    height: 315,
    region: 'upper left',
    placement: { x: 4, y: 8, width: 34, height: 36, padding: 2, maxLogoWidth: null, maxLogoHeight: null },
  },
  {
    slot: 2,
    category: 'landscape',
    headline: 'Your Home. Your Style. Your Door.',
    width: 851,
    height: 315,
    region: 'lower right',
    placement: { x: 62, y: 54, width: 34, height: 38, padding: 2, maxLogoWidth: null, maxLogoHeight: null },
  },
  {
    slot: 3,
    category: 'landscape',
    headline: 'A New Look Starts at Your Door',
    width: 851,
    height: 315,
    region: 'lower right',
    placement: { x: 60, y: 56, width: 36, height: 36, padding: 2, maxLogoWidth: null, maxLogoHeight: null },
  },
  {
    slot: 4,
    category: 'landscape',
    headline: 'See Your Vision Come to Life',
    width: 851,
    height: 315,
    region: 'lower right',
    placement: { x: 58, y: 50, width: 38, height: 42, padding: 2, maxLogoWidth: null, maxLogoHeight: null },
  },
  {
    slot: 5,
    category: 'square',
    headline: 'Build a Door Made for Your Home',
    width: 1024,
    height: 1024,
    region: 'upper area, slightly left of center',
    placement: { x: 30, y: 6, width: 32, height: 18, padding: 1.5, maxLogoWidth: null, maxLogoHeight: null },
  },
  {
    slot: 6,
    category: 'square',
    headline: 'Your Home. Your Style. Your Door.',
    width: 1024,
    height: 1024,
    region: 'lower left',
    placement: { x: 5, y: 74, width: 36, height: 20, padding: 1.5, maxLogoWidth: null, maxLogoHeight: null },
  },
  {
    slot: 7,
    category: 'square',
    headline: 'A New Look Starts at Your Door',
    width: 1024,
    height: 1024,
    region: 'left side, above the headline',
    placement: { x: 5, y: 24, width: 32, height: 16, padding: 1.5, maxLogoWidth: null, maxLogoHeight: null },
  },
  {
    slot: 8,
    category: 'square',
    headline: 'See Your Vision Come to Life',
    width: 1024,
    height: 1024,
    region: 'upper right',
    placement: { x: 62, y: 6, width: 32, height: 18, padding: 1.5, maxLogoWidth: null, maxLogoHeight: null },
  },
]

export function fixtureImageUrl(slot: number): string {
  const definition = MARKETING_BANNERS.find((item) => item.slot === slot)
  const shape = definition?.category ?? 'landscape'
  return `/marketing-banner-fixtures/banner-${String(slot).padStart(2, '0')}-${shape}.png`
}

export type RemoteBannerInput = {
  slot: number
  headline?: string | null
  imageUrl?: string | null
  imageWidth?: number | null
  imageHeight?: number | null
  placement?: unknown
  placementVerified?: boolean | null
}

export type ResolvedMarketingBanner = {
  slot: number
  category: BannerCategory
  headline: string
  width: number
  height: number
  region: string
  placement: BannerPlacement
  placementVerified: boolean
  placementLabel: string
  imageUrl: string
  imageSource: 'fixture' | 'storage'
}

export type BannerLibraryData = {
  templates: ResolvedMarketingBanner[]
  source: 'remote' | 'fixtures'
  notice: string | null
}

const FIXTURE_NOTICE = 'Demo templates are shown until Home Guard publishes the final artwork. Logo positions are unverified defaults until an admin sets them.'

function fixtureBanner(definition: MarketingBannerDefinition): ResolvedMarketingBanner {
  return {
    slot: definition.slot,
    category: definition.category,
    headline: definition.headline,
    width: definition.width,
    height: definition.height,
    region: definition.region,
    placement: definition.placement,
    placementVerified: false,
    placementLabel: `Unverified default · ${definition.region}`,
    imageUrl: fixtureImageUrl(definition.slot),
    imageSource: 'fixture',
  }
}

function mergeBanner(definition: MarketingBannerDefinition, remote: RemoteBannerInput | undefined): ResolvedMarketingBanner {
  const fallback = fixtureBanner(definition)
  if (!remote) return fallback
  const placement = normalizePlacement(remote.placement) ?? definition.placement
  const imageUrl = remote.imageUrl?.trim() ? remote.imageUrl.trim() : fallback.imageUrl
  const imageSource = remote.imageUrl?.trim() ? 'storage' as const : 'fixture' as const
  const width = imageSource === 'storage' && remote.imageWidth && remote.imageWidth > 0 ? remote.imageWidth : definition.width
  const height = imageSource === 'storage' && remote.imageHeight && remote.imageHeight > 0 ? remote.imageHeight : definition.height
  const headline = remote.headline?.trim() ? remote.headline.trim() : definition.headline
  const placementVerified = remote.placementVerified === true
  return {
    ...fallback,
    headline,
    width,
    height,
    placement,
    placementVerified,
    placementLabel: placementVerified ? 'Verified placement' : `Unverified placement · ${definition.region}`,
    imageUrl,
    imageSource,
  }
}

export function resolveMarketingBanners(remote: RemoteBannerInput[] | null): BannerLibraryData {
  if (!remote) {
    return {
      source: 'fixtures',
      notice: FIXTURE_NOTICE,
      templates: MARKETING_BANNERS.map(fixtureBanner),
    }
  }
  const templates = MARKETING_BANNERS.map((definition) => mergeBanner(definition, remote.find((item) => item.slot === definition.slot)))
  const usingDemoArt = templates.some((item) => item.imageSource === 'fixture')
  return {
    source: 'remote',
    notice: usingDemoArt
      ? 'Template records are available. Slots without a clean upload still show the labeled demo fixture. Placements stay unverified until an admin marks them.'
      : null,
    templates,
  }
}

export function bannersInCategory(templates: readonly ResolvedMarketingBanner[], category: BannerCategory) {
  return templates.filter((item) => item.category === category)
}
