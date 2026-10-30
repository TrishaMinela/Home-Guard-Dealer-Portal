import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const app = readFileSync('src/App.tsx', 'utf8')
const login = readFileSync('src/components/LoginPage.tsx', 'utf8')
const forgot = readFileSync('src/components/ForgotPasswordPage.tsx', 'utf8')
const reset = readFileSync('src/components/ResetPasswordPage.tsx', 'utf8')
const destination = readFileSync('src/utils/authorizedDestination.ts', 'utf8')

test('login and public auth routes expose the branded reset flow', () => {
  assert.match(login, /href="\/auth\/forgot-password"[^>]*>Forgot password\?/)
  assert.match(app, /window\.location\.pathname === '\/auth\/forgot-password'/)
  assert.match(app, /window\.location\.pathname === '\/auth\/reset-password'/)
  assert.match(app, /<ForgotPasswordPage \/>/)
  assert.match(app, /<ResetPasswordPage \/>/)
})

test('reset requests use the production callback and neutral response', () => {
  assert.match(forgot, /https:\/\/home-guard-dealer-portal\.vercel\.app\/auth\/reset-password/)
  assert.match(forgot, /resetPasswordForEmail\(email\.trim\(\), \{ redirectTo: passwordResetRedirectUrl\(\) \}\)/)
  assert.match(forgot, /If an account exists for that email, a password reset link has been sent\./)
  assert.doesNotMatch(forgot, /error\.message|console\.(error|log)/)
})

test('reset form requires a genuine recovery signal and safely updates the password', () => {
  assert.match(reset, /event === 'PASSWORD_RECOVERY'/)
  assert.match(reset, /!hasRecoverySignal\.current && !recoveryEventReceived\.current/)
  assert.match(reset, /supabase\.auth\.updateUser\(\{ password \}\)/)
  assert.match(reset, /password\.length < 10/)
  assert.match(reset, /password !== confirmation/)
  assert.doesNotMatch(reset, /error\.message|access_token[^'")]*display|refresh_token[^'")]*display/)
})

test('post-reset routing is derived from database memberships', () => {
  assert.match(reset, /authorizedDestination\(session\.user\.id\)/)
  assert.match(destination, /from\('home_guard_admins'\)/)
  assert.match(destination, /rpc\('list_billing_client_accounts'\)/)
  assert.match(destination, /from\('dealer_users'\)/)
  assert.doesNotMatch(reset, /search\.get\('destination'\)|hash\.get\('destination'\)|[?&]destination=/)
  assert.match(reset, /setStep\('no_access'\)/)
  assert.match(reset, /setStep\('access_error'\)/)
})

test('invalid and expired links use a safe branded recovery state', () => {
  assert.match(reset, /This password reset link is no longer valid\./)
  assert.match(reset, /It may have expired or already been used\./)
  assert.match(reset, /href="\/auth\/forgot-password"/)
})
