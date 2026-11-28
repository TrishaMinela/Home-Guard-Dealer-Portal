import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { dealerLogoRequestAccess } from '../api/_lib/dealerPortalAccess.ts'
import { sameDealer, visibleLead } from '../src/utils/dealerResourceAccess.ts'

const dealerA = '11111111-1111-4111-8111-111111111111'
const dealerB = '22222222-2222-4222-8222-222222222222'

test('a dealer admin can generate a logo only for an active dealership they belong to', () => {
  assert.equal(dealerLogoRequestAccess({ isHomeGuardAdmin: false, isDealerAdminForDealer: true, dealerIsActive: true }).allowed, true)
  assert.equal(dealerLogoRequestAccess({ isHomeGuardAdmin: false, isDealerAdminForDealer: false, dealerIsActive: true }).allowed, false)
  assert.equal(dealerLogoRequestAccess({ isHomeGuardAdmin: true, isDealerAdminForDealer: false, dealerIsActive: false }).allowed, true)
  const paused = dealerLogoRequestAccess({ isHomeGuardAdmin: false, isDealerAdminForDealer: true, dealerIsActive: false })
  assert.equal(paused.allowed, false)
  if (!paused.allowed) assert.equal(paused.status, 403)
})

test('logo generation checks membership for the dealer id in the request', () => {
  const source = readFileSync('api/dealer-light-logo.ts', 'utf8')
  const membership = source.indexOf(".eq('dealer_id', body.dealerId)")
  const role = source.indexOf(".eq('role', 'dealer_admin')")
  const decision = source.lastIndexOf('dealerLogoRequestAccess(')
  assert.ok(membership > 0 && role > membership && decision > role)
})

test('staff-only dealer endpoints authorize the caller before trusting a dealer id', () => {
  const checks: Array<[string, string]> = [
    ['api/dealer-crm-integrations.ts', 'authorizeBillingAccessManager'],
    ['api/dealer-marketing-context.ts', 'authorizeBillingAccessManager'],
    ['api/dealer-user-access.ts', 'authorizeBillingAccessOperator'],
    ['api/marketing-banners.ts', 'authorizeHgiAdmin'],
    ['api/dealer-door-builder-webhook.ts', 'authorizeDoorBuilderWebhookManager'],
  ]
  for (const [path, guard] of checks) {
    const source = readFileSync(path, 'utf8')
    const guardAt = source.indexOf(guard)
    assert.ok(guardAt >= 0, path)
    const dealerAt = source.indexOf('dealerId')
    if (dealerAt >= 0) assert.ok(guardAt < dealerAt, `${path} uses a dealer id before authorization`)
  }
  const webhook = readFileSync('api/_lib/doorBuilderWebhookPolicy.ts', 'utf8')
  const authorize = webhook.indexOf('input.authorize(input.authorization)')
  const lookup = webhook.indexOf('input.store.findDealer(input.dealerId)')
  assert.ok(authorize >= 0 && authorize < lookup)
})

test('lead lists and opened leads stay on the signed-in dealership', () => {
  const hook = readFileSync('src/hooks/useLeads.ts', 'utf8')
  const page = readFileSync('src/pages/LeadsPage.tsx', 'utf8')
  assert.match(hook, /\.eq\('dealer_id', dealerId\)/)
  assert.match(page, /visibleLead\(leads, dealerId, leadId\)/)
  const leads = [
    { id: 'lead-a', dealer_id: dealerA, first_name: 'Alex' },
    { id: 'lead-b', dealer_id: dealerB, first_name: 'Blair' },
  ]
  assert.equal(visibleLead(leads, dealerA, 'lead-a')?.first_name, 'Alex')
  assert.equal(visibleLead(leads, dealerA, 'lead-b'), null)
  assert.equal(visibleLead(leads, dealerA.toUpperCase(), 'lead-a')?.id, 'lead-a')
  assert.equal(sameDealer(dealerA, dealerB), false)
})

test('dealer members do not get company or branding write controls', () => {
  const portal = readFileSync('src/components/PortalLayout.tsx', 'utf8')
  const profile = readFileSync('src/pages/DealerCompanyProfilePage.tsx', 'utf8')
  const studio = readFileSync('src/pages/BrandingStudioPage.tsx', 'utf8')
  assert.match(portal, /canEditProfile=\{dealerRole === 'dealer_admin'\}/)
  assert.match(portal, /canEditAppearance=\{dealerRole === 'dealer_admin'\}/)
  assert.match(profile, /disabled=\{!canEditProfile\}/)
  assert.match(profile, /if \(!canEditProfile\) return/)
  assert.match(studio, /const canWrite = mode === 'admin' \|\| canEditAppearance/)
  assert.match(studio, /if \(!canWrite \|\| !dirty/)
})
