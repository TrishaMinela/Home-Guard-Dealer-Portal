import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const endpoint = readFileSync('api/billing-access-management.ts', 'utf8')
const page = readFileSync('src/pages/BillingAccessManagementPage.tsx', 'utf8')
const migration = readFileSync('supabase/migrations/20261030000000_add_portal_administrator_access.sql', 'utf8')

test('Portal administrator management stays behind access-manager authorization', () => {
  assert.match(endpoint, /authorizeBillingAccessManager\(authorization\)/)
  assert.match(endpoint, /action === 'grant_portal_admin'/)
  assert.match(endpoint, /action === 'revoke_portal_admin'/)
  assert.match(endpoint, /action === 'resend_portal_admin'/)
  assert.doesNotMatch(endpoint, /auth\.admin\.deleteUser/)
})

test('administrator memberships are changed atomically without dealer or client grants', () => {
  assert.match(migration, /insert into public\.home_guard_admins/)
  assert.match(migration, /insert into public\.billing_internal_admins/)
  assert.match(migration, /insert into public\.billing_access_managers/)
  assert.match(migration, /delete from public\.billing_access_managers/)
  assert.match(migration, /delete from public\.billing_internal_admins/)
  assert.match(migration, /delete from public\.home_guard_admins/)
  assert.doesNotMatch(migration, /insert into public\.dealer_users/)
  assert.doesNotMatch(migration, /insert into public\.billing_account_users/)
})

test('database guards require an access manager and preserve a usable replacement', () => {
  assert.match(migration, /billing_access_managers[\s\S]*p_actor_user_id/)
  assert.match(migration, /self_revocation_forbidden/)
  assert.match(migration, /last_usable_administrator/)
  assert.match(migration, /email_confirmed_at is not null/)
  assert.match(migration, /last_sign_in_at is not null/)
  assert.match(migration, /grant execute[\s\S]*to service_role/)
  assert.match(migration, /revoke all[\s\S]*from public, anon, authenticated/)
})

test('Portal UI explains the combined role and uses the branded invitation route', () => {
  assert.match(page, /Portal Administrator Access/)
  assert.match(page, /Home Guard Admin · Billing Admin · Access Manager/)
  assert.match(page, /Remove Portal administrator\?/)
  assert.match(endpoint, /new URL\('\/auth\/invite'/)
  assert.doesNotMatch(page, /window\.confirm|window\.alert/)
})

test('grant and revoke operations are recorded in the credential-free audit log', () => {
  for (const action of ['portal_admin_invited', 'portal_admin_granted', 'portal_admin_revoked', 'portal_admin_invite_resent']) {
    assert.match(migration, new RegExp(action))
  }
})
