import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { decryptCrmCredentials, encryptCrmCredentials } from '../api/_lib/dealerCrmIntegration.ts'
import {
  AMERICAS_BEST_DEALER_SLUG,
  OPTA_LIVE_VALUE,
  OPTA_SUBMIT_URL,
  OPTA_TEST_VALUE,
  buildOptaTestLeadRequest,
  classifyOptaTransportFailure,
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

test('DNS and connection-refused errors are classified as pre-send connect failures', async () => {
  const refused = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:443'), { code: 'ECONNREFUSED' })
  const dns = Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('getaddrinfo ENOTFOUND abw.opta.io'), { code: 'ENOTFOUND' }) })
  const timeout = Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError', code: 'ABORT_ERR' })
  assert.equal(classifyOptaTransportFailure(refused), 'connect_failure')
  assert.equal(classifyOptaTransportFailure(dns), 'connect_failure')
  assert.equal(classifyOptaTransportFailure(timeout), 'network_failure')
  const transport: OptaTransport = async () => { throw refused }
  const result = await deliverOptaTestLead(syntheticAmericasBestOptaLead(), credentials, transport)
  assert.deepEqual(result, { ok: false, disposition: 'connect_failure' })
})

test('only the verified Americas Best slug can be prepared, and live mode sends test false', async () => {
  const calls: string[] = []
  const transport: OptaTransport = async (_url, init) => {
    calls.push(init.body)
    return jsonResponse(200, { leadStatus: true, testLead: false, reason: '', message: 'Success Lead = Accepted' })
  }
  const otherDealer = await deliverOptaTestLead(
    { ...syntheticAmericasBestOptaLead(), dealerSlug: 'wdm' },
    credentials,
    transport,
  )
  const live = await deliverOptaTestLead(syntheticAmericasBestOptaLead(), credentials, transport, 'live')
  assert.equal(calls.length, 1)
  assert.equal(JSON.parse(calls[0]).test, 'false')
  assert.equal(otherDealer.ok, false)
  assert.equal(live.ok, true)
  if (!live.ok) return
  assert.equal(live.disposition, 'live_accepted')
  assert.equal(live.testLead, false)
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

test('Opta delivery stays server-only and live is an explicit mode', () => {
  const source = readFileSync('api/_lib/optaLeadDelivery.ts', 'utf8')
  const settings = readFileSync('api/dealer-crm-integrations.ts', 'utf8')
  const component = readFileSync('src/components/DealerCrmIntegrations.tsx', 'utf8')
  assert.match(source, /OPTA_TEST_VALUE = 'true'/)
  assert.equal(OPTA_LIVE_VALUE, 'false')
  assert.equal(OPTA_TEST_VALUE, 'true')
  assert.doesNotMatch(settings, /optaLeadDelivery|abw\.opta\.io/)
  assert.doesNotMatch(component, /optaLeadDelivery|abw\.opta\.io|credentials_ciphertext|CRM_CREDENTIAL_ENCRYPTION_KEY/)
  const prepared = buildOptaTestLeadRequest(syntheticAmericasBestOptaLead(), credentials)
  assert.equal('ready' in prepared, true)
  if (!('ready' in prepared)) return
  assert.equal(prepared.request.body.test, 'true')
  assert.equal('dealerSlug' in prepared.request.body, false)
  const live = buildOptaTestLeadRequest(syntheticAmericasBestOptaLead(), credentials, 'live')
  assert.equal('ready' in live, true)
  if (!('ready' in live)) return
  assert.equal(live.request.body.test, 'false')
})
