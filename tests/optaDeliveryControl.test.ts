import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { encryptCrmCredentials, leadDeliveryIdempotencyKey } from '../api/_lib/dealerCrmIntegration.ts'
import { classifySupabaseReadError, fetchWithoutNewKeyBearer, type SavedOptaCredentialRow } from '../api/_lib/optaSavedCredentials.ts'
import {
  DOOR_BUILDER_OPTA_FIELDS,
  OPTA_AUTOMATIC_DELIVERY_ENABLED,
  OPTA_SYNTHETIC_TEST_CONFIRMATION,
  automaticOptaDelivery,
  evaluateOptaDeliveryHook,
  optaDeliveryDraft,
  optaPolicyFromFieldMapping,
  optaSafeLog,
  optaSyntheticTestCli,
  planOptaDuplicateDelivery,
  runAuthorizedSyntheticOptaTest,
} from '../api/_lib/optaDeliveryControl.ts'
import '../scripts/opta-synthetic-test.ts'
import {
  DEFAULT_OPTA_UNCONFIRMED_POLICY,
  OPTA_DOCUMENTED_SAMPLE_PRICE,
  buildOptaTestLeadRequest,
  syntheticAmericasBestOptaLead,
  type OptaTransport,
} from '../api/_lib/optaLeadDelivery.ts'

const credentials = {
  companyId: 'company-test',
  sourceId: 'source-test',
  campaignId: 'campaign-test',
  authenticationKey: 'auth-test',
}

function transportThatThrows(): OptaTransport {
  return async () => {
    throw new Error('transport should not be called')
  }
}

function acceptedTransport(calls: Array<{ body: string }>): OptaTransport {
  return async (_url, init) => {
    calls.push({ body: init.body })
    return { status: 200, text: async () => JSON.stringify({ leadStatus: true, testLead: true, reason: '', message: '', price: '0.00' }) }
  }
}

test('default mapping sends collected Door Builder fields and omits unconfirmed ones', () => {
  const prepared = buildOptaTestLeadRequest(syntheticAmericasBestOptaLead(), credentials, 'test', DEFAULT_OPTA_UNCONFIRMED_POLICY)
  assert.equal('ready' in prepared, true)
  if (!('ready' in prepared)) return
  const body = prepared.request.body
  assert.equal(body.first, 'Hgi')
  assert.equal(body.last, 'Synthetic Test')
  assert.equal(body.email, 'hgi-synthetic-test@example.com')
  assert.equal(body.phone, '5550100199')
  assert.equal(body.zip, '43215')
  assert.equal(body.price, '0.0')
  assert.match(body.notes ?? '', /Door line: Smooth-Star/)
  assert.match(body.notes ?? '', /Customer note: Synthetic homeowner note/)
  assert.doesNotMatch(body.notes ?? '', /\{|schemaVersion/)
  assert.equal(body.lead_id, '00000000-0000-4000-8000-000000000001')
  assert.equal(body.test, 'true')
  assert.equal(Object.hasOwn(body, 'address'), false)
  assert.equal(Object.hasOwn(body, 'city'), false)
  assert.equal(Object.hasOwn(body, 'state'), false)
  assert.equal(Object.hasOwn(body, 'tf'), false)
  assert.equal(DOOR_BUILDER_OPTA_FIELDS.zip, 'customer.postal_code')
  assert.equal(optaPolicyFromFieldMapping({ address: 'customer.email' }).address, 'omit')
  assert.equal(optaPolicyFromFieldMapping({ address: 'customer.address', city: 'customer.city', state: 'customer.state' }).address, 'require_present')
})

test('require_present blocks missing address data and configured price is explicit', () => {
  const lead = { ...syntheticAmericasBestOptaLead(), address: null, city: null, state: null, price: null }
  let called = false
  const missing = buildOptaTestLeadRequest(lead, credentials, 'test', { ...DEFAULT_OPTA_UNCONFIRMED_POLICY, address: 'require_present', city: 'require_present', state: 'require_present' })
  assert.equal('ready' in missing, false)
  if ('ready' in missing) return
  assert.equal(missing.disposition, 'missing_field')
  if (missing.disposition !== 'missing_field') return
  assert.deepEqual(missing.missing, ['address', 'city', 'state'])

  const invented = buildOptaTestLeadRequest(lead, credentials, 'test', { ...DEFAULT_OPTA_UNCONFIRMED_POLICY, price: 'configured_default', priceDefault: null })
  assert.equal('ready' in invented, false)
  const explicit = buildOptaTestLeadRequest(lead, credentials, 'test', {
    ...DEFAULT_OPTA_UNCONFIRMED_POLICY,
    price: 'configured_default',
    priceDefault: OPTA_DOCUMENTED_SAMPLE_PRICE,
  })
  assert.equal('ready' in explicit, true)
  if (!('ready' in explicit)) return
  assert.equal(explicit.request.body.price, '0.0')
  assert.equal(called, false)
})

test('synthetic authorization never posts without the exact confirmation and skips duplicates', async () => {
  const calls: Array<{ body: string }> = []
  const logs: string[] = []
  const logger = (event: unknown) => logs.push(JSON.stringify(event))
  const blocked = await runAuthorizedSyntheticOptaTest({
    confirmation: 'yes',
    credentials,
    transport: transportThatThrows(),
    integrationId: 'integration-test',
    logger,
  })
  assert.equal(blocked.disposition, 'confirmation_required')
  const sent = await runAuthorizedSyntheticOptaTest({
    confirmation: OPTA_SYNTHETIC_TEST_CONFIRMATION,
    credentials,
    transport: acceptedTransport(calls),
    integrationId: 'integration-test',
    logger,
  })
  assert.equal(sent.disposition, 'test_accepted')
  assert.equal(sent.persisted, false)
  assert.equal(calls.length, 1)
  const body = JSON.parse(calls[0].body) as Record<string, string>
  assert.equal(body.test, 'true')
  assert.equal(Object.hasOwn(body, 'address'), false)
  const duplicate = await runAuthorizedSyntheticOptaTest({
    confirmation: OPTA_SYNTHETIC_TEST_CONFIRMATION,
    credentials,
    transport: transportThatThrows(),
    integrationId: 'integration-test',
    existingDelivery: { delivery_status: 'test_succeeded' },
    logger,
  })
  assert.equal(duplicate.disposition, 'duplicate')
  assert.equal(duplicate.idempotencyKey, leadDeliveryIdempotencyKey('integration-test', syntheticAmericasBestOptaLead().id))
  assert.equal(planOptaDuplicateDelivery({ delivery_status: 'test_failed' }).retry, true)
  const logged = logs.join('\n')
  assert.equal(logged.includes('auth-test'), false)
  assert.equal(logged.includes('hgi-synthetic-test@example.com'), false)
  assert.equal(logged.includes('5550100199'), false)
  assert.deepEqual(Object.keys(optaSafeLog(sent)).sort(), ['disposition', 'event', 'httpStatus', 'leadStatus', 'testLead'])
})

test('automatic delivery stays off and disabled or live integrations do not send', async () => {
  assert.equal(OPTA_AUTOMATIC_DELIVERY_ENABLED, false)
  const source = readFileSync('api/_lib/optaDeliveryControl.ts', 'utf8')
  assert.match(source, /evaluateOptaDeliveryHook\(OPTA_AUTOMATIC_DELIVERY_ENABLED/)
  assert.match(source, /arg\.includes\('test=false'\)/)
  assert.doesNotMatch(source, /test:\s*['"]false['"]|test\s*=\s*['"]false['"]/)
  const input = {
    integration: { id: 'integration-test', state: 'disabled' as const, fieldMapping: {} },
    lead: syntheticAmericasBestOptaLead(),
    credentials,
    transport: transportThatThrows(),
    store: { save: async () => { throw new Error('store should not be called') } },
  }
  assert.deepEqual(await automaticOptaDelivery(input), { ok: false, disposition: 'automatic_delivery_disabled' })
  assert.deepEqual(await evaluateOptaDeliveryHook(true, input), { ok: false, disposition: 'ineligible', reason: 'integration_disabled' })
  assert.deepEqual(await evaluateOptaDeliveryHook(true, { ...input, integration: { ...input.integration, state: 'live' } }), {
    ok: false, disposition: 'ineligible', reason: 'live_delivery_disabled',
  })
  assert.deepEqual(await evaluateOptaDeliveryHook(true, { ...input, lead: { ...input.lead, dealerSlug: 'wdm' }, integration: { ...input.integration, state: 'test' } }), {
    ok: false, disposition: 'ineligible', reason: 'dealer_not_eligible',
  })
})

test('a real lead can draft one sanitized delivery row and a missing lead is not persisted', async () => {
  const calls: Array<{ body: string }> = []
  const saved: unknown[] = []
  const sent = await evaluateOptaDeliveryHook(true, {
    integration: { id: 'integration-test', state: 'test', fieldMapping: {} },
    lead: syntheticAmericasBestOptaLead(),
    credentials,
    transport: acceptedTransport(calls),
    leadExists: true,
    store: { save: async (draft) => { saved.push(draft) } },
  })
  assert.equal(sent.ok, true)
  assert.equal(saved.length, 1)
  const draft = saved[0] as ReturnType<typeof optaDeliveryDraft>
  assert.equal(draft.provider, 'opta')
  assert.equal(draft.delivery_status, 'test_succeeded')
  assert.equal(draft.error_message, null)
  assert.equal(JSON.stringify(draft).includes('auth-test'), false)
  assert.equal(JSON.stringify(draft).includes('hgi-synthetic-test@example.com'), false)
  const unsaved: unknown[] = []
  await evaluateOptaDeliveryHook(true, {
    integration: { id: 'integration-test', state: 'test' },
    lead: syntheticAmericasBestOptaLead(),
    credentials,
    transport: acceptedTransport(calls),
    leadExists: false,
    existingDelivery: { delivery_status: 'test_succeeded' },
    store: { save: async (draft) => { unsaved.push(draft) } },
  })
  assert.equal(unsaved.length, 0)
  assert.equal(calls.length, 1)
})

test('the manual command dry-runs unless confirmation, the post gate, and saved credentials are available', async () => {
  const key = randomBytes(32).toString('base64')
  const envelope = encryptCrmCredentials(credentials, key)
  const calls: Array<{ body: string; url: string }> = []
  const lines: string[] = []
  const io = {
    log: (line: string) => lines.push(line),
    error: (line: string) => lines.push(line),
    readCredentialRow: async () => ({ dealerFound: true, row: savedCredentialRow(envelope) }),
  }
  const savedEnv = {
    SUPABASE_URL: 'https://udbcnpjtwhmjzpjjhoph.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-test',
    CRM_CREDENTIAL_ENCRYPTION_KEY: key,
    OPTA_SYNTHETIC_POST_ENABLED: 'true',
  }
  const dry = await optaSyntheticTestCli([], {}, transportThatThrows(), io)
  assert.equal(dry.sent, false)
  assert.equal(dry.exitCode, 0)
  assert.match(lines.join('\n'), /No Opta request was sent/)
  const refused = await optaSyntheticTestCli(['--send', `--confirm=${OPTA_SYNTHETIC_TEST_CONFIRMATION}`], { OPTA_SYNTHETIC_POST_ENABLED: 'true' }, transportThatThrows(), io)
  assert.equal(refused.sent, false)
  const live = await optaSyntheticTestCli(['--send', '--live', `--confirm=${OPTA_SYNTHETIC_TEST_CONFIRMATION}`], savedEnv, transportThatThrows(), io)
  assert.equal(live.exitCode, 2)
  const sent = await optaSyntheticTestCli(['--send', `--confirm=${OPTA_SYNTHETIC_TEST_CONFIRMATION}`], savedEnv, async (url, init) => {
    calls.push({ url: String(url), body: init.body })
    return { status: 200, text: async () => JSON.stringify({ leadStatus: true, testLead: true, reason: '', message: '', price: '0.00' }) }
  }, io)
  assert.equal(sent.sent, true)
  assert.equal(calls.length, 1)
  assert.equal(JSON.parse(calls[0].body).test, 'true')
  assert.equal(calls[0].url, 'https://abw.opta.io/ca/submit')
  const visible = lines.join('\n')
  assert.equal(visible.includes(key), false)
  assert.equal(visible.includes('auth-test'), false)
  assert.equal(visible.includes('company-test'), false)
  assert.equal(visible.includes('service-role-test'), false)
})

test('verify-credentials reports field booleans and does not call Opta', async () => {
  const key = randomBytes(32).toString('base64')
  const envelope = encryptCrmCredentials(credentials, key)
  const lines: string[] = []
  let reads = 0
  const result = await optaSyntheticTestCli(['--verify-credentials', '--send'], {
    SUPABASE_URL: 'https://udbcnpjtwhmjzpjjhoph.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-test',
    CRM_CREDENTIAL_ENCRYPTION_KEY: key,
    OPTA_SYNTHETIC_POST_ENABLED: 'true',
  }, transportThatThrows(), {
    log: (line) => lines.push(line),
    error: (line) => lines.push(line),
    readCredentialRow: async () => {
      reads += 1
      return { dealerFound: true, row: savedCredentialRow(envelope) }
    },
  })
  assert.equal(result.sent, false)
  assert.equal(result.exitCode, 0)
  assert.equal(reads, 1)
  const report = JSON.parse(lines.join('\n')) as { decrypted: boolean; optaRequestSent: boolean; fields: Record<string, boolean>; state: string }
  assert.equal(report.decrypted, true)
  assert.equal(report.optaRequestSent, false)
  assert.equal(report.state, 'disabled')
  assert.deepEqual(report.fields, { companyId: true, sourceId: true, campaignId: true, authenticationKey: true })
  const visible = lines.join('\n')
  assert.equal(visible.includes(key), false)
  assert.equal(visible.includes('auth-test'), false)
  assert.equal(visible.includes('company-test'), false)
  assert.equal(visible.includes('service-role-test'), false)
  const wrongKey = await optaSyntheticTestCli(['--verify-credentials'], {
    SUPABASE_URL: 'https://udbcnpjtwhmjzpjjhoph.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-test',
    CRM_CREDENTIAL_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  }, transportThatThrows(), {
    log: (line) => lines.push(line),
    readCredentialRow: async () => ({ dealerFound: true, row: savedCredentialRow(envelope) }),
  })
  assert.equal(wrongKey.sent, false)
  assert.match(lines.at(-1) ?? '', /"decrypted":false/)
})

test('database errors stay distinct and do not echo the provider message', async () => {
  const lines: string[] = []
  const env = {
    SUPABASE_URL: 'https://udbcnpjtwhmjzpjjhoph.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-test',
    CRM_CREDENTIAL_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  }
  const denied = await optaSyntheticTestCli(['--verify-credentials'], env, transportThatThrows(), {
    log: (line) => lines.push(line),
    readCredentialRow: async () => {
      throw { code: '42501', message: 'permission denied for column credentials_ciphertext secret-leak-value' }
    },
  })
  assert.equal(denied.sent, false)
  const report = JSON.parse(lines.at(-1) ?? '{}') as { reason: string; supabaseCode?: string; rowFound: boolean }
  assert.equal(report.reason, 'supabase_permission_denied')
  assert.equal(report.supabaseCode, '42501')
  assert.equal(report.rowFound, false)
  assert.equal(lines.at(-1)?.includes('secret-leak-value'), false)
  assert.deepEqual(classifySupabaseReadError({ code: 'PGRST301', message: 'Invalid API key sb_secret_should_not_print' }), {
    reason: 'supabase_auth_failed',
    supabaseCode: 'PGRST301',
  })
  const headers = new Headers({ Authorization: 'Bearer sb_secret_example', apikey: 'sb_secret_example' })
  let sentAuthorization: string | null = 'unset'
  await fetchWithoutNewKeyBearer('sb_secret_example', async (_input, init) => {
    sentAuthorization = new Headers(init?.headers).get('Authorization')
    return new Response('{}')
  })('https://example.test', { headers })
  assert.equal(sentAuthorization, null)
})

function savedCredentialRow(envelope: { ciphertext: string; iv: string; authTag: string; keyVersion: number }): SavedOptaCredentialRow {
  const bytea = (value: string) => `\\x${Buffer.from(value, 'base64').toString('hex')}`
  return {
    id: 'integration-test',
    state: 'disabled',
    credential_key_version: envelope.keyVersion,
    credentials_ciphertext: bytea(envelope.ciphertext),
    credentials_iv: bytea(envelope.iv),
    credentials_auth_tag: bytea(envelope.authTag),
  }
}

test('lead submission and the settings API do not import the Opta delivery hook', () => {
  const files = [...walk('api'), ...walk('src'), ...walk('scripts')].filter((path) => !path.endsWith('optaDeliveryControl.ts') && !path.endsWith('opta-synthetic-test.ts'))
  for (const path of files) {
    const source = readFileSync(path, 'utf8')
    assert.doesNotMatch(source, /automaticOptaDelivery|evaluateOptaDeliveryHook|runAuthorizedSyntheticOptaTest|optaSyntheticTestCli/)
  }
  assert.equal(readFileSync('scripts/opta-synthetic-test.ts', 'utf8').includes('optaSyntheticTestCli'), true)
})

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    if (statSync(path).isDirectory()) return walk(path)
    return path.endsWith('.ts') || path.endsWith('.tsx') ? [path] : []
  })
}
