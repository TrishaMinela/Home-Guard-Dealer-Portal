import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { decryptCrmCredentials, encryptCrmCredentials } from '../api/_lib/dealerCrmIntegration.ts'
import {
  AMERICAS_BEST_DEALER_SLUG,
  OPTA_SUBMIT_URL,
  OPTA_TEST_VALUE,
  buildOptaTestLeadRequest,
  deliverOptaTestLead,
  syntheticAmericasBestOptaLead,
  type OptaDeliveryLead,
  type OptaTransport,
} from '../api/_lib/optaLeadDelivery.ts'

const credentials = {
  companyId: 'company-test',
  sourceId: 'source-test',
  campaignId: 'campaign-test',
  authenticationKey: 'auth-test',
}

function jsonResponse(status: number, body: unknown): { status: number; text: () => Promise<string> } {
  return { status, text: async () => JSON.stringify(body) }
}

test('accepted test response requires leadStatus and testLead, and the request stays a test', async () => {
  const key = randomBytes(32).toString('base64')
  const envelope = encryptCrmCredentials(credentials, key)
  const stored = decryptCrmCredentials(envelope, key)
  const lead = { ...syntheticAmericasBestOptaLead(), phone: '(555) 010-0199', zip: '43215-0000', state: 'oh' }
  const calls: Array<{ url: string; body: string }> = []
  const transport: OptaTransport = async (url, init) => {
    calls.push({ url, body: init.body })
    assert.equal(init.method, 'POST')
    assert.equal(init.redirect, 'error')
    assert.equal(init.headers['Content-Type'], 'application/json')
    assert.equal(init.headers.Accept, 'application/json')
    return jsonResponse(200, {
      leadStatus: true,
      reason: 'Test lead accepted. Update test=false once approved.',
      message: '',
      price: '0.00',
      testLead: true,
    })
  }

  const result = await deliverOptaTestLead(lead, stored, transport)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.disposition, 'test_accepted')
  assert.equal(result.leadStatus, true)
  assert.equal(result.testLead, true)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, OPTA_SUBMIT_URL)
  assert.equal(new URL(calls[0].url).search, '')
  const body = JSON.parse(calls[0].body) as Record<string, string>
  assert.equal(body.test, OPTA_TEST_VALUE)
  assert.equal(body.compid, 'company-test')
  assert.equal(body.pubid, 'source-test')
  assert.equal(body.campid, 'campaign-test')
  assert.equal(body.auth, 'auth-test')
  assert.equal(body.phone, '5550100199')
  assert.equal(body.zip, '43215')
  assert.equal(body.first, 'Hgi')
  assert.equal(body.email, 'hgi-synthetic-test@example.com')
  assert.equal(body.price, '0.0')
  assert.equal(Object.hasOwn(body, 'address'), false)
  assert.equal(Object.hasOwn(body, 'city'), false)
  assert.equal(Object.hasOwn(body, 'state'), false)
  assert.equal(Object.hasOwn(body, 'tf'), false)
  assert.doesNotMatch(calls[0].url, /company-test|auth-test/)
})

test('HTTP 200 with leadStatus false is rejected and is not a successful delivery', async () => {
  const transport: OptaTransport = async () => jsonResponse(200, {
    leadStatus: false,
    reason: 'Outside service area',
    message: 'Failed Lead = Not Accepted',
    price: 0,
  })
  const result = await deliverOptaTestLead(syntheticAmericasBestOptaLead(), credentials, transport)
  assert.deepEqual(result, {
    ok: false,
    disposition: 'rejected',
    httpStatus: 200,
    leadStatus: false,
    reason: 'Outside service area',
    message: 'Failed Lead = Not Accepted',
  })
})

test('unauthorized responses are not treated as accepted', async () => {
  const transport: OptaTransport = async () => jsonResponse(401, { message: 'unauthorized' })
  const result = await deliverOptaTestLead(syntheticAmericasBestOptaLead(), credentials, transport)
  assert.deepEqual(result, { ok: false, disposition: 'unauthorized', httpStatus: 401 })
})

test('missing collected phone or ZIP does not send a request', async () => {
  let called = false
  const transport: OptaTransport = async () => {
    called = true
    return jsonResponse(200, { leadStatus: true, testLead: true })
  }
  const lead: OptaDeliveryLead = { ...syntheticAmericasBestOptaLead(), phone: '   ', zip: null }
  const result = await deliverOptaTestLead(lead, credentials, transport)
  assert.equal(called, false)
  assert.equal(result.ok, false)
  if (result.ok || result.disposition !== 'missing_field') return
  assert.deepEqual(result.missing, ['phone', 'zip'])
})

test('network failure is reported and is not a successful delivery', async () => {
  const transport: OptaTransport = async () => {
    throw new TypeError('socket hang up')
  }
  const result = await deliverOptaTestLead(syntheticAmericasBestOptaLead(), credentials, transport)
  assert.deepEqual(result, { ok: false, disposition: 'network_failure' })
})

test('only the verified Americas Best slug can be prepared, and live mode never sends', async () => {
  let called = false
  const transport: OptaTransport = async () => {
    called = true
    return jsonResponse(200, { leadStatus: true, testLead: true })
  }
  const otherDealer = await deliverOptaTestLead(
    { ...syntheticAmericasBestOptaLead(), dealerSlug: 'wdm' },
    credentials,
    transport,
  )
  const live = await deliverOptaTestLead(syntheticAmericasBestOptaLead(), credentials, transport, 'live')
  assert.equal(called, false)
  assert.deepEqual(otherDealer, { ok: false, disposition: 'ineligible', reason: 'dealer_not_eligible' })
  assert.deepEqual(live, { ok: false, disposition: 'ineligible', reason: 'live_delivery_disabled' })
  assert.equal(AMERICAS_BEST_DEALER_SLUG, 'americas-best-windows-and-doors')
})

test('a 200 leadStatus true response without testLead is not accepted', async () => {
  const transport: OptaTransport = async () => jsonResponse(200, {
    leadStatus: true,
    reason: '',
    message: 'Success Lead = Accepted',
    price: '0.00',
  })
  const result = await deliverOptaTestLead(syntheticAmericasBestOptaLead(), credentials, transport)
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.disposition, 'unexpected_response')
})

test('Opta delivery stays server-only and cannot request a live lead', () => {
  const source = readFileSync('api/_lib/optaLeadDelivery.ts', 'utf8')
  const settings = readFileSync('api/dealer-crm-integrations.ts', 'utf8')
  const component = readFileSync('src/components/DealerCrmIntegrations.tsx', 'utf8')
  assert.match(source, /OPTA_TEST_VALUE = 'true'/)
  assert.doesNotMatch(source, /test\s*[:=]\s*['"]false['"]/)
  assert.doesNotMatch(source, /test=false/)
  assert.doesNotMatch(settings, /optaLeadDelivery|abw\.opta\.io/)
  assert.doesNotMatch(component, /optaLeadDelivery|abw\.opta\.io/)
  const prepared = buildOptaTestLeadRequest(syntheticAmericasBestOptaLead(), credentials)
  assert.equal('ready' in prepared, true)
  if (!('ready' in prepared)) return
  assert.equal(prepared.request.body.test, 'true')
  assert.equal('dealerSlug' in prepared.request.body, false)
})
