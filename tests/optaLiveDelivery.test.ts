import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { Readable } from 'node:stream'
import test from 'node:test'
import type { IncomingMessage } from 'node:http'
import {
  OPTA_DEALER_ALLOWLIST,
  OPTA_LIVE_CONFIRMATION_PHRASE,
  integrationAuditPlan,
  marksDeliveryEnablement,
  validateIntegrationStateChange,
} from '../api/_lib/crmIntegrationState.ts'
import { encryptCrmCredentials, leadDeliveryIdempotencyKey } from '../api/_lib/dealerCrmIntegration.ts'
import { createOptaFetchTransport, handleCrmDeliveryTrigger, handleOptaDeliveryCron } from '../api/_lib/optaDeliveryHttp.ts'
import { OPTA_RETRY_DELAYS_MS } from '../api/_lib/optaDeliveryPolicy.ts'
import {
  createSupabaseOptaDeliveryStore,
  type CrmAdminClient,
  type DeliveryInsert,
  type DeliveryResultPatch,
  type OptaIntegrationRecord,
  type OptaPortalLead,
  type StoredDelivery,
} from '../api/_lib/optaDeliveryStore.ts'
import { deliverSubmittedLead, sweepOptaDeliveries, type OptaWorkerDeps } from '../api/_lib/optaDeliveryWorker.ts'
import { OPTA_NOTES_MAX_LENGTH, optaDoorConfigurationNotes } from '../api/_lib/optaDoorNotes.ts'
import {
  AMERICAS_BEST_DEALER_SLUG,
  OPTA_SUBMIT_URL,
  buildOptaLeadRequest,
  syntheticAmericasBestOptaLead,
  type OptaTransport,
} from '../api/_lib/optaLeadDelivery.ts'

const SECRET = 'super-secret-auth-key-99'
const COMPANY = 'company-test-value'
const SOURCE = 'source-test-value'
const CAMPAIGN = 'campaign-test-value'
const DEALER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OTHER_DEALER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const INTEGRATION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const LEAD_ID = '11111111-1111-4111-8111-111111111111'
const SUBMISSION_ID = '22222222-2222-4222-8222-222222222222'
const LIVE_AT = '2026-11-24T14:00:00.000Z'
const CREATED_AT = '2026-11-24T15:00:00.000Z'

const credentials = {
  companyId: COMPANY,
  sourceId: SOURCE,
  campaignId: CAMPAIGN,
  authenticationKey: SECRET,
}

type MemoryDelivery = StoredDelivery & {
  idempotencyKey: string
  errorCode: string | null
  errorMessage: string | null
  responseMetadata: Record<string, unknown>
  httpStatus: number | null
}

class MemoryStore {
  leads: OptaPortalLead[] = []
  dealers: Array<{ id: string; slug: string }> = []
  integration: OptaIntegrationRecord | null = null
  enabledAt = new Map<string, string | null>()
  deliveries: MemoryDelivery[] = []
  enforceDealerMatch = true
  private claimed = new Set<string>()

  async findLead(input: { submissionId?: string; leadId?: string }) {
    if (input.submissionId) return this.leads.find((lead) => lead.submissionId === input.submissionId) ?? null
    if (input.leadId) return this.leads.find((lead) => lead.id === input.leadId) ?? null
    return null
  }

  async findDealer(dealerId: string) {
    return this.dealers.find((dealer) => dealer.id === dealerId) ?? null
  }

  async findDealerBySlug(slug: string) {
    return this.dealers.find((dealer) => dealer.slug === slug) ?? null
  }

  async findOptaIntegration(dealerId: string) {
    if (!this.integration) return null
    if (this.integration.dealerId !== dealerId && this.enforceDealerMatch) return null
    return this.integration
  }

  async latestStateEnabledAt(integrationId: string, state: 'test' | 'live') {
    return this.enabledAt.get(`${integrationId}:${state}`) ?? null
  }

  async insertDelivery(input: DeliveryInsert) {
    const pair = `${input.integrationId}:${input.leadId}`
    if (this.claimed.has(pair) || this.claimed.has(input.idempotencyKey)) return { inserted: false as const, reason: 'duplicate' as const }
    this.claimed.add(pair)
    this.claimed.add(input.idempotencyKey)
    const row: MemoryDelivery = {
      id: `delivery-${this.deliveries.length + 1}`,
      integrationId: input.integrationId,
      leadId: input.leadId,
      dealerId: input.dealerId,
      status: input.status,
      attemptCount: input.attemptCount,
      lastAttemptedAt: input.now,
      updatedAt: input.now,
      idempotencyKey: input.idempotencyKey,
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
      responseMetadata: input.responseMetadata ?? {},
      httpStatus: input.httpStatus ?? null,
    }
    this.deliveries.push(row)
    return { inserted: true as const, id: row.id }
  }

  async listRetryCandidates() {
    return this.deliveries
      .filter((row) => row.status === 'pending' || row.status === 'failed' || row.status === 'test_failed' || row.status === 'attempting')
      .map((row) => ({ ...row }))
  }

  async claimRetry(input: { id: string; expectedUpdatedAt: string; attemptCount: number; now: string; fromStatus: string }) {
    const row = this.deliveries.find((candidate) => candidate.id === input.id && candidate.updatedAt === input.expectedUpdatedAt && candidate.status === input.fromStatus)
    if (!row) return false
    row.status = 'attempting'
    row.attemptCount = input.attemptCount
    row.lastAttemptedAt = input.now
    row.updatedAt = input.now
    return true
  }

  async saveResult(input: DeliveryResultPatch) {
    const row = this.deliveries.find((candidate) => candidate.id === input.id)
    if (!row) throw new Error('CRM delivery storage request failed.')
    row.status = input.status
    row.updatedAt = input.now
    row.httpStatus = input.httpStatus
    row.errorCode = input.errorCode
    row.errorMessage = input.errorMessage
    row.responseMetadata = input.responseMetadata
  }

  async listLeadsCreatedAfter(dealerId: string, createdAfter: string, limit: number, integrationId: string) {
    return this.leads.filter((lead) => lead.dealerId === dealerId && lead.createdAt > createdAfter && !this.deliveries.some(row => row.integrationId === integrationId && row.leadId === lead.id))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)).slice(0, limit)
  }

  async listDeliveryLeadIds(integrationId: string, leadIds: string[]) {
    const wanted = new Set(leadIds)
    return this.deliveries.filter((row) => row.integrationId === integrationId && wanted.has(row.leadId)).map((row) => row.leadId)
  }
}

function lead(overrides: Partial<OptaPortalLead> = {}): OptaPortalLead {
  return {
    id: LEAD_ID,
    dealerId: DEALER_ID,
    firstName: 'Ada',
    lastName: 'Homeowner',
    email: 'ada@example.com',
    phone: '(555) 010-0199',
    address: '1 Main Street',
    city: 'Columbus',
    state: 'OH',
    zip: '43215-0000',
    comments: 'Call after five.',
    source: 'door_builder',
    doorConfiguration: syntheticAmericasBestOptaLead().doorConfiguration,
    submissionId: SUBMISSION_ID,
    createdAt: CREATED_AT,
    ...overrides,
  }
}

function harness(input?: {
  state?: 'disabled' | 'test' | 'live'
  slug?: string
  integrationDealerId?: string
  envLive?: string
  leadOverrides?: Partial<OptaPortalLead>
  enabledAt?: string | null
  transport?: OptaTransport
}) {
  const store = new MemoryStore()
  store.dealers.push({ id: DEALER_ID, slug: input?.slug ?? AMERICAS_BEST_DEALER_SLUG })
  store.leads.push(lead(input?.leadOverrides))
  const state = input?.state ?? 'live'
  store.integration = {
    id: INTEGRATION_ID,
    dealerId: input?.integrationDealerId ?? DEALER_ID,
    state,
    fieldMapping: {},
    credentials: { ...credentials },
  }
  if (input?.integrationDealerId && input.integrationDealerId !== DEALER_ID) store.enforceDealerMatch = false
  store.enabledAt.set(`${INTEGRATION_ID}:live`, input?.enabledAt === undefined ? LIVE_AT : input.enabledAt)
  store.enabledAt.set(`${INTEGRATION_ID}:test`, input?.enabledAt === undefined ? LIVE_AT : input.enabledAt)
  const logs: string[] = []
  const calls: Array<{ url: string; body: string }> = []
  const transport: OptaTransport = async (url, init) => {
    calls.push({ url, body: init.body })
    if (input?.transport) return input.transport(url, init)
    return { status: 200, text: async () => JSON.stringify({ leadStatus: true, testLead: JSON.parse(init.body).test === 'true', reason: '', message: 'Success Lead = Accepted' }) }
  }
  const env: Record<string, string | undefined> = {
    OPTA_LIVE_DELIVERY_ENABLED: input && 'envLive' in input ? input.envLive : 'true',
    CRM_DELIVERY_TRIGGER_SECRET: 'trigger-secret-value',
    CRON_SECRET: 'cron-secret-value',
    CRM_CREDENTIAL_ENCRYPTION_KEY: 'encryption-key-not-a-credential',
  }
  const deps: OptaWorkerDeps = { store, transport, env, logger: (line) => logs.push(line) }
  return { store, deps, logs, calls, env }
}

function assertHidden(value: string) {
  assert.equal(value.includes(SECRET), false)
  assert.equal(value.includes(COMPANY), false)
  assert.equal(value.includes(SOURCE), false)
  assert.equal(value.includes(CAMPAIGN), false)
  assert.equal(value.includes('encryption-key-not-a-credential'), false)
}

function responseBody(calls: Array<{ body: string }>) {
  return JSON.parse(calls[0].body) as Record<string, string>
}

test('the Opta allowlist is only America\'s Best and live requires the typed phrase', () => {
  assert.deepEqual(OPTA_DEALER_ALLOWLIST, [AMERICAS_BEST_DEALER_SLUG])
  assert.equal(validateIntegrationStateChange({
    provider: 'opta', dealerSlug: AMERICAS_BEST_DEALER_SLUG, requestedState: 'test',
  }).ok, true)
  const missing = validateIntegrationStateChange({
    provider: 'opta', dealerSlug: AMERICAS_BEST_DEALER_SLUG, requestedState: 'live', liveConfirmation: 'yes',
  })
  assert.equal(missing.ok, false)
  if (missing.ok) return
  assert.equal(missing.status, 409)
  const confirmed = validateIntegrationStateChange({
    provider: 'opta', dealerSlug: AMERICAS_BEST_DEALER_SLUG, requestedState: 'live', liveConfirmation: OPTA_LIVE_CONFIRMATION_PHRASE,
  })
  assert.deepEqual(confirmed, { ok: true, state: 'live' })
  assert.equal(validateIntegrationStateChange({ provider: 'opta', dealerSlug: 'wdm', requestedState: 'test' }).ok, false)
  assert.equal(validateIntegrationStateChange({ provider: 'gohighlevel', dealerSlug: AMERICAS_BEST_DEALER_SLUG, requestedState: 'live', liveConfirmation: OPTA_LIVE_CONFIRMATION_PHRASE }).ok, false)
  assert.deepEqual(validateIntegrationStateChange({ provider: 'custom_webhook', dealerSlug: 'wdm', requestedState: 'disabled' }), { ok: true, state: 'disabled' })
  assert.deepEqual(integrationAuditPlan({ isNew: false, previousState: 'disabled', nextState: 'live', credentialsChanged: false }), ['state_changed'])
  assert.deepEqual(integrationAuditPlan({ isNew: false, previousState: 'live', nextState: 'live', credentialsChanged: false }), ['configuration_updated'])
  assert.equal(marksDeliveryEnablement('state_changed'), true)
  assert.equal(marksDeliveryEnablement('credentials_updated'), false)
})

test('test sends true and live sends false with the existing field mapping', async () => {
  const live = harness()
  const sent = await deliverSubmittedLead(live.deps, { submissionId: SUBMISSION_ID })
  assert.equal(sent.body.ok, true)
  assert.equal(sent.body.disposition, 'live_accepted')
  assert.equal(live.calls.length, 1)
  assert.equal(live.calls[0].url, OPTA_SUBMIT_URL)
  assert.equal(new URL(live.calls[0].url).search, '')
  const body = responseBody(live.calls)
  assert.equal(body.test, 'false')
  assert.equal(body.compid, COMPANY)
  assert.equal(body.pubid, SOURCE)
  assert.equal(body.campid, CAMPAIGN)
  assert.equal(body.auth, SECRET)
  assert.equal(body.first, 'Ada')
  assert.equal(body.last, 'Homeowner')
  assert.equal(body.email, 'ada@example.com')
  assert.equal(body.phone, '5550100199')
  assert.equal(body.zip, '43215')
  assert.equal(body.price, '0.0')
  assert.equal(body.lead_id, LEAD_ID)
  assert.equal(body.subid1, 'door_builder')
  assert.match(body.notes, /Door line: Smooth-Star/)
  assert.match(body.notes, /Customer note: Call after five\./)
  assert.equal(Object.hasOwn(body, 'address'), false)
  assert.equal(live.store.deliveries[0].status, 'succeeded')
  const withoutTestFlag = harness({
    leadOverrides: { id: '55555555-5555-4555-8555-555555555555', submissionId: '66666666-6666-4666-8666-666666666666' },
    transport: async () => ({ status: 200, text: async () => JSON.stringify({ leadStatus: true, message: 'Success Lead = Accepted' }) }),
  })
  const acceptedLive = await deliverSubmittedLead(withoutTestFlag.deps, { submissionId: '66666666-6666-4666-8666-666666666666' })
  assert.equal(acceptedLive.body.disposition, 'dead_letter')
  assert.equal(responseBody(withoutTestFlag.calls).test, 'false')
  assertHidden(JSON.stringify(sent.body))
  assertHidden(live.logs.join('\n'))
  assertHidden(JSON.stringify(live.store.deliveries))

  const testMode = harness({ state: 'test', envLive: undefined })
  const testSent = await deliverSubmittedLead(testMode.deps, { submissionId: SUBMISSION_ID })
  assert.equal(testSent.body.disposition, 'test_accepted')
  assert.equal(responseBody(testMode.calls).test, 'true')
  assert.equal(testMode.store.deliveries[0].status, 'test_succeeded')
})

test('disabled, a missing kill switch, the wrong dealer, and leads from before live enable do not send', async () => {
  const disabled = harness({ state: 'disabled' })
  const disabledResult = await deliverSubmittedLead(disabled.deps, { leadId: LEAD_ID })
  assert.equal(disabled.calls.length, 0)
  assert.equal(disabledResult.body.reason, 'integration_disabled')

  for (const envLive of [undefined, 'false', 'TRUE', '1']) {
    const blocked = harness({ envLive })
    const result = await deliverSubmittedLead(blocked.deps, { submissionId: SUBMISSION_ID })
    assert.equal(blocked.calls.length, 0)
    assert.equal(result.body.reason, 'live_delivery_disabled')
  }

  const other = harness({ slug: 'wdm' })
  const otherResult = await deliverSubmittedLead(other.deps, { submissionId: SUBMISSION_ID })
  assert.equal(other.calls.length, 0)
  assert.equal(otherResult.body.reason, 'dealer_not_eligible')

  const mismatch = harness({ integrationDealerId: OTHER_DEALER })
  const mismatchResult = await deliverSubmittedLead(mismatch.deps, { submissionId: SUBMISSION_ID })
  assert.equal(mismatch.calls.length, 0)
  assert.equal(mismatchResult.body.reason, 'dealer_mismatch')

  const before = harness({ leadOverrides: { createdAt: LIVE_AT } })
  const beforeResult = await deliverSubmittedLead(before.deps, { submissionId: SUBMISSION_ID })
  assert.equal(before.calls.length, 0)
  assert.equal(beforeResult.body.reason, 'lead_before_live_enable')

  const unknown = harness({ enabledAt: null })
  const unknownResult = await deliverSubmittedLead(unknown.deps, { submissionId: SUBMISSION_ID })
  assert.equal(unknown.calls.length, 0)
  assert.equal(unknownResult.body.reason, 'live_enable_time_unknown')

  const olderTest = harness({ state: 'test', envLive: undefined, leadOverrides: { createdAt: '2020-01-01T00:00:00.000Z' } })
  const older = await deliverSubmittedLead(olderTest.deps, { submissionId: SUBMISSION_ID })
  assert.equal(older.body.disposition, 'test_accepted')
  assert.equal(responseBody(olderTest.calls).test, 'true')
})

test('door notes keep the labeled summary and shorten the customer note first', () => {
  const note = 'Please call. '.repeat(200)
  const prepared = buildOptaLeadRequest({
    ...syntheticAmericasBestOptaLead(),
    comments: note,
  }, credentials, 'live')
  assert.equal('ready' in prepared, true)
  if (!('ready' in prepared)) return
  const notes = prepared.request.body.notes ?? ''
  assert.equal(notes.length, OPTA_NOTES_MAX_LENGTH)
  assert.match(notes, /^Door line: Smooth-Star/)
  assert.match(notes, /Customer note: Please call\./)
  assert.match(notes, /…$/)
  assert.equal(notes.includes(note), false)
  assert.equal(optaDoorConfigurationNotes(syntheticAmericasBestOptaLead().doorConfiguration, 'Call after five.')?.includes('Customer note: Call after five.'), true)
})

test('uncertain outcomes are never automatically retried; rejects are terminal', async () => {
  const network = harness({ transport: async () => { throw new Error(`socket ${SECRET}`) } })
  await deliverSubmittedLead(network.deps, { submissionId: SUBMISSION_ID })
  assert.equal(network.store.deliveries[0].status, 'dead_letter')
  assert.equal(network.store.deliveries[0].errorCode, 'NETWORK_FAILURE')
  await sweepOptaDeliveries(network.deps)
  assert.equal(network.calls.length, 1)
  assertHidden(network.logs.join('\n'))
  assertHidden(JSON.stringify(network.store.deliveries))

  const rejected = harness({
    transport: async () => ({ status: 200, text: async () => JSON.stringify({ leadStatus: false, reason: `Outside area ${SECRET}`, message: 'Failed Lead = Not Accepted' }) }),
  })
  const rejectedResult = await deliverSubmittedLead(rejected.deps, { submissionId: SUBMISSION_ID })
  assert.equal(rejected.calls.length, 1)
  assert.equal(rejected.store.deliveries[0].status, 'dead_letter')
  assert.equal(rejected.store.deliveries[0].errorCode, 'REJECTED')
  assert.match(rejected.store.deliveries[0].errorMessage ?? '', /\[redacted\]/)
  assertHidden(rejected.store.deliveries[0].errorMessage ?? '')
  assertHidden(JSON.stringify(rejectedResult.body))
  assertHidden(rejected.logs.join('\n'))
  await sweepOptaDeliveries(rejected.deps)
  assert.equal(rejected.calls.length, 1)

  const unauthorized = harness({
    transport: async () => ({ status: 401, text: async () => JSON.stringify({ message: SECRET }) }),
  })
  await deliverSubmittedLead(unauthorized.deps, { submissionId: SUBMISSION_ID })
  assert.equal(unauthorized.store.deliveries[0].status, 'dead_letter')
  assert.equal(unauthorized.store.deliveries[0].errorCode, 'UNAUTHORIZED')
  await sweepOptaDeliveries(unauthorized.deps)
  assert.equal(unauthorized.calls.length, 1)
  assertHidden(JSON.stringify(unauthorized.store.deliveries))
  assertHidden(unauthorized.logs.join('\n'))

  const invalid = harness({ leadOverrides: { phone: '   ' } })
  const invalidResult = await deliverSubmittedLead(invalid.deps, { submissionId: SUBMISSION_ID })
  assert.equal(invalid.calls.length, 0)
  assert.equal(invalid.store.deliveries[0].status, 'dead_letter')
  assert.equal(invalid.store.deliveries[0].errorCode, 'MISSING_FIELD')
  assert.equal(invalidResult.body.disposition, 'dead_letter')
})

test('a duplicate claim is skipped and a paused kill switch does not retry a live failure', async () => {
  let release = () => {}
  let markStarted = () => {}
  const gate = new Promise<void>((resolve) => { release = resolve })
  const startedGate = new Promise<void>((resolve) => { markStarted = resolve })
  let started = 0
  const racing = harness({
    transport: async () => {
      started += 1
      markStarted()
      await gate
      return { status: 200, text: async () => JSON.stringify({ leadStatus: true, testLead: false, message: 'Success Lead = Accepted' }) }
    },
  })
  const first = deliverSubmittedLead(racing.deps, { submissionId: SUBMISSION_ID })
  const second = deliverSubmittedLead(racing.deps, { leadId: LEAD_ID })
  await startedGate
  assert.equal(started, 1)
  release()
  const results = await Promise.all([first, second])
  assert.equal(started, 1)
  assert.equal(results.filter((result) => result.body.disposition === 'duplicate').length, 1)
  assert.equal(racing.store.deliveries.length, 1)
  assert.equal(racing.store.deliveries[0].idempotencyKey, leadDeliveryIdempotencyKey(INTEGRATION_ID, LEAD_ID))

  const paused = harness({
    transport: async () => ({ status: 500, text: async () => 'down' }),
  })
  let pausedNow = Date.parse('2026-11-24T16:00:00.000Z')
  paused.deps.now = () => new Date(pausedNow)
  await deliverSubmittedLead(paused.deps, { submissionId: SUBMISSION_ID })
  paused.env.OPTA_LIVE_DELIVERY_ENABLED = undefined
  pausedNow += OPTA_RETRY_DELAYS_MS[0]
  await sweepOptaDeliveries(paused.deps)
  assert.equal(paused.calls.length, 1)
  assert.equal(paused.store.deliveries[0].status, 'dead_letter')

  paused.store.dealers[0].slug = 'uhr'
  paused.env.OPTA_LIVE_DELIVERY_ENABLED = 'true'
  await sweepOptaDeliveries(paused.deps)
  assert.equal(paused.calls.length, 1)
  assert.equal(paused.store.deliveries[0].status, 'dead_letter')
})

test('the cron sweep discovers leads created after enablement and skips older ones', async () => {
  const discovered = harness({ state: 'test', envLive: undefined })
  discovered.store.leads[0].createdAt = '2026-11-24T13:00:00.000Z'
  await sweepOptaDeliveries(discovered.deps)
  assert.equal(discovered.calls.length, 0)

  discovered.store.leads.push(lead({
    id: '33333333-3333-4333-8333-333333333333',
    submissionId: '44444444-4444-4444-8444-444444444444',
    createdAt: '2026-11-24T15:30:00.000Z',
    email: 'newer@example.com',
  }))
  await sweepOptaDeliveries(discovered.deps)
  assert.equal(discovered.calls.length, 1)
  assert.equal(responseBody(discovered.calls).test, 'true')
  assert.equal(responseBody(discovered.calls).email, 'newer@example.com')
  assert.equal(discovered.store.deliveries.length, 1)
})

test('trigger and cron routes require their own shared secrets', async () => {
  const { deps } = harness()
  const unauthorized = await invokeTrigger(deps, {})
  assert.equal(unauthorized.status, 401)
  const wrong = await invokeTrigger(deps, { 'x-crm-delivery-secret': deps.env.CRON_SECRET ?? '' })
  assert.equal(wrong.status, 401)
  const cronAsTrigger = await invokeCron(deps, deps.env.CRM_DELIVERY_TRIGGER_SECRET ?? '')
  assert.equal(cronAsTrigger.status, 401)
  const missing = await invokeCron({ ...deps, env: { ...deps.env, CRON_SECRET: undefined } }, 'cron-secret-value')
  assert.equal(missing.status, 401)

  const accepted = await invokeTrigger(deps, { 'x-crm-delivery-secret': deps.env.CRM_DELIVERY_TRIGGER_SECRET ?? '' }, { submissionId: SUBMISSION_ID })
  assert.equal(accepted.status, 200)
  assert.equal(accepted.body.disposition, 'live_accepted')
  assertHidden(JSON.stringify(accepted.body))

  const cron = await invokeCron(deps, deps.env.CRON_SECRET ?? '')
  assert.equal(cron.status, 200)
  assert.equal(cron.body.ok, true)
  const getRejected = await invokeCron(deps, deps.env.CRON_SECRET ?? '', 'POST')
  assert.equal(getRejected.status, 405)
})

test('stored credentials round-trip from bytea and unique clashes do not echo secrets', async () => {
  const key = randomBytes(32).toString('base64')
  const envelope = encryptCrmCredentials(credentials, key)
  const tables: Record<string, Record<string, unknown>[]> = {
    dealer_crm_integrations: [{
      id: INTEGRATION_ID,
      dealer_id: DEALER_ID,
      provider: 'opta',
      state: 'test',
      field_mapping: {},
      credentials_ciphertext: bytea(envelope.ciphertext),
      credentials_iv: bytea(envelope.iv),
      credentials_auth_tag: bytea(envelope.authTag),
      credential_key_version: 1,
    }],
    dealer_crm_lead_deliveries: [],
  }
  const admin = memoryAdmin(tables)
  const store = createSupabaseOptaDeliveryStore(admin, key)
  const integration = await store.findOptaIntegration(DEALER_ID)
  assert.equal(integration?.credentials?.authenticationKey, SECRET)
  assert.equal(Object.hasOwn(integration ?? {}, 'credentials'), true)
  assert.equal(JSON.stringify(integration).includes(String(tables.dealer_crm_integrations[0].credentials_ciphertext)), false)

  await assert.rejects(() => createSupabaseOptaDeliveryStore(admin, randomBytes(32).toString('base64')).findOptaIntegration(DEALER_ID), (error: unknown) => {
    assert.ok(error instanceof Error)
    assert.equal(error.message, 'CRM credentials are unavailable.')
    assert.equal(error.message.includes(SECRET), false)
    assert.equal(error.message.includes(key), false)
    return true
  })

  const idempotencyKey = 'a'.repeat(64)
  const insert: DeliveryInsert = {
    integrationId: INTEGRATION_ID,
    leadId: LEAD_ID,
    dealerId: DEALER_ID,
    idempotencyKey,
    status: 'attempting',
    attemptCount: 1,
    now: CREATED_AT,
    mode: 'test',
  }
  const first = await store.insertDelivery(insert)
  assert.equal(first.inserted, true)
  const second = await store.insertDelivery(insert)
  assert.deepEqual(second, { inserted: false, reason: 'duplicate' })

  const leaking = createSupabaseOptaDeliveryStore(failingAdmin(SECRET), key)
  await assert.rejects(() => leaking.insertDelivery(insert), (error: unknown) => {
    assert.ok(error instanceof Error)
    assert.equal(error.message.includes(SECRET), false)
    return true
  })
})

test('the production transport accepts an injected fetch and does not follow redirects', async () => {
  const seen = { url: '', redirect: '', hasSignal: false }
  const transport = createOptaFetchTransport(async (url, init) => {
    seen.url = String(url)
    seen.redirect = init?.redirect ?? ''
    seen.hasSignal = Boolean(init?.signal)
    return new Response(JSON.stringify({ leadStatus: true, testLead: true }), { status: 200 })
  })
  const response = await transport(OPTA_SUBMIT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ test: 'true' }),
    redirect: 'error',
  })
  assert.equal(response.status, 200)
  assert.equal(seen.url, OPTA_SUBMIT_URL)
  assert.equal(seen.redirect, 'error')
  assert.equal(seen.hasSignal, true)
})

function bytea(value: string) {
  return `\\x${Buffer.from(value, 'base64').toString('hex')}`
}

function memoryAdmin(tables: Record<string, Record<string, unknown>[]>): CrmAdminClient {
  return {
    from(table: string) {
      const state: { filters: Array<[string, string, unknown]>; insertRow?: Record<string, unknown> } = { filters: [] }
      const rows = () => (tables[table] ?? []).filter((row) => state.filters.every(([op, column, value]) => {
        if (op === 'eq') return row[column] === value
        if (op === 'in') return Array.isArray(value) && value.includes(row[column])
        return true
      }))
      const api = {
        select: () => api,
        eq: (column: string, value: string | number | boolean | null) => { state.filters.push(['eq', column, value]); return api },
        in: (column: string, value: readonly string[]) => { state.filters.push(['in', column, value]); return api },
        gt: () => api,
        order: () => api,
        limit: () => api,
        insert: (row: Record<string, unknown>) => { state.insertRow = row; return api },
        update: () => api,
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        single: async () => {
          if (state.insertRow) {
            const duplicate = (tables[table] ?? []).some((row) => row.idempotency_key === state.insertRow?.idempotency_key)
            if (duplicate) return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }
            const stored = { id: 'stored-row', ...state.insertRow }
            tables[table] = [...(tables[table] ?? []), stored]
            return { data: stored, error: null }
          }
          return { data: rows()[0] ?? null, error: rows()[0] ? null : { code: 'PGRST116', message: '0 rows' } }
        },
        then: (resolve: (value: { data: Record<string, unknown>[]; error: null }) => void) => resolve({ data: rows(), error: null }),
      }
      return api
    },
  } as unknown as CrmAdminClient
}

function failingAdmin(secret: string): CrmAdminClient {
  const failure = { data: null, error: { code: 'XX000', message: `database rejected ${secret}` } }
  const api = {
    select: () => api,
    eq: () => api,
    in: () => api,
    gt: () => api,
    order: () => api,
    limit: () => api,
    insert: () => api,
    update: () => api,
    maybeSingle: async () => failure,
    single: async () => failure,
    then: (resolve: (value: typeof failure) => void) => resolve(failure),
  }
  return { from: () => api } as unknown as CrmAdminClient
}

function invokeTrigger(deps: OptaWorkerDeps, headers: Record<string, string>, body?: unknown) {
  return invoke('POST', headers, body, (request, response) => handleCrmDeliveryTrigger(request, response, deps))
}

function invokeCron(deps: OptaWorkerDeps, secret: string, method = 'GET') {
  return invoke(method, secret ? { authorization: `Bearer ${secret}` } : {}, undefined, (request, response) => handleOptaDeliveryCron(request, response, deps))
}

async function invoke(
  method: string,
  headers: Record<string, string>,
  body: unknown,
  run: (request: IncomingMessage, response: JsonResponse) => Promise<unknown>,
) {
  const payload = body === undefined ? [] : [Buffer.from(JSON.stringify(body))]
  const request = Object.assign(Readable.from(payload), { method, headers, url: '/api/test' }) as IncomingMessage
  const chunks: string[] = []
  const response = {
    statusCode: 0,
    setHeader() { return this },
    end(value?: string) { if (value) chunks.push(value) },
    json(value: unknown) { chunks.push(JSON.stringify(value)) },
  }
  await run(request, response as unknown as JsonResponse)
  return { status: response.statusCode, body: chunks.length ? JSON.parse(chunks.join('')) as Record<string, unknown> : {} }
}

type JsonResponse = Parameters<typeof handleCrmDeliveryTrigger>[1]

test('bounded sweeps discover all 125 leads without delivered rows blocking later leads', async () => {
  const h = harness({ state: 'test', envLive: undefined })
  h.store.leads = Array.from({ length: 125 }, (_, n) => lead({
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    submissionId: `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    createdAt: '2026-11-24T15:00:00.000Z',
  }))
  for (let n = 0; n < 7; n++) await sweepOptaDeliveries(h.deps)
  assert.equal(h.calls.length, 125)
  assert.equal(new Set(h.store.deliveries.map(row => row.leadId)).size, 125)
  await sweepOptaDeliveries(h.deps)
  assert.equal(h.calls.length, 125)
})

test('live responses classified as test or missing test classification remain unconfirmed', async () => {
  for (const testLead of [true, undefined]) {
    const h = harness({ transport: async () => ({ status: 200, text: async () => JSON.stringify({ leadStatus: true, testLead }) }) })
    await deliverSubmittedLead(h.deps, { submissionId: SUBMISSION_ID })
    assert.equal(h.store.deliveries[0].status, 'dead_letter')
    await sweepOptaDeliveries(h.deps)
    assert.equal(h.calls.length, 1)
  }
})

test('interrupted attempts and legacy failed attempts are not automatically resent', async () => {
  for (const status of ['attempting', 'failed'] as const) {
    const h = harness()
    await h.store.insertDelivery({ integrationId: INTEGRATION_ID, leadId: LEAD_ID, dealerId: DEALER_ID, idempotencyKey: leadDeliveryIdempotencyKey(INTEGRATION_ID, LEAD_ID), status, attemptCount: 1, now: '2026-01-01T00:00:00Z', mode: 'live' })
    await sweepOptaDeliveries(h.deps)
    assert.equal(h.calls.length, 0)
  }
})

test('trigger accepts Vercel parsed JSON and rejects missing secrets', async () => {
  const h = harness({ state: 'test' })
  const req = Object.assign(Readable.from([]), { method: 'POST', headers: { 'x-crm-delivery-secret': h.env.CRM_DELIVERY_TRIGGER_SECRET }, body: { submissionId: SUBMISSION_ID } }) as unknown as IncomingMessage
  let body: Record<string, unknown> = {}
  const res = { statusCode: 0, setHeader() { return this }, end() {}, json(value: Record<string, unknown>) { body = value } }
  await handleCrmDeliveryTrigger(req, res as unknown as JsonResponse, h.deps)
  assert.equal(res.statusCode, 200)
  assert.equal(body.disposition, 'test_accepted')
})

test('discovery query excludes rows for this integration before applying its limit', async () => {
  const calls: Array<[string, ...unknown[]]> = []
  const query = {
    select: (...args: unknown[]) => { calls.push(['select', ...args]); return query },
    eq: (...args: unknown[]) => { calls.push(['eq', ...args]); return query },
    is: (...args: unknown[]) => { calls.push(['is', ...args]); return query },
    gt: (...args: unknown[]) => { calls.push(['gt', ...args]); return query },
    order: (...args: unknown[]) => { calls.push(['order', ...args]); return query },
    limit: (...args: unknown[]) => { calls.push(['limit', ...args]); return query },
    then: (resolve: (value: unknown) => void) => resolve({ data: [], error: null }),
  }
  const store = createSupabaseOptaDeliveryStore({ from: () => query } as unknown as CrmAdminClient, undefined)
  await store.listLeadsCreatedAfter(DEALER_ID, LIVE_AT, 20, INTEGRATION_ID)
  assert.match(String(calls.find(call => call[0] === 'select')?.[1]), /delivery:dealer_crm_lead_deliveries!dealer_crm_delivery_lead_fk\(\)/)
  assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'delivery.integration_id' && call[2] === INTEGRATION_ID))
  assert.ok(calls.some(call => call[0] === 'is' && call[1] === 'delivery' && call[2] === null))
  assert.deepEqual(calls.filter(call => call[0] === 'order').map(call => call[1]), ['created_at', 'id'])
  assert.equal(calls.at(-1)?.[1], 20)
})
