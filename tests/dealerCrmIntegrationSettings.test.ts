import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  encryptCrmCredentials,
  isCrmCredentialEncryptionConfigured,
  validateCrmCredentials,
} from '../api/_lib/dealerCrmIntegration.ts'

const endpoint = readFileSync('api/dealer-crm-integrations.ts', 'utf8')
const component = readFileSync('src/components/DealerCrmIntegrations.tsx', 'utf8')
const dealerPage = readFileSync('src/pages/DealerDetailPage.tsx', 'utf8')

test('only the existing super-admin capability can access CRM integration management', () => {
  assert.match(endpoint, /authorizeBillingAccessManager\(authorization\)/)
  assert.match(dealerPage, /canManageDealerCredentials && <DealerCrmIntegrations/)
  assert.match(endpoint, /if \(!access\.authorized\) return send\(response, access\.status/)
  assert.doesNotMatch(endpoint, /authorizeHgiAdmin|authorizeBillingAccessOperator/)
})

test('credential configuration requires a valid server-only 32-byte key', () => {
  assert.equal(isCrmCredentialEncryptionConfigured(undefined), false)
  assert.equal(isCrmCredentialEncryptionConfigured(Buffer.alloc(16).toString('base64')), false)
  const key = randomBytes(32).toString('base64')
  assert.equal(isCrmCredentialEncryptionConfigured(key), true)
  const envelope = encryptCrmCredentials({ companyId: 'company', authenticationKey: 'private' }, key)
  assert.notEqual(envelope.ciphertext, Buffer.from(JSON.stringify({ companyId: 'company', authenticationKey: 'private' })).toString('base64'))
})

test('provider-specific credentials are complete and custom webhooks require HTTPS', () => {
  assert.deepEqual(validateCrmCredentials('opta', {
    companyId: 'company', sourceId: 'source', campaignId: 'campaign', authenticationKey: 'secret',
  }), { companyId: 'company', sourceId: 'source', campaignId: 'campaign', authenticationKey: 'secret' })
  assert.throws(() => validateCrmCredentials('opta', { companyId: 'company' }), /Source ID is required/)
  assert.throws(() => validateCrmCredentials('custom_webhook', { endpointUrl: 'http://example.com', authorizationHeader: 'secret' }), /HTTPS/)
  assert.doesNotThrow(() => validateCrmCredentials('gohighlevel', { locationId: 'location', privateIntegrationToken: 'secret' }))
})

test('Phase 2 settings cannot activate delivery or expose credentials', () => {
  assert.match(endpoint, /body\.state !== 'disabled'/)
  assert.match(endpoint, /allowedStates: \['disabled'\]/)
  assert.doesNotMatch(endpoint, /decryptCrmCredentials|\bfetch\s*\([^)]*(opta|gohighlevel|webhook)/i)
  assert.match(endpoint, /hasCredentials: Boolean\(row\.credentials_ciphertext\)/)
  assert.doesNotMatch(endpoint, /credentialsCiphertext:|authenticationKey: row|credentials:\s*row/)
  assert.match(component, /Test — available in a future phase/)
  assert.match(component, /Live — unavailable/)
  assert.match(component, /No delivery will occur/)
})

test('dealer and field mapping inputs are server validated', () => {
  assert.match(endpoint, /uuidPattern\.test\(dealerId\)/)
  assert.match(endpoint, /from\('dealers'\).*select\('id,company_name'\)/s)
  assert.match(endpoint, /assertValidFieldMapping\(mapping\)/)
  assert.match(endpoint, /\.eq\('dealer_id', dealerId\)/)
  assert.match(endpoint, /expectedProjectRef = 'udbcnpjtwhmjzpjjhoph'/)
})

test('browser UI never imports the Node encryption helper or requests secret columns', () => {
  assert.doesNotMatch(component, /dealerCrmIntegration|CRM_CREDENTIAL_ENCRYPTION_KEY|credentials_ciphertext|credentials_auth_tag/)
  assert.doesNotMatch(component, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(component, /Leave every field blank to keep them/)
})
