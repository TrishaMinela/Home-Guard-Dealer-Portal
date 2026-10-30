import assert from 'node:assert/strict'
import test from 'node:test'
import { isReservedDealerSlug, normalizeDealerSlug } from '../src/utils/dealerSlug.ts'

test('normalizes safe dealer slugs', () => {
  assert.equal(normalizeDealerSlug('  Trisha Windows  '), 'trisha-windows')
  assert.equal(isReservedDealerSlug('trisha-windows'), false)
})

test('protects Door Builder application and system routes', () => {
  for (const slug of ['api', 'assets', 'admin', 'auth', 'billing', 'dashboard', 'login', 'robots', 'sitemap', 'visualizer']) {
    assert.equal(isReservedDealerSlug(slug), true, slug)
    assert.equal(isReservedDealerSlug(slug.toUpperCase()), true, slug)
  }
})
