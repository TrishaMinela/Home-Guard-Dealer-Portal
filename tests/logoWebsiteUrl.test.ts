import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { dealerWithSavedLogos } from '../src/utils/dealerSavedLogos.ts'
import {
  logoWebsiteFieldValue,
  logoWebsiteHref,
  normalizeLogoWebsiteUrl,
} from '../src/utils/logoWebsiteUrl.ts'

test('logo website addresses accept only http and https and trim whitespace', () => {
  assert.deepEqual(normalizeLogoWebsiteUrl('  https://example.com/brand  '), { url: 'https://example.com/brand', error: null })
  assert.deepEqual(normalizeLogoWebsiteUrl('http://dealer.example/path?q=1'), { url: 'http://dealer.example/path?q=1', error: null })
  assert.deepEqual(normalizeLogoWebsiteUrl('   '), { url: null, error: null })
  assert.equal(normalizeLogoWebsiteUrl('javascript:alert(1)').url, null)
  assert.equal(normalizeLogoWebsiteUrl('data:text/html,hi').url, null)
  assert.equal(normalizeLogoWebsiteUrl('vbscript:msgbox(1)').url, null)
  assert.equal(normalizeLogoWebsiteUrl('file:///etc/passwd').url, null)
  assert.equal(normalizeLogoWebsiteUrl('https://example.com/has space').url, null)
  assert.match(normalizeLogoWebsiteUrl('notaurl').error ?? '', /http/)
  assert.equal(logoWebsiteHref('https://logo.example/one'), 'https://logo.example/one')
  assert.equal(logoWebsiteHref('javascript:alert(1)', 'https://dealer.example'), 'https://dealer.example/')
  assert.equal(logoWebsiteHref('', 'https://dealer.example/home'), 'https://dealer.example/home')
  assert.equal(logoWebsiteHref('', ''), null)
  assert.equal(logoWebsiteHref('https://second.example'), 'https://second.example/')
  assert.equal(logoWebsiteHref('', undefined), null)
})

test('Logo 1 prefill uses the company website and Logo 2 does not', () => {
  assert.equal(logoWebsiteFieldValue(null, 'https://dealer.example'), 'https://dealer.example')
  assert.equal(logoWebsiteFieldValue('https://logo.example', 'https://dealer.example'), 'https://logo.example')
  assert.equal(logoWebsiteFieldValue(null), '')
  assert.equal(logoWebsiteFieldValue('  ', 'https://dealer.example'), 'https://dealer.example')
})

test('a missing logo website column does not drop the saved logos', () => {
  const merged = dealerWithSavedLogos(
    { website: 'https://dealer.example', logo_url: 'https://cdn.example/original.png' },
    { data: { logo_generated_light_usable: true }, error: null },
    { data: null, error: null },
    { data: { logo_display: 'dual', logo_secondary_url: 'https://cdn.example/second.png' }, error: null },
    { data: null, error: new Error('column logo_website_url does not exist') },
  )
  assert.equal(merged.logo_display, 'dual')
  assert.equal(merged.logo_secondary_url, 'https://cdn.example/second.png')
  assert.equal(merged.logo_website_url, undefined)
  const saved = dealerWithSavedLogos(
    { website: 'https://dealer.example' },
    { data: null, error: null },
    { data: null, error: null },
    { data: { logo_display: 'single' }, error: null },
    { data: { logo_website_url: null, logo_secondary_website_url: 'https://partner.example' }, error: null },
  )
  assert.equal(saved.logo_website_url, null)
  assert.equal(saved.logo_secondary_website_url, 'https://partner.example')
})

test('logo website migration is additive and each URL saves on its own path', () => {
  const migration = readFileSync('supabase/migrations/20261120000000_add_dealer_logo_website_urls.sql', 'utf8')
  assert.match(migration, /add column if not exists logo_website_url text null/)
  assert.match(migration, /add column if not exists logo_secondary_website_url text null/)
  assert.ok(migration.includes("logo_website_url ~* '^https?://[^[:space:][:cntrl:]]+$'"))
  assert.ok(migration.includes("logo_secondary_website_url ~* '^https?://[^[:space:][:cntrl:]]+$'"))
  assert.match(migration, /update public\.dealers\s+set logo_website_url = v_url/)
  assert.match(migration, /update public\.dealers\s+set logo_secondary_website_url = v_url/)
  assert.doesNotMatch(migration, /update public\.dealers[\s\S]*website =/)
  assert.match(migration, /grant execute on function public\.update_my_dealer_logo_website_url\(uuid, text\) to authenticated/)
  assert.match(migration, /grant execute on function public\.update_my_dealer_secondary_logo_website_url\(uuid, text\) to authenticated/)
  assert.match(migration, /Dealer Admin access is required/)
  assert.match(migration, /Rollback:/)
  assert.match(migration, /drop column if exists logo_website_url/)
  assert.doesNotMatch(migration, /update public\.dealers set website/)

  const profile = readFileSync('src/pages/DealerCompanyProfilePage.tsx', 'utf8')
  const detail = readFileSync('src/pages/DealerDetailPage.tsx', 'utf8')
  const settings = readFileSync('src/components/DealerLogoVariantSettings.tsx', 'utf8')
  assert.match(profile, /update_my_dealer_logo_website_url/)
  assert.match(profile, /update_my_dealer_secondary_logo_website_url/)
  assert.match(profile, /logoVariantSavePlan\(dealer\.logo_display, variants\.header, variants\.pages, variants\.secondaryHeader, variants\.secondaryPages\)/)
  assert.match(detail, /update\(\{ \[column\]: url \}\)/)
  assert.match(detail, /logoVariantSavePlan\(dealer\.logo_display, variants\.header, variants\.pages, variants\.secondaryHeader, variants\.secondaryPages\)/)
  assert.match(detail, /update\(\{ logo_display: display \}\)/)
  assert.match(settings, /Logo 1 Website URL/)
  assert.match(settings, /Logo 2 Website URL/)
  assert.match(settings, /placeholder="https:\/\/example.com"/)
  assert.match(settings, /If left blank, Logo 1 uses the dealer's company website\./)
  assert.match(settings, /If left blank, Logo 2 is not clickable\./)
  assert.match(settings, /normalizeLogoDisplay\(dealer\.logo_display\) === 'dual'/)
  assert.match(migration, /nullif\(btrim\(p_logo_website_url\), ''\)/)
  assert.match(migration, /nullif\(btrim\(p_logo_secondary_website_url\), ''\)/)
  assert.match(profile, /p_logo_website_url: url \?\? ''/)
  assert.match(profile, /\[column\]: url/)
  assert.match(detail, /\[column\]: url/)
  assert.doesNotMatch(readFileSync('supabase/migrations/20261119000000_add_dealer_dual_logo.sql', 'utf8'), /logo_website_url/)
  const homepage = settings.indexOf('id="homepage-logo-selection"')
  const logo1 = settings.indexOf('Logo 1 Website URL')
  const logo2 = settings.indexOf('Logo 2 Website URL')
  const pagesColumn = settings.indexOf('id="pages-logo-selection"')
  assert.ok(homepage >= 0 && homepage < logo1 && logo1 < logo2 && logo2 < pagesColumn)
  assert.equal(settings.split('id="homepage-logo-selection"').length, 2)
  assert.equal(settings.split('id="pages-logo-selection"').length, 2)
  assert.match(readFileSync('src/utils/editDealerHashFocus.ts', 'utf8'), /export function editDealerFocusId/)
  assert.match(readFileSync('src/pages/EditDealerPage.tsx', 'utf8'), /useEditDealerHashFocus/)
  assert.match(readFileSync('src/features/marketing-banners/catalog.ts', 'utf8'), /RESTORED_ORIGINAL_SLOTS = new Set\(\[1, 5\]\)/)
})
