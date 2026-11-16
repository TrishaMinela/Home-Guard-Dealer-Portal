import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  DOOR_BUILDER_PAGE_BACKGROUND,
  coloredLogoNeedsNeutralPlate,
  doorBuilderColor,
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
  assert.equal(resolveVariantLogoUrl(generated, 'light'), 'https://cdn.example/generated.png')
  assert.equal(resolveVariantLogoUrl(generated, null), null)
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
  assert.match(migration, /check \(logo_header_variant in \('original', 'light'\)\)/)
  assert.match(migration, /check \(logo_pages_variant in \('original', 'light'\)\)/)
  assert.match(migration, /role = 'dealer_admin'/)
  assert.match(migration, /grant execute on function public\.update_my_dealer_logo_variants\(uuid, text, text\) to authenticated/)
  assert.doesNotMatch(migration, /update\s+public\.dealers\s+set(?![\s\S]*logo_header_variant = v_header)/i)
  assert.doesNotMatch(migration, /update public\.dealers\s+set\s+logo_header_variant\s*=\s*'/)
})

test('branding settings expose independent homepage and pages logo choices', async () => {
  const component = await readFile(new URL('../src/components/DealerLogoVariantSettings.tsx', import.meta.url), 'utf8')
  const detail = await readFile(new URL('../src/pages/DealerDetailPage.tsx', import.meta.url), 'utf8')
  const profile = await readFile(new URL('../src/pages/DealerCompanyProfilePage.tsx', import.meta.url), 'utf8')
  assert.match(component, /Homepage\/Header Logo/)
  assert.match(component, /Normal Pages Logo/)
  assert.match(component, /Original Colored Logo/)
  assert.match(component, /White\/Light Logo/)
  assert.match(component, /DOOR_BUILDER_PAGE_BACKGROUND/)
  assert.match(detail, /logo_header_variant: variants\.header/)
  assert.match(profile, /update_my_dealer_logo_variants/)
})
