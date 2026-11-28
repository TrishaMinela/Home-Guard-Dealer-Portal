import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { dealerLogoRequestAccess } from '../api/_lib/dealerPortalAccess.ts'
import { dealerInviteRole, dealerRoleLabel } from '../src/utils/dealerRole.ts'
import { DEALER_UNAVAILABLE_MESSAGE } from '../src/utils/dealerUnavailable.ts'

test('new invitations default to Dealer Member and reject any other role', () => {
  assert.equal(dealerInviteRole(undefined), 'dealer_member')
  assert.equal(dealerInviteRole(''), 'dealer_member')
  assert.equal(dealerInviteRole('dealer_member'), 'dealer_member')
  assert.equal(dealerInviteRole('dealer_admin'), 'dealer_admin')
  assert.equal(dealerInviteRole('member'), null)
  assert.equal(dealerInviteRole('admin'), null)
  assert.equal(dealerInviteRole('dealer_admin '), null)
})

test('the access list names both roles without rewriting stored values', () => {
  assert.equal(dealerRoleLabel('dealer_admin'), 'Dealer Admin')
  assert.equal(dealerRoleLabel('dealer_member'), 'Dealer Member')
  assert.equal(dealerRoleLabel('member'), 'Dealer Member')
  const endpoint = readFileSync('api/dealer-user-access.ts', 'utf8')
  const roleCheck = endpoint.indexOf('dealerInviteRole(body.role)')
  const invitation = endpoint.indexOf("if (body.action === 'grant' && !target)")
  assert.ok(roleCheck > 0 && roleCheck < invitation)
  assert.match(endpoint, /role: invitedRole/)
  assert.doesNotMatch(endpoint, /\.update\(\{[^}]*role/)
})

test('an inactive dealership is blocked for its admin and still open to Home Guard staff', () => {
  const paused = dealerLogoRequestAccess({ isHomeGuardAdmin: false, isDealerAdminForDealer: true, dealerIsActive: false })
  assert.equal(paused.allowed, false)
  if (!paused.allowed) {
    assert.equal(paused.status, 403)
    assert.equal(paused.message, DEALER_UNAVAILABLE_MESSAGE)
  }
  assert.equal(dealerLogoRequestAccess({ isHomeGuardAdmin: true, isDealerAdminForDealer: false, dealerIsActive: false }).allowed, true)
  assert.equal(dealerLogoRequestAccess({ isHomeGuardAdmin: false, isDealerAdminForDealer: true, dealerIsActive: true }).allowed, true)
  const proposal = readFileSync('supabase/proposed/NOT_APPLIED_20261127000000_block_inactive_dealer_portal_access.sql', 'utf8')
  assert.match(proposal, /NOT APPLIED/)
  assert.match(proposal, /is_active_dealer_member/)
  assert.match(proposal, /security definer/)
  assert.match(proposal, /set search_path = ''/)
  assert.match(proposal, /set row_security = off/)
  assert.doesNotMatch(proposal, /security invoker/)
  assert.match(proposal, /my_dealer_portal_status/)
  assert.doesNotMatch(proposal, /update public\.dealers set|delete from|insert into public\.dealer_users/i)
  assert.doesNotMatch(readFileSync('supabase/migrations/20260909000000_add_secure_dealer_aware_lead_ingestion.sql', 'utf8'), /is_active_dealer_member/)
})
