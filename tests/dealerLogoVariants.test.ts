import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  DOOR_BUILDER_PAGE_BACKGROUND,
  coloredLogoNeedsNeutralPlate,
  doorBuilderColor,
  doorBuilderLegacyLightLogo,
  doorBuilderLogoWhenVariantUnset,
  headerContrastPlate,
  logoVariantWrite,
  normalizeLogoVariant,
  resolveLightLogoUrl,
  resolveVariantLogoUrl,
} from '../src/utils/dealerLogoVariants.ts'

test('white/light logo prefers a custom upload, then a readable generated logo', () => {
  const generated = {
    logo_url: 'https://cdn.example/original.png',
    logo_light_url: null,
    logo_generated_light_url: 'https://cdn.example/generated.png',
    logo_generated_light_usable: true,
  }
  assert.equal(resolveLightLogoUrl({ ...generated, logo_light_url: ' https://cdn.example/custom.png ' }), 'https://cdn.example/custom.png')
  assert.equal(resolveLightLogoUrl(generated), 'https://cdn.example/generated.png')
  assert.equal(resolveLightLogoUrl({ ...generated, logo_generated_light_usable: false }), null)
  assert.equal(resolveLightLogoUrl({ ...generated, logo_generated_light_usable: null }), null)
  assert.equal(resolveVariantLogoUrl(generated, 'original'), 'https://cdn.example/original.png')
  assert.equal(resolveVariantLogoUrl(generated, 'white'), 'https://cdn.example/generated.png')
  assert.equal(resolveVariantLogoUrl({ ...generated, logo_black_url: 'https://cdn.example/black.png', logo_generated_black_usable: false }, 'black'), 'https://cdn.example/black.png')
  assert.equal(resolveVariantLogoUrl({ ...generated, logo_black_url: null, logo_generated_black_url: 'https://cdn.example/gen-black.png', logo_generated_black_usable: null }, 'black'), null)
  assert.equal(resolveVariantLogoUrl(generated, null), null)
})

test('header previews plate original and black on a dark header and never plate white', () => {
  const dealer = {
    logo_url: 'https://cdn.example/original.png',
    logo_light_url: 'https://cdn.example/white.png',
    logo_black_url: 'https://cdn.example/black.png',
    secondary_color: '#40454c',
  }
  assert.equal(headerContrastPlate(dealer, 'original'), 'light')
  assert.equal(headerContrastPlate(dealer, 'black'), 'light')
  assert.equal(headerContrastPlate(dealer, 'white'), null)
  assert.equal(headerContrastPlate(dealer, null), null)
  assert.equal(headerContrastPlate({ ...dealer, secondary_color: '#f8d30e' }, 'original'), null)
  assert.equal(headerContrastPlate({ ...dealer, logo_light_url: null, logo_generated_light_usable: false }, 'white'), 'light')
})

test('colored logos on a dark header use a neutral plate, and page background stays light', () => {
  assert.equal(doorBuilderColor('#40454C', '#05040b'), '#40454c')
  assert.equal(doorBuilderColor('blue', '#05040b'), '#05040b')
  assert.equal(coloredLogoNeedsNeutralPlate('#40454c'), true)
  assert.equal(coloredLogoNeedsNeutralPlate('#002661'), true)
  assert.equal(coloredLogoNeedsNeutralPlate(DOOR_BUILDER_PAGE_BACKGROUND), false)
  assert.equal(DOOR_BUILDER_PAGE_BACKGROUND, '#f5f7f7')
})

test('logo variant migration adds nullable choices without backfilling rows', async () => {
  const migration = await readFile(new URL('../supabase/migrations/20261116000000_add_dealer_logo_variants.sql', import.meta.url), 'utf8')
  assert.match(migration, /add column if not exists logo_header_variant text null/)
  assert.match(migration, /add column if not exists logo_pages_variant text null/)
  assert.match(migration, /add column if not exists logo_generated_light_usable boolean null/)
  assert.match(migration, /check \(logo_header_variant in \('original', 'black', 'white'\)\)/)
  assert.match(migration, /check \(logo_pages_variant in \('original', 'black', 'white'\)\)/)
  assert.match(migration, /add column if not exists logo_source_url text null/)
  assert.match(migration, /add column if not exists logo_black_url text null/)
  assert.match(migration, /add column if not exists logo_generated_black_url text null/)
  assert.match(migration, /add column if not exists logo_generated_black_usable boolean null/)
  assert.match(migration, /role = 'dealer_admin'/)
  assert.match(migration, /grant execute on function public\.update_my_dealer_logo_variants\(uuid, text, text\) to authenticated/)
  assert.match(migration, /revoke all on function public\.update_my_dealer_logo_variants\(uuid, text, text\) from public, anon/)
  assert.match(migration, /revoke all on function public\.update_my_dealer_logo_assets\(uuid, text, text, text, text\) from public, anon/)
  assert.doesNotMatch(migration, /grant execute on function public\.update_my_dealer_logo_assets\(uuid, text, text, text, text\) to anon/)
  assert.match(migration, /set search_path = pg_catalog/)
  assert.match(migration, /logo\(-light\|-black\|-source\)\?\\\.\(png\|jpg\|jpeg\|webp\)\(\\\?v=\[0-9\]\+\)\?/)
  const rollback = migration.slice(migration.indexOf('Rollback:'))
  assert.match(rollback, /create policy "Dealer admins can upload their own dealer logo"/)
  assert.match(rollback, /create policy "Dealer admins can replace their own dealer logo"/)
  assert.match(rollback, /for insert/)
  assert.match(rollback, /for update/)
  assert.equal(rollback.match(/\^logo\(-light\)\?\\\.\(png\|jpg\|jpeg\|webp\)\$/g)?.length, 3)
  assert.match(rollback, /dealer_users\.role = 'dealer_admin'/)
  assert.match(rollback, /drop column if exists logo_source_url/)
  assert.match(rollback, /drop function if exists public\.update_my_dealer_logo_assets/)
  const executable = migration.slice(0, migration.indexOf('/*')).replace(/--[^\n]*/g, '')
  const updates = executable.match(/update\s+public\.dealers[\s\S]*?;/gi) ?? []
  assert.equal(updates.length, 2)
  assert.match(updates[0] ?? '', /logo_header_variant = v_header/)
  assert.match(updates[0] ?? '', /logo_pages_variant = v_pages/)
  assert.match(updates[1] ?? '', /logo_source_url/)
  assert.match(updates[1] ?? '', /logo_black_url/)
  assert.doesNotMatch(executable, /update\s+public\.dealers[\s\S]*where\s+true/)
  for (const statement of updates) assert.match(statement, /where id = p_dealer_id/)
})

test('null logo variants keep the Door Builder legacy choice and the Portal does not invent one', () => {
  const dealer = {
    logo_url: 'https://cdn.example/original.png',
    logo_light_url: null,
    logo_generated_light_url: 'https://cdn.example/generated.png',
    logo_generated_light_usable: null as boolean | null,
    logo_header_variant: null,
    logo_pages_variant: null,
    secondary_color: '#40454c',
  }
  assert.equal(normalizeLogoVariant(null), null)
  assert.equal(normalizeLogoVariant(undefined), null)
  assert.equal(normalizeLogoVariant('automatic'), null)
  assert.equal(normalizeLogoVariant('light'), null)
  assert.deepEqual(logoVariantWrite(null, null), { logo_header_variant: null, logo_pages_variant: null })
  assert.equal(resolveVariantLogoUrl(dealer, null), null)
  assert.equal(resolveLightLogoUrl(dealer), null)
  assert.equal(doorBuilderLegacyLightLogo(dealer), 'https://cdn.example/generated.png')
  assert.equal(doorBuilderLogoWhenVariantUnset(dealer, 'dark-header'), 'https://cdn.example/generated.png')
  assert.equal(doorBuilderLogoWhenVariantUnset(dealer, 'light-surface'), 'https://cdn.example/original.png')
  assert.equal(doorBuilderLogoWhenVariantUnset(dealer, 'hero'), 'https://cdn.example/original.png')
  assert.equal(doorBuilderLegacyLightLogo({ ...dealer, logo_generated_light_usable: false }), null)
  assert.equal(doorBuilderLogoWhenVariantUnset({ ...dealer, logo_generated_light_usable: false }, 'dark-header'), 'https://cdn.example/original.png')
  assert.equal(resolveVariantLogoUrl({ ...dealer, logo_generated_light_usable: true }, 'white'), 'https://cdn.example/generated.png')
  assert.equal(resolveVariantLogoUrl({ ...dealer, logo_header_variant: 'original' }, null), null)
})

test('admin and dealer branding settings share the same choices and saved fields', async () => {
  const component = await readFile(new URL('../src/components/DealerLogoVariantSettings.tsx', import.meta.url), 'utf8')
  const detail = await readFile(new URL('../src/pages/DealerDetailPage.tsx', import.meta.url), 'utf8')
  const profile = await readFile(new URL('../src/pages/DealerCompanyProfilePage.tsx', import.meta.url), 'utf8')
  for (const page of [detail, profile]) {
    assert.match(page, /<DealerLogoVariantSettings/)
    assert.match(page, /logoVariantWrite\(variants\.header, variants\.pages\)/)
    assert.doesNotMatch(page, /Homepage\/Header Logo|Normal Pages Logo|Original Colored Logo|White\/Light Logo/)
  }
  assert.match(component, /!available\[choice\.value\]/)
  assert.match(detail, /\.update\(written\)/)
  assert.match(profile, /p_logo_header_variant: written\.logo_header_variant/)
  assert.match(profile, /p_logo_pages_variant: written\.logo_pages_variant/)
  assert.deepEqual(logoVariantWrite('original', 'white'), { logo_header_variant: 'original', logo_pages_variant: 'white' })
  assert.deepEqual(logoVariantWrite(null, 'black'), { logo_header_variant: null, logo_pages_variant: 'black' })
})

test('branding settings expose independent homepage and pages logo choices', async () => {
  const component = await readFile(new URL('../src/components/DealerLogoVariantSettings.tsx', import.meta.url), 'utf8')
  const detail = await readFile(new URL('../src/pages/DealerDetailPage.tsx', import.meta.url), 'utf8')
  const profile = await readFile(new URL('../src/pages/DealerCompanyProfilePage.tsx', import.meta.url), 'utf8')
  assert.match(component, /Homepage Header Logo/)
  assert.match(component, /Normal Pages Logo/)
  assert.match(component, /label: 'Original'/)
  assert.match(component, /label: 'Black'/)
  assert.match(component, /label: 'White'/)
  assert.match(component, /headerContrastPlate\(dealer, header\)/)
  assert.match(component, /headerContrastPlate\(dealer, pages\)/)
  assert.match(component, /secondary color/)
  assert.doesNotMatch(component, /DOOR_BUILDER_PAGE_BACKGROUND/)
  assert.match(detail, /logoVariantWrite\(variants\.header, variants\.pages\)/)
  assert.match(profile, /update_my_dealer_logo_variants/)
  const styles = await readFile(new URL('../src/App.css', import.meta.url), 'utf8')
  assert.match(styles, /@media\(max-width:720px\)\{\.logo-variant-settings/)
  assert.match(styles, /@media\(max-width:800px\)\{\.logo-background-dialog__grid\{grid-template-columns:1fr 1fr\}/)
  assert.equal(logoVariantWrite('white', 'black').logo_pages_variant, 'black')
  assert.equal(logoVariantWrite('white', 'black').logo_header_variant, 'white')
})
