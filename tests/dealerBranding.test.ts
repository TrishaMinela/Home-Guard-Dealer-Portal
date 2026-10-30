import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  DEFAULT_DEALER_PRIMARY,
  DEFAULT_DEALER_SECONDARY,
  dealerInitials,
  getDealerBrand,
  normalizeBrandColor,
} from '../src/utils/dealerBrand.ts'

const portalLayout = readFileSync('src/components/PortalLayout.tsx', 'utf8')
const adminLayout = readFileSync('src/components/AdminLayout.tsx', 'utf8')
const billingLayout = readFileSync('src/components/BillingClientLayout.tsx', 'utf8')
const accountAccess = readFileSync('src/hooks/useAccountAccess.ts', 'utf8')
const css = readFileSync('src/App.css', 'utf8')
const app = readFileSync('src/App.tsx', 'utf8')
const profile = readFileSync('src/pages/DealerCompanyProfilePage.tsx', 'utf8')

type DealerBrandFixture = {
  id: string
  company_name: string
  slug: string
  logo_url: string | null
  logo_light_url: string | null
  primary_color: string | null
  secondary_color: string | null
}

function dealer(overrides: Partial<DealerBrandFixture> = {}): DealerBrandFixture {
  return {
    id: 'dealer-a',
    company_name: 'Example Door Company',
    slug: 'example-door-company',
    logo_url: 'https://example.test/primary.png',
    logo_light_url: 'https://example.test/light.png',
    primary_color: '#123456',
    secondary_color: '#fedcba',
    ...overrides,
  }
}

test('dealer branding is derived only from the authenticated dealer record', () => {
  const dealerA = getDealerBrand(dealer())
  const dealerB = getDealerBrand(dealer({ id: 'dealer-b', company_name: 'Second Dealer', slug: 'second', primary_color: '#654321' }))
  assert.equal(dealerA.dealerId, 'dealer-a')
  assert.equal(dealerB.dealerId, 'dealer-b')
  assert.notEqual(dealerA.primary, dealerB.primary)
  assert.doesNotMatch(portalLayout, /useParams|location\.pathname|localStorage|URLSearchParams/)
})

test('logo selection follows dark and light context priorities', () => {
  const brand = getDealerBrand(dealer())
  assert.deepEqual(brand.sidebarLogos, ['https://example.test/light.png', 'https://example.test/primary.png'])
  assert.deepEqual(brand.mobileLogos, ['https://example.test/primary.png', 'https://example.test/light.png'])
  const noLogo = getDealerBrand(dealer({ logo_url: null, logo_light_url: null }))
  assert.deepEqual(noLogo.sidebarLogos, [])
  assert.equal(noLogo.initials, 'ED')
  assert.equal(dealerInitials('Very Long Dealer Name'), 'VL')
})

test('invalid and missing dealer colors safely use Home Guard fallbacks', () => {
  assert.equal(normalizeBrandColor('red; background:url(x)', DEFAULT_DEALER_PRIMARY), DEFAULT_DEALER_PRIMARY)
  assert.equal(normalizeBrandColor(null, DEFAULT_DEALER_SECONDARY), DEFAULT_DEALER_SECONDARY)
  assert.equal(normalizeBrandColor('#AbC', DEFAULT_DEALER_PRIMARY), '#aabbcc')
})

test('dealer theme is scoped away from admin and billing client layouts', () => {
  assert.match(portalLayout, /portal-shell portal-shell--dealer/)
  assert.match(css, /\.portal-shell--dealer/)
  assert.doesNotMatch(adminLayout, /portal-shell--dealer/)
  assert.doesNotMatch(billingLayout, /portal-shell--dealer/)
})

test('profile updates refresh the authenticated dealer shell without another lookup', () => {
  assert.match(profile, /onDealerUpdated\(updatedDealer\)/)
  assert.match(profile, /onDealerUpdated\(data as DealerAccount\)/)
  assert.match(app, /onDealerUpdated=\{updateDealer\}/)
})

test('multi-dealer ambiguity does not silently choose a branding context', () => {
  assert.doesNotMatch(accountAccess, /\.limit\(1\)/)
  assert.match(accountAccess, /memberships\.length > 1/)
  assert.match(accountAccess, /connected to more than one dealer/)
})
