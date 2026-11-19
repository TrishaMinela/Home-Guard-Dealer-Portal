import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { validateSecondaryLogoUrl } from '../api/_lib/dealerLightLogo.ts'
import {
  doorBuilderLogoPreview,
  normalizeLogoDisplay,
  previewLogoUrl,
  secondaryLogoSource,
  selectedSecondaryLogoUrl,
} from '../src/utils/dealerLogoVariants.ts'

const dealer = {
  logo_url: 'https://cdn.example/original.png',
  logo_light_url: 'https://cdn.example/white.png',
  logo_black_url: 'https://cdn.example/black.png',
  logo_generated_light_usable: true,
  logo_generated_black_usable: true,
  logo_header_variant: 'white' as const,
  logo_pages_variant: 'original' as const,
  secondary_color: '#05040b',
  logo_display: 'single' as const,
  logo_secondary_url: 'https://cdn.example/second.png',
  logo_secondary_light_url: null,
  logo_secondary_generated_light_url: 'https://cdn.example/second-white.png',
  logo_secondary_generated_light_usable: true,
  logo_secondary_black_url: null,
  logo_secondary_generated_black_url: null,
  logo_secondary_generated_black_usable: null,
}

test('logo display defaults to one logo and only accepts dual explicitly', () => {
  assert.equal(normalizeLogoDisplay(null), 'single')
  assert.equal(normalizeLogoDisplay('header'), 'single')
  assert.equal(normalizeLogoDisplay('dual'), 'dual')
})

test('the second logo matches Door Builder and stays on the selected file', () => {
  const second = secondaryLogoSource(dealer)
  assert.equal(previewLogoUrl(dealer, 'white', 'header'), 'https://cdn.example/white.png')
  assert.equal(previewLogoUrl(second, 'white', 'header'), 'https://cdn.example/second-white.png')
  assert.equal(selectedSecondaryLogoUrl({
    ...dealer, logo_secondary_url: 'https://cdn.example/second.png', logo_secondary_light_url: null, logo_secondary_generated_light_usable: false,
  }, 'white', 'hero'), null)
  assert.equal(selectedSecondaryLogoUrl({
    ...dealer, logo_header_variant: 'black', logo_secondary_black_url: 'https://cdn.example/second-black.png',
  }, 'black', 'header'), 'https://cdn.example/second-black.png')
  const hero = doorBuilderLogoPreview({
    ...dealer,
    logo_display: 'dual',
    logo_placement: 'hero',
    logo_header_variant: 'white',
    logo_secondary_light_url: 'https://cdn.example/second-white.png',
  }, 'home-hero')
  assert.equal(hero?.background, '#ffffff')
  assert.equal(hero?.showPair, true)
  assert.equal(hero?.secondaryUrl, 'https://cdn.example/second-white.png')
  const pages = doorBuilderLogoPreview({ ...dealer, logo_display: 'dual', logo_placement: 'hero' }, 'page-header')
  assert.equal(pages?.primaryUrl, 'https://cdn.example/original.png')
  assert.equal(pages?.background, '#05040b')
  assert.equal(pages?.showPair, true)
  const findMyDoor = doorBuilderLogoPreview({ ...dealer, logo_display: 'dual', logo_placement: 'header', secondary_color: '#f7f8f9' }, 'find-my-door')
  assert.equal(findMyDoor?.background, '#05040b')
  assert.equal(findMyDoor?.primaryUrl, 'https://cdn.example/original.png')
})

test('dual logo migration is additive and marketing banners stay on the first logo', () => {
  const migration = readFileSync('supabase/migrations/20261119000000_add_dealer_dual_logo.sql', 'utf8')
  const banners = readFileSync('src/features/marketing-banners/logos.ts', 'utf8')
  const profile = readFileSync('src/pages/DealerCompanyProfilePage.tsx', 'utf8')
  const detail = readFileSync('src/pages/DealerDetailPage.tsx', 'utf8')
  assert.match(migration, /logo_display text not null default 'single'/)
  assert.match(migration, /logo_display in \('single', 'dual'\)/)
  assert.match(migration, /update_my_dealer_logo_display/)
  assert.match(migration, /update_my_dealer_secondary_logo_assets/)
  assert.match(migration, /logo-secondary\(-light\|-black\|-source\)\?/)
  assert.match(migration, /Rollback:/)
  assert.doesNotMatch(banners, /logo_secondary_/)
  assert.match(profile, /DealerLogoDisplaySettings/)
  assert.match(detail, /DealerLogoDisplaySettings/)
  assert.match(profile, /Marketing banners do not use these choices/)
})

test('second logo generation uses its own file and does not replace the first logo', () => {
  const api = readFileSync('api/dealer-light-logo.ts', 'utf8')
  assert.match(api, /logo-secondary-generated-light\.png/)
  assert.match(api, /logo-secondary-generated-black\.png/)
  assert.match(api, /logo_secondary_generated_light_usable: generated\.usable/)
  assert.match(api, /logo_generated_light_usable: generated\.usable/)
  const projectUrl = 'https://example.supabase.co'
  assert.doesNotThrow(() => validateSecondaryLogoUrl(
    'https://example.supabase.co/storage/v1/object/public/dealer-logos/dealer-1/logo-secondary.png?v=1',
    'dealer-1',
    projectUrl,
  ))
  assert.throws(() => validateSecondaryLogoUrl(
    'https://example.supabase.co/storage/v1/object/public/dealer-logos/dealer-1/logo.png',
    'dealer-1',
    projectUrl,
  ))
})
