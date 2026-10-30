import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const endpoint = readFileSync('api/dealer-user-access.ts', 'utf8')
const component = readFileSync('src/components/DealerUserAccess.tsx', 'utf8')
const page = readFileSync('src/pages/DealerDetailPage.tsx', 'utf8')
const layout = readFileSync('src/components/AdminLayout.tsx', 'utf8')
const migration = readFileSync('supabase/migrations/20261030000100_add_dealer_user_access_audit.sql', 'utf8')

test('dealer-user management requires access-manager authorization on server and UI', () => {
  assert.match(endpoint, /authorizeBillingAccessManager\(authorization\)/)
  assert.match(layout, /canManageDealerUsers=\{isBillingAccessManager\}/)
  assert.match(page, /canManageDealerUsers && <DealerUserAccess/)
})

test('existing, new, and pending Auth users follow distinct invitation outcomes', () => {
  assert.match(endpoint, /if \(body\.action === 'grant' && !target\)/)
  assert.match(endpoint, /target\.email_confirmed_at/)
  assert.match(endpoint, /Dealer access granted\. This user can sign in with their existing Portal account\./)
  assert.match(endpoint, /Dealer access granted and an invitation was sent\./)
  assert.match(endpoint, /Dealer access granted and a new invitation was sent\./)
  assert.match(endpoint, /new URL\('\/auth\/invite'/)
})

test('dealer membership rejects incompatible Portal roles and other dealers', () => {
  for (const table of ['home_guard_admins', 'billing_internal_admins', 'billing_access_managers', 'billing_account_users']) {
    assert.match(endpoint, new RegExp(`from\\('${table}'\\)`))
  }
  assert.match(endpoint, /membership\.dealer_id !== dealerId/)
  assert.match(endpoint, /role: 'dealer_admin'/)
  assert.doesNotMatch(endpoint, /insert\(\{[^}]*billing_internal_admin|insert\(\{[^}]*billing_account_id/)
})

test('removal preserves Auth identity and uses the branded confirmation modal', () => {
  assert.match(endpoint, /from\('dealer_users'\)\.delete\(\)/)
  assert.doesNotMatch(endpoint, /deleteUser/)
  assert.match(component, /<ConfirmationModal/)
  assert.match(component, /Remove dealer access\?/)
  assert.doesNotMatch(component, /window\.confirm|window\.alert/)
})

test('dealer access mutations have a scoped audit trail', () => {
  assert.match(migration, /dealer_user_access_audit_log/)
  assert.match(migration, /references public\.dealers\(id\)/)
  assert.match(migration, /is_billing_access_manager\(\)/)
  assert.match(endpoint, /dealer_user_access_audit_log/)
})
