import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const app = readFileSync('src/App.tsx', 'utf8')
const page = readFileSync('src/components/InviteSetupPage.tsx', 'utf8')
const endpoint = readFileSync('api/billing-access-management.ts', 'utf8')
const destination = readFileSync('src/utils/authorizedDestination.ts', 'utf8')

test('invite setup is a public auth-completion route', () => {
  assert.match(app, /window\.location\.pathname === '\/auth\/invite'/)
  assert.match(app, /if \(isInviteRoute\) return <InviteSetupPage/)
})

test('new-user invitations explicitly target the branded production route', () => {
  assert.match(endpoint, /PORTAL_INVITE_REDIRECT_URL/)
  assert.match(endpoint, /new URL\('\/auth\/invite', portalUrl\)/)
  assert.match(endpoint, /inviteUserByEmail\(email, \{ redirectTo: inviteRedirectUrl\(\) \}\)/)
})

test('invite flow uses Supabase session and password APIs without custom tokens', () => {
  assert.match(page, /supabase\.auth\.getSession\(\)/)
  assert.match(page, /supabase\.auth\.onAuthStateChange/)
  assert.match(page, /supabase\.auth\.updateUser\(\{ password \}\)/)
  assert.doesNotMatch(page, /service.role|SUPABASE_SERVICE_ROLE|localStorage\.setItem/i)
})

test('authorized destination comes from database membership rather than URL role parameters', () => {
  assert.match(page, /authorizedDestination\(session\.user\.id\)/)
  assert.match(destination, /from\('home_guard_admins'\)/)
  assert.match(destination, /rpc\('list_billing_client_accounts'\)/)
  assert.match(destination, /from\('dealer_users'\)/)
  assert.doesNotMatch(page, /searchParams.*role|[?&]role=/)
})

test('invite UI includes welcome, password, success, existing-user, and invalid states', () => {
  for (const copy of [
    "You've been invited",
    'Create your password',
    'Your account is ready',
    'already configured',
    'This invitation is no longer valid',
  ]) assert.match(page, new RegExp(copy, 'i'))
})
