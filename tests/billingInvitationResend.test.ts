import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { classifyInvitationFailure } from '../api/_lib/invitationDelivery.ts'

const endpoint = readFileSync('api/billing-access-management.ts', 'utf8')
const page = readFileSync('src/pages/BillingAccessManagementPage.tsx', 'utf8')

test('pending existing users receive a fresh admin invitation without a duplicate Auth identity', () => {
  assert.match(endpoint, /target\.email_confirmed_at/)
  assert.match(endpoint, /sendFreshInvitation\(admin, email, target\.id\)/)
  assert.match(endpoint, /result\.data\.user\.id !== expectedUserId/)
  assert.match(endpoint, /pending_reinvited/)
})

test('removing billing access preserves the Supabase Auth identity', () => {
  assert.match(endpoint, /from\('billing_account_users'\)\.delete\(\)/)
  assert.doesNotMatch(endpoint, /deleteUser\(/)
})

test('confirmed existing users restore membership without another invitation', () => {
  assert.match(endpoint, /confirmed_access_restored/)
  assert.match(endpoint, /sign in with their existing Portal account/)
})

test('explicit resend uses the admin invite endpoint rather than signup resend', () => {
  assert.match(endpoint, /action === 'resend_client'[\s\S]*sendFreshInvitation\(admin, email, target\.id\)/)
  assert.doesNotMatch(endpoint, /auth\.resend/)
  assert.match(endpoint, /invite_resent/)
})

test('email delivery failures are sanitized into useful categories', () => {
  assert.deepEqual(classifyInvitationFailure({ status: 429, code: 'over_email_send_rate_limit' }), {
    code: 'invitation_rate_limited', status: 429,
    message: 'Invitation email delivery is temporarily rate limited. Please try again shortly.',
  })
  assert.equal(classifyInvitationFailure({ status: 500, message: 'SMTP rejected recipient' }).code, 'invitation_provider_failure')
  assert.equal(classifyInvitationFailure({ status: 400, message: 'Unexpected Auth error' }).code, 'invitation_auth_failure')
})

test('Portal displays server-confirmed outcomes rather than claiming every email was sent', () => {
  assert.match(page, /result\.notice/)
  assert.match(page, /result\.warning/)
  assert.match(page, /invitation_rate_limited/)
})
