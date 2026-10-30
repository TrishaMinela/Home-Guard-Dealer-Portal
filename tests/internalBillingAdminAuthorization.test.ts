import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync('supabase/migrations/20261030000200_fix_internal_billing_admin_authorization.sql', 'utf8')
const billingEndpoint = readFileSync('api/billing-access-management.ts', 'utf8')
const dealerEndpoint = readFileSync('api/dealer-user-access.ts', 'utf8')
const layout = readFileSync('src/components/AdminLayout.tsx', 'utf8')

test('internal billing role is an atomic admin plus billing membership without access-manager elevation', () => {
  assert.match(migration, /insert into public\.home_guard_admins/)
  assert.match(migration, /insert into public\.billing_internal_admins/)
  assert.doesNotMatch(migration, /insert into public\.billing_access_managers/)
  assert.match(migration, /incompatible_portal_role/)
  assert.match(migration, /to service_role/)
})

test('reviewed account repair is guarded by UUID, email, confirmation, and incompatible-role checks', () => {
  for (const value of [
    '7e8f74aa-be7a-4f41-abae-80ddc9d0aed6',
    'trisha.byu@gmail.com',
    '45cd5782-20b9-4328-bc79-5d63baf757a9',
    'billingadmin@test.hgi',
  ]) assert.match(migration, new RegExp(value.replaceAll('.', '\\.')))
  assert.match(migration, /email_confirmed_at is not null/)
  assert.match(migration, /v_expected <> 2/)
  assert.match(migration, /billing_account_users/)
  assert.match(migration, /dealer_users/)
})

test('internal billing admins can manage clients and dealer users but not administrators', () => {
  assert.match(billingEndpoint, /authorizeBillingAccessOperator/)
  assert.match(billingEndpoint, /managerOnlyActions/)
  assert.match(dealerEndpoint, /authorizeBillingAccessOperator/)
  assert.match(layout, /canManageAdministrators=\{isBillingAccessManager\}/)
  assert.match(layout, /canManageDealerUsers=\{isBillingAccessManager \|\| isInternalBillingAdmin\}/)
})
