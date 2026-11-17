import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const endpoint = readFileSync('api/dealer-user-access.ts', 'utf8')
const marketingEndpoint = readFileSync('api/dealer-marketing-context.ts', 'utf8')
const users = readFileSync('src/components/DealerUserAccess.tsx', 'utf8')
const passwordModal = readFileSync('src/components/DealerPasswordModal.tsx', 'utf8')
const dealerDetail = readFileSync('src/pages/DealerDetailPage.tsx', 'utf8')
const adminLayout = readFileSync('src/components/AdminLayout.tsx', 'utf8')
const dealerLayout = readFileSync('src/components/PortalLayout.tsx', 'utf8')
const marketingTools = readFileSync('src/pages/MarketingToolsPage.tsx', 'utf8')
const migration = readFileSync('supabase/migrations/20261105000000_add_dealer_password_audit_action.sql', 'utf8')

test('password management uses server-only Admin Auth and access-manager authorization', () => {
  assert.match(endpoint, /body\.action === 'set-password'/)
  assert.match(endpoint, /!access\.isAccessManager/)
  assert.match(endpoint, /auth\.admin\.updateUserById\(target\.id, \{ password \}\)/)
  assert.match(endpoint, /eq\('dealer_id', dealerId\)\.eq\('user_id', target\.id\)/)
  assert.match(endpoint, /password\.length < 6/)
  assert.doesNotMatch(users, /service.role|SUPABASE_SERVICE_ROLE_KEY|updateUserById/)
})

test('password UI confirms replacement, validates matching values, and never displays the existing password', () => {
  assert.match(users, /Change dealer user password\?/)
  assert.match(users, /canSetPassword &&/)
  assert.match(passwordModal, /type="password"/)
  assert.match(passwordModal, /password !== confirmation/)
  assert.match(passwordModal, /current password cannot be viewed/)
  assert.doesNotMatch(passwordModal, /defaultValue=.*password|currentPassword/)
})

test('password audit records identity and action but never credentials', () => {
  assert.match(migration, /password_updated/)
  assert.match(endpoint, /target_user_id: target\.id/)
  assert.match(endpoint, /target_email: email/)
  const auditInsert = endpoint.match(/dealer_user_access_audit_log'\)\.insert\(\{[\s\S]*?action: 'password_updated',[\s\S]*?\}\)/)?.[0] ?? ''
  assert.ok(auditInsert)
  assert.doesNotMatch(auditInsert, /password\s*:/)
})

test('admin Marketing Tools uses the shared implementation and a protected selected-dealer context', () => {
  assert.match(marketingEndpoint, /authorizeBillingAccessManager\(authorization\)/)
  assert.match(marketingEndpoint, /eq\('id', dealerId\)/)
  assert.match(dealerDetail, /<AdminDealerMarketingTools dealerId=\{dealer\.id\}/)
  assert.match(marketingTools, /embedded = false/)
  assert.match(dealerLayout, /<MarketingToolsPage dealer=\{dealer\}/)
  assert.match(marketingTools, /<MarketingBannerLibrary/)
  assert.match(marketingTools, /adminHref=\{bannerAdminHref\}/)
})

test('access-manager capability is explicit and does not recolor the Portal shell', () => {
  assert.match(adminLayout, /canManageDealerCredentials=\{isBillingAccessManager\}/)
  assert.match(dealerDetail, /canManageDealerCredentials && <AdminDealerMarketingTools/)
  assert.doesNotMatch(dealerDetail, /--dealer-primary|portal-shell--dealer/)
})
