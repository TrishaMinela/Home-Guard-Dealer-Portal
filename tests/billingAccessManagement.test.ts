import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync('supabase/migrations/20261029060000_add_billing_access_management.sql', 'utf8')
const endpoint = readFileSync('api/billing-access-management.ts', 'utf8')
const authorizer = readFileSync('api/_lib/authorizeBillingAccessManager.ts', 'utf8')
const page = readFileSync('src/pages/BillingAccessManagementPage.tsx', 'utf8')
const layout = readFileSync('src/components/AdminLayout.tsx', 'utf8')

test('access-management authority is separate and bootstraps only School Radius', () => {
  assert.match(migration, /create table public\.billing_access_managers/)
  assert.match(migration, /9ff44f07-b720-4e51-a5a2-a36fdd1c331a/)
  assert.doesNotMatch(migration, /insert into public\.home_guard_admins/)
  assert.doesNotMatch(migration, /insert into public\.billing_account_users/)
})

test('server endpoint requires access-manager authorization and keeps admin API server-only', () => {
  assert.match(endpoint, /authorizeBillingAccessManager\(authorization\)/)
  assert.match(endpoint, /process\.env\.SUPABASE_SERVICE_ROLE_KEY/)
  assert.doesNotMatch(page, /SERVICE_ROLE|service.role/i)
  assert.match(authorizer, /rpc\('is_billing_access_manager'\)/)
})

test('revocation protects access managers and preserves auth accounts', () => {
  assert.match(endpoint, /Access-manager billing access is protected/)
  assert.match(endpoint, /from\('billing_internal_admins'\)\.delete\(\)/)
  assert.doesNotMatch(endpoint, /deleteUser/)
})

test('UI and route are visible only to access managers', () => {
  assert.match(layout, /accessManagerOnly: true/)
  assert.match(layout, /isBillingAccessManager \? <BillingAccessManagementPage/)
  assert.match(page, /Grant Billing Access/)
  assert.match(page, /Remove Billing Access/)
})
