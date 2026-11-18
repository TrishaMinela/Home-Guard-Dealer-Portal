import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { restrictedDealerSectionNotes } from '../src/components/dealerDetailSections.ts'
import { dealerWithSavedLogos } from '../src/utils/dealerSavedLogos.ts'
import { portalEntryCopy } from '../src/utils/portalEntryCopy.ts'

const dealer = {
  logo_url: 'https://cdn.example/original.png',
  logo_light_url: 'https://cdn.example/white.png',
}

test('initial dealer load keeps saved original, white, and black logos when those columns exist', () => {
  const access = readFileSync('src/hooks/useAccountAccess.ts', 'utf8')
  assert.match(access, /logo_url, logo_light_url/)
  assert.match(access, /logo_black_url, logo_generated_black_url, logo_generated_black_usable/)
  const merged = dealerWithSavedLogos(
    dealer,
    { data: { logo_generated_light_usable: true }, error: null },
    { data: { logo_black_url: 'https://cdn.example/black.png', logo_generated_black_url: null, logo_generated_black_usable: false }, error: null },
  )
  assert.equal(merged.logo_url, 'https://cdn.example/original.png')
  assert.equal(merged.logo_light_url, 'https://cdn.example/white.png')
  assert.equal(merged.logo_generated_light_usable, true)
  assert.equal(merged.logo_black_url, 'https://cdn.example/black.png')
  const fallback = dealerWithSavedLogos(dealer, { data: null, error: new Error('missing') }, { data: null, error: new Error('missing') })
  assert.equal(fallback.logo_url, dealer.logo_url)
  assert.equal(fallback.logo_black_url, undefined)
})

test('lead notifications and dashboard rows open that lead, and a missing lead is explained', () => {
  const portal = readFileSync('src/components/PortalLayout.tsx', 'utf8')
  const admin = readFileSync('src/components/AdminLayout.tsx', 'utf8')
  const leads = readFileSync('src/pages/LeadsPage.tsx', 'utf8')
  const adminLeads = readFileSync('src/pages/AdminLeadsPage.tsx', 'utf8')
  const dashboard = readFileSync('src/pages/DashboardPage.tsx', 'utf8')
  assert.match(portal, /path: `\/leads\/\$\{lead\.id\}`/)
  assert.match(admin, /path: `\/admin\/leads\/\$\{lead\.id\}`/)
  assert.match(dashboard, /to=\{`\/leads\/\$\{lead\.id\}`\}/)
  assert.match(leads, /This lead could not be found, or you do not have access to it\./)
  assert.match(adminLeads, /This lead could not be found, or you do not have access to it\./)
  assert.match(dashboard, /error \? 'Unavailable'/)
  assert.match(readFileSync('src/pages/AdminDashboardPage.tsx', 'utf8'), /error \? 'Unavailable'/)
})

test('hidden dealer sections name the required role and do not render their tools', () => {
  assert.deepEqual(restrictedDealerSectionNotes({ canManageDealerCredentials: true, canManageDealerUsers: true }), [])
  assert.deepEqual(
    restrictedDealerSectionNotes({ canManageDealerCredentials: false, canManageDealerUsers: true }).map((note) => note.requiredRole),
    ['an access manager'],
  )
  assert.deepEqual(
    restrictedDealerSectionNotes({ canManageDealerCredentials: true, canManageDealerUsers: false }).map((note) => note.title),
    ['Dealer Users'],
  )
  const page = readFileSync('src/pages/DealerDetailPage.tsx', 'utf8')
  assert.match(page, /Back to Dealers/)
  assert.match(page, /available to an access manager\./)
  assert.match(page, /available to an access manager or a billing admin\./)
  assert.doesNotMatch(page, /label: 'Marketing Banners'/)
})

test('wording covers staff sign-in, invite destination, leads, disabled dealers, and intentional CRM pause', () => {
  const login = readFileSync('src/components/LoginPage.tsx', 'utf8')
  const leads = readFileSync('src/pages/LeadsPage.tsx', 'utf8')
  const dealers = readFileSync('src/pages/AdminDealersPage.tsx', 'utf8')
  const billing = readFileSync('src/pages/BillingAccessManagementPage.tsx', 'utf8')
  const crm = readFileSync('src/components/DealerCrmIntegrations.tsx', 'utf8')
  const library = readFileSync('src/components/marketing-banners/MarketingBannerLibrary.tsx', 'utf8')
  const settings = readFileSync('src/pages/DealerSettingsPage.tsx', 'utf8')
  assert.match(login, /Portal access/)
  assert.match(login, /Dealers and Home Guard staff/)
  assert.doesNotMatch(login, /Dealer access/)
  assert.equal(portalEntryCopy('/admin').button, 'Go to Home Guard Admin')
  assert.equal(portalEntryCopy('/billing').button, 'Go to Billing')
  assert.equal(portalEntryCopy('/dashboard').button, 'Go to Dealer Portal')
  assert.match(readFileSync('src/components/InviteSetupPage.tsx', 'utf8'), /portalEntryCopy\(destination\)\.button/)
  assert.match(leads, /eyebrow">Leads/)
  assert.doesNotMatch(leads, /Customers/)
  assert.match(dealers, /'Disabled'/)
  assert.doesNotMatch(dealers, /'Inactive'/)
  assert.doesNotMatch(billing, /School Radius|schoolradius/)
  assert.match(crm, /stays off on purpose/)
  assert.match(crm, /Delivery off/)
  assert.doesNotMatch(library, /unverified|bundled artwork|Slots without/)
  assert.match(settings, /href="\/auth\/forgot-password"/)
  assert.match(settings, /contact your Home Guard representative/)
  assert.match(readFileSync('src/App.css', 'utf8'), /--notification-clearance: 96px/)
})
