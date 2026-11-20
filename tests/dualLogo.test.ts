import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { validateSecondaryLogoUrl } from '../api/_lib/dealerLightLogo.ts'
import {
  doorBuilderLogoPreview,
  logoChoicesAfterFailedSave,
  logoVariantSavePlan,
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
  const mixedHeader = doorBuilderLogoPreview({
    ...dealer,
    logo_display: 'dual',
    logo_placement: 'header',
    logo_header_variant: 'original',
    logo_secondary_header_variant: 'white',
  }, 'home-header')
  assert.equal(mixedHeader?.primaryUrl, 'https://cdn.example/original.png')
  assert.equal(mixedHeader?.secondaryUrl, 'https://cdn.example/second-white.png')
  assert.equal(mixedHeader?.background, '#05040b')
  const followedPages = doorBuilderLogoPreview({
    ...dealer,
    logo_display: 'dual',
    logo_placement: 'hero',
    logo_pages_variant: 'black',
    logo_secondary_pages_variant: null,
    logo_secondary_black_url: 'https://cdn.example/second-black.png',
  }, 'find-my-door')
  assert.equal(followedPages?.background, '#05040b')
  assert.equal(followedPages?.primaryUrl, 'https://cdn.example/black.png')
  assert.equal(followedPages?.secondaryUrl, 'https://cdn.example/second-black.png')
  const whiteHero = doorBuilderLogoPreview({
    ...dealer,
    logo_display: 'dual',
    logo_placement: 'hero',
    logo_header_variant: 'original',
    logo_secondary_header_variant: 'white',
  }, 'home-hero')
  assert.equal(whiteHero?.background, '#ffffff')
  assert.equal(whiteHero?.primaryUrl, 'https://cdn.example/original.png')
  assert.equal(whiteHero?.secondaryUrl, 'https://cdn.example/second-white.png')
  const missingSecondWhite = doorBuilderLogoPreview({
    ...dealer,
    logo_display: 'dual',
    logo_placement: 'header',
    logo_header_variant: 'original',
    logo_secondary_header_variant: 'white',
    logo_secondary_light_url: null,
    logo_secondary_generated_light_usable: false,
  }, 'home-header')
  assert.equal(missingSecondWhite?.showPair, false)
  assert.equal(missingSecondWhite?.primaryUrl, 'https://cdn.example/original.png')
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
  assert.match(migration, /add column if not exists logo_secondary_header_variant text null/)
  assert.match(migration, /add column if not exists logo_secondary_pages_variant text null/)
  assert.match(migration, /logo_secondary_header_variant is null or logo_secondary_header_variant in \('original', 'white', 'black'\)/)
  assert.match(migration, /logo_secondary_pages_variant is null or logo_secondary_pages_variant in \('original', 'white', 'black'\)/)
  assert.match(migration, /drop constraint if exists dealers_logo_secondary_header_variant_check/)
  assert.match(migration, /drop constraint if exists dealers_logo_secondary_pages_variant_check/)
  assert.match(migration, /update_my_dealer_all_logo_variants/)
  assert.match(migration, /revoke all on function public\.update_my_dealer_all_logo_variants\(uuid, text, text, text, text\) from public, anon/)
  assert.match(migration, /grant execute on function public\.update_my_dealer_all_logo_variants\(uuid, text, text, text, text\) to authenticated/)
  assert.match(migration, /drop function if exists public\.update_my_dealer_secondary_logo_variants\(uuid, text, text\)/)
  assert.doesNotMatch(migration, /create or replace function public\.update_my_dealer_secondary_logo_variants/)
  assert.match(migration, /drop column if exists logo_secondary_header_variant/)
  assert.match(migration, /drop column if exists logo_secondary_pages_variant/)
  assert.doesNotMatch(migration, /function public\.update_my_dealer_logo_variants/)
  assert.match(migration, /logo-secondary\(-light\|-black\|-source\)\?/)
  assert.match(migration, /Rollback:/)
  assert.doesNotMatch(banners, /logo_secondary_/)
  assert.match(profile, /DealerLogoDisplaySettings/)
  assert.match(detail, /DealerLogoDisplaySettings/)
  assert.match(profile, /Marketing banners do not use these choices/)
})

test('dual logo choices save together and a failure restores the saved choices', () => {
  const migration = readFileSync('supabase/migrations/20261119000000_add_dealer_dual_logo.sql', 'utf8')
  const profile = readFileSync('src/pages/DealerCompanyProfilePage.tsx', 'utf8')
  const detail = readFileSync('src/pages/DealerDetailPage.tsx', 'utf8')
  const component = readFileSync('src/components/DealerLogoVariantSettings.tsx', 'utf8')
  const fnStart = migration.indexOf('create or replace function public.update_my_dealer_all_logo_variants')
  const fnEnd = migration.indexOf('revoke all on function public.update_my_dealer_all_logo_variants')
  const fn = migration.slice(fnStart, fnEnd)
  assert.equal((fn.match(/update public\.dealers/g) ?? []).length, 1)
  assert.match(fn, /logo_header_variant = v_header/)
  assert.match(fn, /logo_pages_variant = v_pages/)
  assert.match(fn, /logo_secondary_header_variant = v_secondary_header/)
  assert.match(fn, /logo_secondary_pages_variant = v_secondary_pages/)
  assert.match(fn, /security definer/)
  assert.match(fn, /set search_path = pg_catalog/)
  assert.match(fn, /dealer_users\.role = 'dealer_admin'/)
  assert.match(fn, /v_user_id is null/)

  const single = logoVariantSavePlan('single', 'white', 'black', 'original', 'white')
  assert.equal(single.mode, 'primary')
  assert.deepEqual(single.fields, { logo_header_variant: 'white', logo_pages_variant: 'black' })
  const unset = logoVariantSavePlan(null, null, 'original', 'white', 'black')
  assert.equal(unset.mode, 'primary')
  assert.deepEqual(unset.fields, { logo_header_variant: null, logo_pages_variant: 'original' })
  const dual = logoVariantSavePlan('dual', 'original', 'black', 'white', null)
  assert.equal(dual.mode, 'all')
  assert.deepEqual(dual.fields, {
    logo_header_variant: 'original',
    logo_pages_variant: 'black',
    logo_secondary_header_variant: 'white',
    logo_secondary_pages_variant: null,
  })

  for (const page of [profile, detail]) {
    assert.match(page, /plan\.mode === 'primary'/)
    assert.match(page, /logoVariantSavePlan\(dealer\.logo_display, variants\.header, variants\.pages, variants\.secondaryHeader, variants\.secondaryPages\)/)
    assert.doesNotMatch(page, /update_my_dealer_secondary_logo_variants/)
  }
  assert.match(profile, /update_my_dealer_logo_variants/)
  assert.match(profile, /update_my_dealer_all_logo_variants/)
  assert.match(detail, /\.update\(written\)/)
  assert.match(detail, /\.update\(plan\.fields\)/)
  assert.doesNotMatch(detail, /update_my_dealer_all_logo_variants/)
  assert.match(component, /These logo choices were not saved\. The previous choices are unchanged\./)
  assert.match(component, /logoChoicesAfterFailedSave\(dealer\)/)
  const failure = component.slice(component.indexOf('catch (saveError)'), component.indexOf('} finally'))
  assert.doesNotMatch(failure, /onUpdated/)
  assert.deepEqual(logoChoicesAfterFailedSave({
    logo_header_variant: 'original',
    logo_pages_variant: 'black',
    logo_secondary_header_variant: null,
    logo_secondary_pages_variant: 'white',
  }), {
    header: 'original',
    pages: 'black',
    secondaryHeader: null,
    secondaryPages: 'white',
  })
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
