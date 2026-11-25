import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { dealerSetupChecklist } from '../src/features/dealer-setup/checklist.ts'

const savedDealer = {
  company_name: 'Northstar',
  slug: 'northstar',
  primary_contact_name: 'Alex',
  email: 'alex@northstar.example',
  phone: '555-0100',
  address: '1 Main',
  city: 'Austin',
  state: 'TX',
  zip: '78701',
  logo_url: 'https://cdn.example/original.png',
  logo_light_url: 'https://cdn.example/white.png',
  logo_black_url: 'https://cdn.example/black.png',
  logo_header_variant: 'original',
  logo_pages_variant: 'white',
  primary_color: '#0d666c',
  secondary_color: '#f8d30e',
  heading_font_family: 'Montserrat',
  body_font_family: null,
}

test('setup checklist verifies saved profile data and never auto-completes outside work', () => {
  const items = dealerSetupChecklist(savedDealer)
  const byId = Object.fromEntries(items.map((item) => [item.id, item]))
  assert.equal(byId['company-details']?.status, 'ready')
  assert.equal(byId['door-builder-url']?.status, 'ready')
  assert.equal(byId['logo-original']?.status, 'ready')
  assert.equal(byId['logo-white']?.status, 'ready')
  assert.equal(byId['logo-black']?.status, 'ready')
  assert.equal(byId['homepage-logo']?.status, 'ready')
  assert.equal(byId['pages-logo']?.status, 'ready')
  assert.equal(byId['colors']?.status, 'ready')
  for (const id of ['dealer-admin', 'marketing', 'workflows', 'crm', 'lead-routing']) {
    assert.equal(byId[id]?.status, 'confirm', id)
  }
  const empty = dealerSetupChecklist({ company_name: 'New', slug: 'new' })
  assert.equal(empty.find((item) => item.id === 'logo-black')?.status, 'needs-info')
  assert.equal(empty.find((item) => item.id === 'crm')?.status, 'confirm')
  assert.match(empty.find((item) => item.id === 'workflows')?.detail ?? '', /does not mean they are connected/)
})

test('new dealers open their setup page and marketing explains the website steps', () => {
  const addDealer = readFileSync('src/pages/AddDealerPage.tsx', 'utf8')
  const marketing = readFileSync('src/pages/MarketingToolsPage.tsx', 'utf8')
  const library = readFileSync('src/components/marketing-banners/MarketingBannerLibrary.tsx', 'utf8')
  const profile = readFileSync('src/pages/DealerCompanyProfilePage.tsx', 'utf8')
  const detail = readFileSync('src/pages/DealerDetailPage.tsx', 'utf8')
  assert.match(addDealer, /\/admin\/dealers\/\$\{created\.id\}`/)
  assert.doesNotMatch(addDealer, /#setup/)
  assert.match(marketing, /Use this on your website/)
  assert.match(marketing, /Copy Door Builder Link/)
  assert.match(marketing, /do not recolor themselves/)
  assert.match(marketing, /does not host that image/)
  const intro = marketing.indexOf('Use this on your website')
  const embeddedStart = marketing.indexOf('{embedded ? (')
  const libraryAt = marketing.indexOf('<MarketingBannerLibrary')
  const embeddedVisualizer = marketing.indexOf('>Visualizer Link<')
  const standaloneVisualizer = marketing.indexOf('>Visualizer Link<', libraryAt)
  assert.ok(intro > -1 && embeddedStart > intro && embeddedVisualizer > embeddedStart && embeddedVisualizer < libraryAt)
  assert.ok(standaloneVisualizer > libraryAt)
  assert.match(library, /Download PNG/)
  assert.match(library, /Download JPG/)
  for (const id of ['company-details', 'branding-studio', 'colors-and-typography', 'website-address']) {
    assert.match(profile, new RegExp(`id="${id}"`))
  }
  assert.match(profile, /Cancel/)
  assert.match(profile, /document\.addEventListener\('click', onClick, true\)/)
  assert.match(readFileSync('src/utils/unsavedProfileNavigation.ts', 'utf8'), /unsaved company or color changes/)
  assert.match(detail, /DealerSetupChecklist/)
  assert.match(detail, /id="website-address"/)
  assert.match(detail, /Review the request/)
  assert.doesNotMatch(readFileSync('src/components/AdminLayout.tsx', 'utf8'), /label: 'Marketing Banners'/)
})
