import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  decryptCrmCredentials,
  deliveryEligibility,
  encryptCrmCredentials,
  leadDeliveryIdempotencyKey,
  standardLeadFields,
  type DealerCrmIntegration,
  type TrustedLeadRecord,
} from '../api/_lib/dealerCrmIntegration.ts'

const migration = readFileSync('supabase/migrations/20261106000000_create_dealer_crm_integration_foundation.sql', 'utf8')

const integration: DealerCrmIntegration = {
  id: 'integration-a', dealerId: 'dealer-a', provider: 'opta', state: 'disabled', fieldMapping: {}, hasCredentials: false,
}
const lead: TrustedLeadRecord = {
  id: 'lead-a', dealerId: 'dealer-a', firstName: 'Alex', lastName: 'Homeowner', email: 'alex@example.com',
  phone: '555-0100', address: '1 Main St', city: 'Fort Wayne', state: 'IN', zip: '46802', source: 'door_builder',
  doorConfiguration: { style: 'Craftsman', doorFinishColor: 'Black', mainDoorGlass: 'Clear', sidelitePlacement: 'both', hardware: 'Modern' },
}

test('foundation supports approved providers and remains disabled by default', () => {
  assert.match(migration, /provider in \('opta', 'gohighlevel', 'custom_webhook'\)/)
  assert.match(migration, /state text not null default 'disabled'/)
  assert.doesNotMatch(migration, /http_request|net\.http|pg_cron|create trigger/i)
  assert.deepEqual(deliveryEligibility(integration, lead), { eligible: false, reason: 'integration_disabled' })
})

test('composite foreign keys prevent cross-dealer lead delivery', () => {
  assert.match(migration, /foreign key \(integration_id, dealer_id, provider\)/)
  assert.match(migration, /foreign key \(lead_id, dealer_id\)/)
  assert.throws(() => deliveryEligibility({ ...integration, state: 'live', hasCredentials: true }, { ...lead, dealerId: 'dealer-b' }), /does not match/)
})

test('delivery idempotency is deterministic and database enforced', () => {
  assert.equal(leadDeliveryIdempotencyKey('integration-a', 'lead-a'), leadDeliveryIdempotencyKey('integration-a', 'lead-a'))
  assert.notEqual(leadDeliveryIdempotencyKey('integration-a', 'lead-a'), leadDeliveryIdempotencyKey('integration-a', 'lead-b'))
  assert.match(migration, /unique \(integration_id, lead_id\)/)
  assert.match(migration, /unique \(idempotency_key\)/)
})

test('credentials use authenticated encryption and never receive browser grants', () => {
  const key = randomBytes(32).toString('base64')
  const envelope = encryptCrmCredentials({ apiKey: 'test-only', locationId: 'location-a' }, key)
  assert.deepEqual(decryptCrmCredentials(envelope, key), { apiKey: 'test-only', locationId: 'location-a' })
  assert.throws(() => decryptCrmCredentials(envelope, randomBytes(32).toString('base64')))
  assert.doesNotMatch(migration, /grant select \([^)]*credentials_/s)
  assert.match(migration, /grant all[\s\S]*to service_role/)
})

test('standard mapping preserves optional configuration without assuming provider fields', () => {
  const fields = standardLeadFields(lead)
  assert.equal(fields.customer.email, 'alex@example.com')
  assert.equal(fields.dealer.id, 'dealer-a')
  assert.equal(fields.door.style, 'Craftsman')
  assert.equal(fields.door.finish, 'Black')
  assert.deepEqual(fields.door.configuration_summary, lead.doorConfiguration)
})

test('Phase 1 helper contains no outbound provider request path', () => {
  const source = readFileSync('api/_lib/dealerCrmIntegration.ts', 'utf8')
  assert.doesNotMatch(source, /\bfetch\s*\(/)
  assert.doesNotMatch(source, /opta\.com|gohighlevel\.com|hooks?\./i)
})
