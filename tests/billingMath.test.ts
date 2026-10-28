import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateClientCharge, invoiceIdempotencyKey } from '../api/_lib/billingMath.ts'

test('applies the configured markup with integer currency math', () => {
  const result = calculateClientCharge({ providerCostMicros: 30_000_000n, markupBasisPoints: 1500, pricingVersionId: 'price-v1' })
  assert.equal(result.clientChargeCents, 3450)
  assert.equal(result.providerCostMicros, 30_000_000n)
})

test('rounds the final customer charge to cents exactly once', () => {
  const result = calculateClientCharge({ providerCostMicros: 16_414_740n, markupBasisPoints: 1500, pricingVersionId: 'price-v1' })
  assert.equal(result.clientChargeCents, 1888)
})

test('rejects invalid pricing inputs', () => {
  assert.throws(() => calculateClientCharge({ providerCostMicros: -1n, markupBasisPoints: 1500, pricingVersionId: 'price-v1' }))
  assert.throws(() => calculateClientCharge({ providerCostMicros: 1n, markupBasisPoints: 10_001, pricingVersionId: 'price-v1' }))
  assert.throws(() => calculateClientCharge({ providerCostMicros: 1n, markupBasisPoints: 1500, pricingVersionId: '' }))
})

test('creates a deterministic invoice idempotency key', () => {
  assert.equal(invoiceIdempotencyKey('hgi', '2026-10-01', '2026-11-01'), 'ai-usage:hgi:2026-10-01:2026-11-01')
  assert.throws(() => invoiceIdempotencyKey('hgi', '10/01/2026', '2026-11-01'))
})
