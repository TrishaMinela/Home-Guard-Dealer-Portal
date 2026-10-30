import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const app = readFileSync('src/App.tsx', 'utf8')
const access = readFileSync('src/hooks/useAccountAccess.ts', 'utf8')
const destination = readFileSync('src/utils/authorizedDestination.ts', 'utf8')
const forgot = readFileSync('src/components/ForgotPasswordPage.tsx', 'utf8')
const reset = readFileSync('src/components/ResetPasswordPage.tsx', 'utf8')

test('Supabase authentication is resolved before Portal authorization', () => {
  assert.match(app, /signInWithPassword\(\{[\s\S]*email,[\s\S]*password/)
  assert.match(app, /if \(signInError\)[\s\S]*authenticationErrorMessage\(signInError\)/)
  assert.match(app, /if \(!access \|\| access\.type === 'none'\)/)
})

test('authorization checks admin, billing client, then dealer in priority order', () => {
  const adminIndex = destination.indexOf("from('home_guard_admins')")
  const billingIndex = destination.indexOf("rpc('list_billing_client_accounts')")
  const dealerIndex = destination.indexOf("from('dealer_users')")
  assert.ok(adminIndex >= 0 && adminIndex < billingIndex && billingIndex < dealerIndex)
  assert.match(destination, /if \(adminError\) throw/)
  assert.match(destination, /if \(billingError\) throw/)
  assert.match(destination, /if \(dealerError\) throw/)
})

test('normal app access also checks admin before billing and dealer memberships', () => {
  const adminIndex = access.indexOf("from('home_guard_admins')")
  const billingIndex = access.indexOf("rpc('list_billing_client_accounts')")
  const dealerIndex = access.indexOf("from('dealer_users')")
  assert.ok(adminIndex >= 0 && adminIndex < billingIndex && billingIndex < dealerIndex)
  assert.match(access, /does not currently have authorized Portal access/)
  assert.doesNotMatch(access, /not associated with a dealer/)
})

test('forgot-password requests never perform a Portal membership lookup', () => {
  assert.match(forgot, /resetPasswordForEmail/)
  assert.doesNotMatch(forgot, /home_guard_admins|billing_account|dealer_users|authorizedDestination/)
  assert.match(forgot, /If an account exists for that email/)
})

test('post-reset routing uses real membership and handles no-access separately', () => {
  assert.match(reset, /authorizedDestination\(session\.user\.id\)/)
  assert.match(reset, /setStep\('no_access'\)/)
  assert.match(reset, /setStep\('access_error'\)/)
  assert.match(reset, /does not currently have authorized Portal access/)
  assert.doesNotMatch(reset, /search\.get\('role'\)|search\.get\('destination'\)/)
})
