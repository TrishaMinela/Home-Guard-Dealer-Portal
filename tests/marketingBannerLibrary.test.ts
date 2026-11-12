import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { MARKETING_BANNERS, resolveMarketingBanners } from '../src/features/marketing-banners/catalog.ts'
import { marketingBannerFilename, slugifyBannerText } from '../src/features/marketing-banners/filename.ts'
import { dealerLogoVariants } from '../src/features/marketing-banners/logos.ts'
import {
  bannerCompositePlan,
  containLogoRect,
  editPlacement,
  imageNeedsCors,
  normalizePlacement,
  placementAfterDrag,
  placementPaddingPixels,
  placementRectPixels,
} from '../src/features/marketing-banners/placement.ts'
import { canManageMarketingBannerTemplates, canUseDealerLogo } from '../src/features/marketing-banners/permissions.ts'
import type { BannerPlacement } from '../src/features/marketing-banners/placement.ts'

const samplePlacement: BannerPlacement = {
  x: 10,
  y: 20,
  width: 40,
  height: 50,
  padding: 4,
  maxLogoWidth: null,
  maxLogoHeight: null,
}

function close(actual: number, expected: number, epsilon = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} is not within ${epsilon} of ${expected}`)
}

function closeRect(actual: { x: number; y: number; width: number; height: number }, expected: { x: number; y: number; width: number; height: number }) {
  close(actual.x, expected.x)
  close(actual.y, expected.y)
  close(actual.width, expected.width)
  close(actual.height, expected.height)
}

test('percent placement converts to pixels of the original template', () => {
  closeRect(placementRectPixels(samplePlacement, 1000, 500), { x: 100, y: 100, width: 400, height: 250 })
  close(placementPaddingPixels(samplePlacement, 1000, 500), 20)
})

test('contain-fit centers wide, tall, and square logos inside the padded rectangle', () => {
  const shared = { placement: samplePlacement, imageWidth: 1000, imageHeight: 500 }
  closeRect(containLogoRect({ ...shared, logoWidth: 800, logoHeight: 100 }), { x: 120, y: 202.5, width: 360, height: 45 })
  closeRect(containLogoRect({ ...shared, logoWidth: 100, logoHeight: 800 }), { x: 286.875, y: 120, width: 26.25, height: 210 })
  closeRect(containLogoRect({ ...shared, logoWidth: 200, logoHeight: 200 }), { x: 195, y: 120, width: 210, height: 210 })
})

test('transparent logos use the same rectangle as an opaque logo with the same pixel size', () => {
  const shared = { placement: samplePlacement, imageWidth: 1000, imageHeight: 500, logoWidth: 800, logoHeight: 100 }
  const opaque = containLogoRect(shared)
  const transparent = containLogoRect(shared)
  closeRect(transparent, opaque)
  assert.ok(opaque.width > 0 && opaque.height > 0)
})

test('optional max logo dimensions cap the fitted logo and keep it centered', () => {
  const capped = containLogoRect({
    placement: { ...samplePlacement, maxLogoWidth: 20, maxLogoHeight: null },
    imageWidth: 1000,
    imageHeight: 500,
    logoWidth: 800,
    logoHeight: 100,
  })
  closeRect(capped, { x: 200, y: 212.5, width: 200, height: 25 })
})

test('padding that consumes the rectangle produces an empty logo rect', () => {
  const hidden = containLogoRect({
    placement: { ...samplePlacement, padding: 40 },
    imageWidth: 1000,
    imageHeight: 500,
    logoWidth: 800,
    logoHeight: 100,
  })
  assert.equal(hidden.width, 0)
  assert.equal(hidden.height, 0)
})

test('zero or negative logo dimensions do not produce NaN', () => {
  for (const size of [{ logoWidth: 0, logoHeight: 100 }, { logoWidth: 100, logoHeight: -5 }]) {
    const rect = containLogoRect({ placement: samplePlacement, imageWidth: 1000, imageHeight: 500, ...size })
    assert.equal(Number.isFinite(rect.x), true)
    assert.equal(rect.width, 0)
    assert.equal(rect.height, 0)
  }
})

test('preview and export plans match at different scales', () => {
  const logos = [
    { logoWidth: 800, logoHeight: 100 },
    { logoWidth: 100, logoHeight: 800 },
    { logoWidth: 240, logoHeight: 240 },
    { logoWidth: 480, logoHeight: 180 },
  ]
  for (const logo of logos) {
    const native = bannerCompositePlan({ placement: samplePlacement, imageWidth: 851, imageHeight: 315, ...logo, scale: 1 })
    assert.equal(native.canvasWidth, 851)
    assert.equal(native.canvasHeight, 315)
    for (const scale of [0.25, 0.37, 0.5, 2]) {
      const preview = bannerCompositePlan({ placement: samplePlacement, imageWidth: 851, imageHeight: 315, ...logo, scale })
      close(preview.canvasWidth, native.canvasWidth * scale)
      close(preview.canvasHeight, native.canvasHeight * scale)
      close(preview.logo.x, native.logo.x * scale)
      close(preview.logo.y, native.logo.y * scale)
      close(preview.logo.width, native.logo.width * scale)
      close(preview.logo.height, native.logo.height * scale)
    }
  }
})

test('placement edits and drags stay inside the template', () => {
  const moved = placementAfterDrag(samplePlacement, 'move', -100, 80)
  assert.equal(moved.x, 0)
  assert.equal(moved.y, 50)
  const resized = placementAfterDrag(samplePlacement, 'se', 80, 80)
  close(resized.x + resized.width, 100)
  close(resized.y + resized.height, 100)
  const edited = editPlacement(samplePlacement, { width: 200, padding: 80, maxLogoWidth: 0 })
  assert.equal(edited.x + edited.width <= 100, true)
  assert.equal(edited.padding, 40)
  assert.equal(edited.maxLogoWidth, 0.5)
})

test('untrusted placement JSON is rejected unless it is a contained percentage rectangle', () => {
  assert.deepEqual(normalizePlacement(samplePlacement), samplePlacement)
  assert.equal(normalizePlacement({ ...samplePlacement, x: 70 }), null)
  assert.equal(normalizePlacement({ ...samplePlacement, padding: 41 }), null)
  assert.equal(normalizePlacement({ ...samplePlacement, maxLogoHeight: 0 }), null)
  assert.equal(normalizePlacement(null), null)
})

test('cross-origin template and logo URLs require CORS and same-origin fixtures do not', () => {
  const origin = 'https://portal.example'
  assert.equal(imageNeedsCors('/marketing-banner-fixtures/banner-01-landscape.png', origin), false)
  assert.equal(imageNeedsCors('blob:https://portal.example/logo', origin), false)
  assert.equal(imageNeedsCors('https://project.supabase.co/storage/v1/object/sign/marketing-banner-templates/1/template.png?token=abc', origin), true)
  assert.equal(imageNeedsCors('https://project.supabase.co/storage/v1/object/public/dealer-logos/dealer/logo.png', origin), true)
})

test('banner filenames describe the slot, headline, and dealer', () => {
  assert.equal(slugifyBannerText('Your Home. Your Style. Your Door.'), 'your-home-your-style-your-door')
  assert.equal(marketingBannerFilename({
    slot: 1,
    headline: 'Build a Door Made for Your Home',
    dealerSlug: 'Acme Doors',
    extension: 'png',
  }), 'hgi-banner-1-build-a-door-made-for-your-home-acme-doors.png')
  assert.equal(marketingBannerFilename({
    slot: 8,
    headline: 'See Your Vision Come to Life',
    dealerSlug: 'north-star',
    extension: 'jpg',
  }), 'hgi-banner-8-see-your-vision-come-to-life-north-star.jpg')
})

test('only a Home Guard admin can manage templates, and a dealer can use only their own logo', () => {
  const dealer = { role: 'dealer_user' as const, dealerId: 'Dealer-A' }
  const other = { role: 'dealer_user' as const, dealerId: 'dealer-b' }
  assert.equal(canManageMarketingBannerTemplates({ role: 'hgi_admin' }), true)
  assert.equal(canManageMarketingBannerTemplates(dealer), false)
  assert.equal(canManageMarketingBannerTemplates({ role: 'unauthenticated' }), false)
  assert.equal(canUseDealerLogo(dealer, 'dealer-a'), true)
  assert.equal(canUseDealerLogo(dealer, 'dealer-b'), false)
  assert.equal(canUseDealerLogo(other, 'dealer-a'), false)
  assert.equal(canUseDealerLogo({ role: 'hgi_admin' }, 'dealer-b'), true)
  assert.equal(canUseDealerLogo({ role: 'unauthenticated' }, 'dealer-a'), false)
  assert.equal(canUseDealerLogo(dealer, '  '), false)
})

test('logo choices expose only variants already saved on that dealer', () => {
  const variants = dealerLogoVariants({
    id: 'dealer-a',
    company_name: 'Acme',
    logo_url: ' https://cdn.example/logo.png ',
    logo_light_url: null,
    logo_generated_light_url: 'https://cdn.example/light.png',
  })
  assert.deepEqual(variants.map((item) => item.id), ['primary', 'light-generated'])
  assert.equal(variants[0]?.url, 'https://cdn.example/logo.png')
  assert.equal(dealerLogoVariants({ id: 'dealer-a', company_name: 'Acme', logo_url: ' ', logo_light_url: null }).length, 0)
})

test('missing template records fall back to the eight labeled demo fixtures', () => {
  const fallback = resolveMarketingBanners(null)
  assert.equal(fallback.source, 'fixtures')
  assert.equal(fallback.templates.length, 8)
  assert.deepEqual(fallback.templates.map((item) => item.slot), [1, 2, 3, 4, 5, 6, 7, 8])
  assert.equal(fallback.templates.every((item) => item.imageSource === 'fixture' && item.placementVerified === false), true)
  assert.equal(fallback.templates.filter((item) => item.category === 'landscape').length, 4)
  assert.equal(fallback.templates.filter((item) => item.category === 'square').length, 4)
  const remote = resolveMarketingBanners([{
    slot: 2,
    placement: { x: 10, y: 10, width: 20, height: 20, padding: 1, maxLogoWidth: null, maxLogoHeight: null },
    placementVerified: true,
    imageUrl: 'https://cdn.example/template.png',
    imageWidth: 1600,
    imageHeight: 600,
  }])
  const updated = remote.templates.find((item) => item.slot === 2)
  assert.equal(updated?.imageSource, 'storage')
  assert.equal(updated?.width, 1600)
  assert.equal(updated?.placementVerified, true)
  assert.equal(remote.templates.find((item) => item.slot === 1)?.imageSource, 'fixture')
})

test('catalog headlines, sizes, and unverified default regions are the Phase 1 set', () => {
  assert.deepEqual(MARKETING_BANNERS.map((item) => item.headline), [
    'Build a Door Made for Your Home',
    'Your Home. Your Style. Your Door.',
    'A New Look Starts at Your Door',
    'See Your Vision Come to Life',
    'Build a Door Made for Your Home',
    'Your Home. Your Style. Your Door.',
    'A New Look Starts at Your Door',
    'See Your Vision Come to Life',
  ])
  for (const banner of MARKETING_BANNERS.slice(0, 4)) assert.deepEqual([banner.width, banner.height], [851, 315])
  for (const banner of MARKETING_BANNERS.slice(4)) assert.deepEqual([banner.width, banner.height], [1024, 1024])
  assert.match(MARKETING_BANNERS[0]?.region ?? '', /upper left/)
  assert.match(MARKETING_BANNERS[4]?.region ?? '', /left of center/)
  assert.match(MARKETING_BANNERS[6]?.region ?? '', /above the headline/)
  assert.match(MARKETING_BANNERS[7]?.region ?? '', /upper right/)
})

test('migration seeds the same placements and keeps templates private to portal roles', async () => {
  const migration = await readFile(new URL('../supabase/migrations/20261112000000_create_marketing_banner_templates.sql', import.meta.url), 'utf8')
  for (const banner of MARKETING_BANNERS) {
    assert.match(migration, new RegExp(banner.headline.replace(/[.]/g, '\\.')))
    assert.match(migration, new RegExp(JSON.stringify(banner.placement).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
  assert.match(migration, /placement_verified boolean not null default false/)
  assert.match(migration, /, false\);/)
  assert.match(migration, /'marketing-banner-templates',\n\s+false,/)
  assert.match(migration, /'marketing-banner-templates'/)
  assert.match(migration, /Portal users can read marketing banner templates/)
  assert.match(migration, /Home Guard admins can update marketing banner templates/)
  assert.match(migration, /Home Guard admins can upload marketing banner template images/)
  const uploadPolicy = migration.slice(migration.indexOf('Home Guard admins can upload marketing banner template images'), migration.indexOf('Home Guard admins can replace'))
  assert.match(uploadPolicy, /for insert/)
  assert.match(uploadPolicy, /home_guard_admins/)
  assert.doesNotMatch(uploadPolicy, /dealer_users/)
  assert.doesNotMatch(migration, /create policy "Dealer admins can upload/)
  assert.match(migration, /revoke all on table public.marketing_banner_templates from public, anon/)
})

test('template writes are authorized on the server before any update and never read dealer logos', async () => {
  const api = await readFile(new URL('../api/marketing-banners.ts', import.meta.url), 'utf8')
  const renderer = await readFile(new URL('../src/features/marketing-banners/renderBanner.ts', import.meta.url), 'utf8')
  const library = await readFile(new URL('../src/components/marketing-banners/MarketingBannerLibrary.tsx', import.meta.url), 'utf8')
  const tools = await readFile(new URL('../src/pages/MarketingToolsPage.tsx', import.meta.url), 'utf8')
  const authorizeAt = api.indexOf('await authorizeHgiAdmin')
  const updateAt = api.indexOf(".from('marketing_banner_templates')")
  assert.ok(authorizeAt > -1 && updateAt > authorizeAt)
  assert.doesNotMatch(api, /from\('dealers'\)|logo_url|logo_light_url/)
  assert.match(renderer, /bannerCompositePlan/)
  assert.match(renderer, /crossOrigin = 'anonymous'/)
  assert.match(renderer, /image\/jpeg/)
  assert.doesNotMatch(renderer, /strokeRect|fillText|globalCompositeOperation/)
  assert.match(library, /Customize Banner/)
  assert.match(library, /Download/)
  assert.doesNotMatch(library, /type="file"|saveMarketingBanner/)
  assert.match(tools, /MarketingBannerLibrary/)
  assert.match(tools, /Website Banner Generator/)
})
