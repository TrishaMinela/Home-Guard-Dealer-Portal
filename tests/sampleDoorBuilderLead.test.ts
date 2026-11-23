import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSampleZapierLead, DEFAULT_SAMPLE_CONTACT, sampleContactFromInput } from '../api/_lib/sampleDoorBuilderLead.ts'

const contact = sampleContactFromInput(DEFAULT_SAMPLE_CONTACT)

test('a sample lead answers that the customer is working with this dealer', () => {
  const payload = buildSampleZapierLead({
    contact,
    dealer: { slug: 'diligent-exterior-remodeling', companyName: ' Diligent  Exterior ', leadSource: 'DER' },
    submittedAt: '2026-11-23T00:00:00.000Z',
    testSubmissionId: 'test-1',
  })
  assert.equal(payload.working_with_dealer, 'yes')
  assert.equal(payload.working_dealer_name, 'Diligent Exterior')
  assert.equal(payload.notes, 'TEST LEAD — NOT A REAL CUSTOMER\nWorking with a dealer: Yes — Dealer: Diligent Exterior')
  assert.equal(payload.dealer_name, ' Diligent  Exterior ')
  assert.equal(payload.dealer_slug, 'diligent-exterior-remodeling')
})

test('an extra sample note stays on the test line and the dealer answer stays on its own line', () => {
  const payload = buildSampleZapierLead({
    contact: { ...contact, note: 'Call after 5.' },
    dealer: { slug: 'northstar', companyName: 'Northstar', leadSource: 'NS' },
    submittedAt: '2026-11-23T00:00:00.000Z',
    testSubmissionId: 'test-2',
  })
  assert.equal(payload.working_with_dealer, 'yes')
  assert.equal(payload.working_dealer_name, 'Northstar')
  assert.equal(payload.notes, 'TEST LEAD — NOT A REAL CUSTOMER Call after 5.\nWorking with a dealer: Yes — Dealer: Northstar')
})
