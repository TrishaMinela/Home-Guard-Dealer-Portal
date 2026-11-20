import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { MARKETING_BANNERS, availableMarketingBanners, resolveMarketingBanners } from '../src/features/marketing-banners/catalog.ts'
import { marketingBannerFilename, slugifyBannerText } from '../src/features/marketing-banners/filename.ts'
import { automaticBannerLogo, dealerLogoVariants } from '../src/features/marketing-banners/logos.ts'
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
  closeRect(containLogoRect({ ...shared, logoWidth: 200, logoHeight: 200 }), { x: 200, y: 125, width: 200, height: 200 })
})

test('transparent logos use the same rectangle as an opaque logo with the same pixel size', () => {
  const shared = { placement: samplePlacement, imageWidth: 1000, imageHeight: 500, logoWidth: 800, logoHeight: 100 }
  const opaque = containLogoRect(shared)
  const transparent = containLogoRect(shared)
  closeRect(transparent, opaque)
  assert.ok(opaque.width > 0 && opaque.height > 0)
})

test('a small logo stays at its native size and is centered in the box', () => {
  const placement = { x: 10, y: 10, width: 80, height: 80, padding: 0, maxLogoWidth: null, maxLogoHeight: null }
  const rect = containLogoRect({ placement, imageWidth: 1000, imageHeight: 1000, logoWidth: 120, logoHeight: 40 })
  closeRect(rect, { x: 100 + (800 - 120) / 2, y: 100 + (800 - 40) / 2, width: 120, height: 40 })
  const preview = containLogoRect({ placement, imageWidth: 1000, imageHeight: 1000, logoWidth: 120, logoHeight: 40, scale: 0.5 })
  closeRect(preview, { x: rect.x * 0.5, y: rect.y * 0.5, width: 60, height: 20 })
})

test('catalog boxes never draw a small logo larger than its native pixels', () => {
  for (const banner of MARKETING_BANNERS) {
    const rect = containLogoRect({
      placement: banner.placement,
      imageWidth: banner.width,
      imageHeight: banner.height,
      logoWidth: 120,
      logoHeight: 40,
    })
    assert.ok(rect.width <= 120.001 && rect.height <= 40.001, `slot ${banner.slot} upscaled a 120x40 logo to ${rect.width}x${rect.height}`)
    assert.ok(rect.width > 0 && rect.height > 0)
  }
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

test('exports keep the template pixel size for PNG and JPG', async () => {
  const renderer = await readFile(new URL('../src/features/marketing-banners/renderBanner.ts', import.meta.url), 'utf8')
  const library = await readFile(new URL('../src/components/marketing-banners/MarketingBannerLibrary.tsx', import.meta.url), 'utf8')
  assert.match(renderer, /canvas\.width = template\.naturalWidth/)
  assert.match(renderer, /canvas\.height = template\.naturalHeight/)
  assert.match(renderer, /input\.format === 'jpeg' \? 'image\/jpeg' : 'image\/png'/)
  assert.match(library, /format: 'png' \| 'jpeg'/)
  assert.match(library, /extension: format === 'jpeg' \? 'jpg' : 'png'/)
  assert.doesNotMatch(renderer, /canvas\.width = .*scale/)
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
    logo_generated_light_usable: true,
  })
  assert.deepEqual(variants.map((item) => item.id), ['primary', 'light-generated'])
  assert.equal(variants[0]?.url, 'https://cdn.example/logo.png')
  assert.equal(dealerLogoVariants({ id: 'dealer-a', company_name: 'Acme', logo_url: ' ', logo_light_url: null }).length, 0)
})

test('banner logos use a custom light logo, then a readable generated logo, then the original', async () => {
  const dealer = {
    id: 'dealer-a',
    company_name: 'Acme',
    logo_url: 'https://cdn.example/original.png',
    logo_light_url: null as string | null,
    logo_generated_light_url: 'https://cdn.example/generated.png',
    logo_generated_light_usable: null as boolean | null,
  }
  assert.equal(automaticBannerLogo(dealer), 'https://cdn.example/original.png')
  assert.deepEqual(dealerLogoVariants(dealer).map((item) => item.id), ['primary'])
  assert.equal(automaticBannerLogo({ ...dealer, logo_generated_light_usable: false }), 'https://cdn.example/original.png')
  assert.deepEqual(dealerLogoVariants({ ...dealer, logo_generated_light_usable: false }).map((item) => item.id), ['primary'])
  assert.equal(automaticBannerLogo({ ...dealer, logo_generated_light_usable: true }), 'https://cdn.example/generated.png')
  assert.equal(automaticBannerLogo({ ...dealer, logo_light_url: ' https://cdn.example/custom.png ', logo_generated_light_usable: true }), 'https://cdn.example/custom.png')
  const withBlack = {
    ...dealer,
    logo_black_url: null as string | null,
    logo_generated_black_url: 'https://cdn.example/generated-black.png',
    logo_generated_black_usable: false as boolean | null,
  }
  assert.equal(automaticBannerLogo(withBlack), 'https://cdn.example/original.png')
  assert.deepEqual(dealerLogoVariants(withBlack).map((item) => item.id), ['primary'])
  assert.deepEqual(dealerLogoVariants({ ...withBlack, logo_generated_black_usable: null }).map((item) => item.id), ['primary'])
  assert.deepEqual(dealerLogoVariants({ ...withBlack, logo_generated_black_usable: true, logo_black_url: 'https://cdn.example/custom-black.png' }).map((item) => item.id), ['primary', 'black-custom', 'black-generated'])
  const library = await readFile(new URL('../src/components/marketing-banners/MarketingBannerLibrary.tsx', import.meta.url), 'utf8')
  assert.match(library, /automaticBannerLogo\(dealer\)/)
  assert.doesNotMatch(library, /variants\[0\]/)
})

test('missing template records fall back to all eight demo fixtures', () => {
  const fallback = resolveMarketingBanners(null)
  assert.equal(fallback.source, 'fixtures')
  assert.equal(fallback.templates.length, 8)
  assert.deepEqual(fallback.templates.map((item) => item.slot), [1, 2, 3, 4, 5, 6, 7, 8])
  assert.equal(fallback.templates[0]?.headline, 'Build a Door Made for Your Home')
  assert.equal(fallback.templates[0]?.imageUrl, '/marketing-banner-fixtures/banner-01-landscape.png')
  assert.equal(fallback.templates.every((item) => item.imageSource === 'fixture' && item.placementVerified === false), true)
  assert.equal(fallback.templates.filter((item) => item.category === 'landscape').length, 4)
  assert.equal(fallback.templates.filter((item) => item.category === 'square').length, 4)
  const landscape = createHash('sha256').update(readFileSync(new URL('../public/marketing-banner-fixtures/banner-01-landscape.png', import.meta.url))).digest('hex')
  const square = createHash('sha256').update(readFileSync(new URL('../public/marketing-banner-fixtures/banner-05-square.png', import.meta.url))).digest('hex')
  assert.equal(landscape, 'e0f7061d6e3ffca50384a977017c8b45dc4163eb75b121090d921cacd175b051')
  assert.equal(square, '5aeeda4ab1d96845c50f2a464880d90d78d46155330c348c368125c3c8e1be48')
  const remote = resolveMarketingBanners([
    {
      slot: 1,
      headline: 'Build a Door Made for Your Home',
      placement: { x: 4, y: 6, width: 30, height: 42, padding: 2, maxLogoWidth: null, maxLogoHeight: null },
      placementVerified: true,
      imageUrl: 'https://cdn.example/retired.png',
      imageWidth: 851,
      imageHeight: 315,
    },
    {
      slot: 2,
      placement: { x: 10, y: 10, width: 20, height: 20, padding: 1, maxLogoWidth: null, maxLogoHeight: null },
      placementVerified: true,
      imageUrl: 'https://cdn.example/template.png',
      imageWidth: 1600,
      imageHeight: 600,
    },
  ])
  const updated = remote.templates.find((item) => item.slot === 2)
  assert.equal(updated?.imageSource, 'storage')
  assert.equal(updated?.width, 1600)
  assert.equal(updated?.placementVerified, true)
  assert.equal(updated?.placement.x, 10)
  const restored = remote.templates.find((item) => item.slot === 1)
  assert.equal(restored?.headline, 'Build a Door Made for Your Home')
  assert.equal(restored?.imageSource, 'fixture')
  assert.equal(restored?.imageUrl, '/marketing-banner-fixtures/banner-01-landscape.png')
  assert.equal(restored?.width, 851)
  assert.equal(restored?.height, 315)
  assert.equal(restored?.placementVerified, true)
  const squareWithUpload = resolveMarketingBanners([{
    slot: 5,
    imageUrl: 'https://cdn.example/square-upload.png',
    imageWidth: 1763,
    imageHeight: 1801,
    placementVerified: true,
  }])
  const restoredSquare = squareWithUpload.templates.find((item) => item.slot === 5)
  assert.equal(restoredSquare?.imageSource, 'fixture')
  assert.equal(restoredSquare?.imageUrl, '/marketing-banner-fixtures/banner-05-square.png')
  assert.equal(restoredSquare?.width, 1080)
  assert.equal(restoredSquare?.height, 1080)
  assert.equal(remote.templates.find((item) => item.slot === 3)?.imageSource, 'fixture')
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
  for (const banner of MARKETING_BANNERS.slice(4)) assert.deepEqual([banner.width, banner.height], [1080, 1080])
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
  assert.doesNotMatch(tools, /Website Banner Generator/)
})

test('Marketing Tools renders the banner library instead of the version 1 generator', async () => {
  const tools = await readFile(new URL('../src/pages/MarketingToolsPage.tsx', import.meta.url), 'utf8')
  const library = await readFile(new URL('../src/components/marketing-banners/MarketingBannerLibrary.tsx', import.meta.url), 'utf8')
  const adminTools = await readFile(new URL('../src/components/AdminDealerMarketingTools.tsx', import.meta.url), 'utf8')
  const portal = await readFile(new URL('../src/components/PortalLayout.tsx', import.meta.url), 'utf8')
  const adminLayout = await readFile(new URL('../src/components/AdminLayout.tsx', import.meta.url), 'utf8')
  const adminPage = await readFile(new URL('../src/pages/AdminMarketingBannersPage.tsx', import.meta.url), 'utf8')
  const dealerDetail = await readFile(new URL('../src/pages/DealerDetailPage.tsx', import.meta.url), 'utf8')
  const css = await readFile(new URL('../src/App.css', import.meta.url), 'utf8')

  assert.doesNotMatch(tools, /Website Banner Generator|Version 1|banner-generator|bannerSizes|bannerTemplates|Download PNG|Banner Size|Banner Layout/)
  assert.doesNotMatch(tools, /features\/banner-generator/)
  assert.equal(existsSync(new URL('../src/features/banner-generator/bannerRenderer.ts', import.meta.url)), false)
  assert.equal(existsSync(new URL('../src/features/banner-generator/bannerTemplates.ts', import.meta.url)), false)
  assert.doesNotMatch(css, /\.banner-generator|\.banner-size-grid|\.banner-template-grid|\.banner-preview-frame/)

  const libraryAt = tools.indexOf('<MarketingBannerLibrary')
  const visualizerAt = tools.indexOf('>Visualizer Link<')
  const embedAt = tools.indexOf('>Embed Code<')
  assert.ok(libraryAt > -1 && visualizerAt > libraryAt && embedAt > visualizerAt)
  assert.match(tools, /getDealerVisualizerUrl\(dealer\.slug\)/)
  assert.match(tools, /Copy Embed Code/)

  assert.deepEqual(MARKETING_BANNERS.map((item) => item.slot), [1, 2, 3, 4, 5, 6, 7, 8])
  assert.deepEqual(availableMarketingBanners().map((item) => [item.slot, item.category, item.headline]), [
    [1, 'landscape', 'Build a Door Made for Your Home'],
    [2, 'landscape', 'Your Home. Your Style. Your Door.'],
    [3, 'landscape', 'A New Look Starts at Your Door'],
    [4, 'landscape', 'See Your Vision Come to Life'],
    [5, 'square', 'Build a Door Made for Your Home'],
    [6, 'square', 'Your Home. Your Style. Your Door.'],
    [7, 'square', 'A New Look Starts at Your Door'],
    [8, 'square', 'See Your Vision Come to Life'],
  ])
  const adminEditor = await readFile(new URL('../src/components/marketing-banners/MarketingBannerAdminEditor.tsx', import.meta.url), 'utf8')
  assert.match(adminEditor, /useState\(2\)/)
  assert.match(adminEditor, /library\?\.templates\.find\(\(item\) => item\.slot === selectedSlot\) \?\? library\?\.templates\[0\]/)
  assert.match(library, /bannersInCategory\(library\.templates, category\)/)
  assert.match(library, /Customize Banner/)
  assert.match(library, /Download/)
  assert.match(library, /automaticBannerLogo\(dealer\)/)
  assert.match(library, /dealerLogoVariants\(dealer\)/)
  assert.match(library, /adminHref \? <Link className="mbl-admin-link" to=\{adminHref\}>Edit template placements<\/Link>/)

  assert.match(portal, /path="\/marketing"[\s\S]*<MarketingToolsPage dealer=\{dealer\} \/>/)
  assert.doesNotMatch(portal, /bannerAdminHref/)
  assert.match(dealerDetail, /canManageDealerCredentials \? \([\s\S]*<AdminDealerMarketingTools/)
  assert.match(adminTools, /<MarketingToolsPage/)
  assert.match(adminTools, /bannerAdminHref=\{`\/admin\/marketing-banners\?dealer=\$\{encodeURIComponent\(dealerId\)\}`\}/)
  assert.match(adminTools, /embedded/)
  assert.doesNotMatch(adminLayout, /label: 'Marketing Banners'/)
  assert.match(adminLayout, /<Route path="\/admin\/marketing-banners" element={<AdminMarketingBannersPage/)
  assert.match(adminPage, /Back to dealer/)
  assert.match(adminPage, /Back to Dealers/)
  assert.match(adminPage, /\/admin\/dealers\/\$\{dealerId\}#marketing-tools/)
  assert.match(portal, /\{ label: 'Marketing Tools', path: '\/marketing'/)
  assert.doesNotMatch(portal, /Marketing Banners|\/admin\/marketing-banners/)
})
