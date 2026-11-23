import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { decryptCrmCredentials, encryptCrmCredentials, isCrmCredentialEncryptionConfigured } from '../api/_lib/dealerCrmIntegration.ts'
import {
  doorBuilderLeadSource,
  doorBuilderWebhookTestPayload,
  executeDoorBuilderWebhookRequest,
  maskZapierCatchHookUrl,
  validateZapierCatchHookUrl,
  type DoorBuilderWebhookStore,
  type StoredWebhookRecord,
  type WebhookAuditRecord,
  type WebhookEnvelope,
} from '../api/_lib/doorBuilderWebhookPolicy.ts'

const KEY = Buffer.alloc(32, 7).toString('base64')
const VECTOR = {
  ciphertext: 'XtzUZjhAMS0RFTEwyW3dZJlIkJyOursYQLHsws2fIcjYwg8M+JTIb6bnJG7+4YQkU0d767iwDkMZHgHCXE/sDZGEU1eN2w==',
  iv: 'AwMDAwMDAwMDAwMD',
  authTag: 'sWTGKW3FTvFTR7aq3XxeUg==',
  keyVersion: 1,
}
const HOOK = 'https://hooks.zapier.com/hooks/catch/123456/abcdefgh/'
const DEALER_ID = '11111111-1111-4111-8111-111111111111'
const ACTOR = '22222222-2222-4222-8222-222222222222'

function encrypt(webhookUrl: string, key: string): WebhookEnvelope {
  const envelope = encryptCrmCredentials({ webhookUrl: validateZapierCatchHookUrl(webhookUrl) }, key)
  return { ciphertext: envelope.ciphertext, iv: envelope.iv, authTag: envelope.authTag, keyVersion: envelope.keyVersion }
}

function memoryStore(initial?: { slug?: string; companyName?: string }) {
  const calls: string[] = []
  let secret: { webhookId: string; envelope: WebhookEnvelope; maskedUrl: string } | null = null
  let webhook: StoredWebhookRecord | null = null
  const audit: WebhookAuditRecord[] = []
  const store: DoorBuilderWebhookStore = {
    async findDealer(dealerId) {
      calls.push(`dealer:${dealerId}`)
      if (dealerId !== DEALER_ID) return null
      return { id: DEALER_ID, companyName: initial?.companyName ?? "America's Best Windows and Doors", slug: initial?.slug ?? 'americas-best-windows-and-doors' }
    },
    async findWebhook() { return webhook },
    async readSecret() { calls.push('read-secret'); return secret },
    async writeWebhook(input) {
      calls.push('write')
      const action = webhook ? 'replaced' as const : 'saved' as const
      webhook = {
        id: 'webhook-1', dealerId: input.dealerId, maskedUrl: input.maskedUrl, verified: false, updatedAt: '2026-11-20T00:00:00.000Z',
        lastSuccessAt: webhook?.lastSuccessAt ?? null, lastSuccessHttpStatus: webhook?.lastSuccessHttpStatus ?? null,
        lastFailureAt: webhook?.lastFailureAt ?? null, lastFailureHttpStatus: webhook?.lastFailureHttpStatus ?? null,
        lastTestAt: webhook?.lastTestAt ?? null, lastTestHttpStatus: webhook?.lastTestHttpStatus ?? null,
      }
      secret = { webhookId: 'webhook-1', envelope: input.envelope, maskedUrl: input.maskedUrl }
      audit.unshift({ id: `audit-${audit.length + 1}`, action, maskedUrl: input.maskedUrl, httpStatus: null, testSubmissionId: null, actorUserId: input.actorUserId, createdAt: '2026-11-20T00:00:00.000Z' })
      return action
    },
    async removeWebhook(input) {
      calls.push('remove')
      if (!webhook) return false
      audit.unshift({ id: `audit-${audit.length + 1}`, action: 'removed', maskedUrl: input.maskedUrl, httpStatus: null, testSubmissionId: null, actorUserId: input.actorUserId, createdAt: '2026-11-20T00:01:00.000Z' })
      webhook = null
      secret = null
      return true
    },
    async recordTest(input) {
      calls.push('record-test')
      if (!webhook) throw new Error('missing')
      webhook = { ...webhook, verified: input.accepted ? true : webhook.verified, lastTestAt: '2026-11-20T00:02:00.000Z', lastTestHttpStatus: input.httpStatus }
      audit.unshift({ id: `audit-${audit.length + 1}`, action: 'tested', maskedUrl: input.maskedUrl, httpStatus: input.httpStatus, testSubmissionId: input.testSubmissionId, actorUserId: input.actorUserId, createdAt: '2026-11-20T00:02:00.000Z' })
    },
    async listAudit() { return audit },
    async listFailures() { return [] },
    async claimRetry() { return { result: 'not_failed' as const } },
    async finishRetry() { return undefined },
  }
  return { store, calls, read: () => ({ webhook, secret, audit }) }
}

function command(overrides: Partial<Parameters<typeof executeDoorBuilderWebhookRequest>[0]> = {}) {
  const memory = memoryStore()
  const fetches: Array<{ url: string; init: RequestInit | undefined }> = []
  const fetchImpl: typeof fetch = async (url, init) => {
    fetches.push({ url: String(url), init })
    return new Response('accepted', { status: 200 })
  }
  return {
    memory,
    fetches,
    run: (extra: Partial<Parameters<typeof executeDoorBuilderWebhookRequest>[0]> = {}) => executeDoorBuilderWebhookRequest({
      method: 'GET',
      dealerId: DEALER_ID,
      authorization: 'Bearer manager',
      authorize: async () => ({ authorized: true, userId: ACTOR }),
      store: memory.store,
      fetchImpl,
      encryptionConfigured: true,
      encryptionKey: KEY,
      encrypt,
      decrypt: (envelope, key) => {
        const parsed = decryptCrmCredentials(envelope, key)
        return validateZapierCatchHookUrl(parsed.webhookUrl)
      },
      now: () => new Date('2026-11-20T12:00:00.000Z'),
      ...overrides,
      ...extra,
    }),
  }
}

test('Catch Hook URLs are exact https hooks.zapier.com destinations', () => {
  assert.equal(validateZapierCatchHookUrl(` ${HOOK} `), HOOK)
  assert.equal(validateZapierCatchHookUrl(HOOK.slice(0, -1)), HOOK)
  assert.equal(maskZapierCatchHookUrl(HOOK), 'https://hooks.zapier.com/hooks/catch/12••••/••••/')
  assert.equal(maskZapierCatchHookUrl(HOOK).includes('abcdefgh'), false)
  for (const rejected of [
    'http://hooks.zapier.com/hooks/catch/123456/abcdefgh/',
    'https://user:pass@hooks.zapier.com/hooks/catch/123456/abcdefgh/',
    'https://hooks.zapier.com:443/hooks/catch/123456/abcdefgh/',
    'https://hooks.zapier.com.evil.example/hooks/catch/123456/abcdefgh/',
    'https://evil.example/hooks/catch/123456/abcdefgh/',
    'https://169.254.169.254/hooks/catch/123456/abcdefgh/',
    'https://hooks.zapier.com/hooks/catch/123456/abcdefgh/?next=https://evil.example',
    'https://hooks.zapier.com/hooks/catch/123456/abcdefgh/#frag',
    'https://hooks.zapier.com/hooks/standard/123456/abcdefgh/',
    'https://hooks.zapier.com/hooks/catch/123456/abcdefgh/extra/',
  ]) assert.throws(() => validateZapierCatchHookUrl(rejected), /INVALID_WEBHOOK/, rejected)
})

test('webhook ciphertext uses the existing CRM envelope and a stable vector', () => {
  assert.equal(isCrmCredentialEncryptionConfigured(KEY), true)
  const opened = decryptCrmCredentials(VECTOR, KEY) as { webhookUrl: string }
  assert.equal(opened.webhookUrl, HOOK)
  const envelope = encrypt(HOOK, randomBytes(32).toString('base64'))
  assert.equal(JSON.stringify(envelope).includes(HOOK), false)
  assert.throws(() => decryptCrmCredentials(envelope, KEY))
})

test('unauthorized callers cannot read or change a webhook', async () => {
  const { memory, run } = command({
    authorize: async () => ({ authorized: false, status: 403, message: 'Billing access manager permission required.' }),
  })
  const denied = await run({ method: 'POST', action: 'save', webhookUrl: HOOK })
  assert.equal(denied.status, 403)
  assert.deepEqual(memory.calls, [])
  const missingDealer = await command().run({ dealerId: 'not-a-dealer', method: 'GET' })
  assert.equal(missingDealer.status, 400)
})

test('save, replace, and confirmed remove keep only a masked value', async () => {
  const { memory, run } = command()
  const saved = await run({ method: 'POST', action: 'save', webhookUrl: ` ${HOOK} ` })
  assert.equal(saved.status, 200)
  const savedBody = JSON.stringify(saved.body)
  assert.equal(savedBody.includes('abcdefgh'), false)
  assert.equal(savedBody.includes('ciphertext'), false)
  assert.match(savedBody, /12••••/)
  assert.equal((saved.body.webhook as { status: string }).status, 'configured')
  const replaced = await run({ method: 'POST', action: 'save', webhookUrl: 'https://hooks.zapier.com/hooks/catch/654321/zyxwvuts/' })
  assert.equal(replaced.status, 200)
  assert.equal(replaced.body.notice, 'Door Builder webhook replaced.')
  assert.equal(JSON.stringify(replaced.body).includes('zyxwvuts'), false)
  assert.deepEqual(memory.read().audit.map((entry) => entry.action), ['replaced', 'saved'])
  const unconfirmed = await run({ method: 'POST', action: 'remove', confirm: false })
  assert.equal(unconfirmed.status, 400)
  assert.equal(memory.read().webhook?.maskedUrl?.includes('65'), true)
  const removed = await run({ method: 'POST', action: 'remove', confirm: true })
  assert.equal(removed.status, 200)
  assert.equal((removed.body.webhook as { status: string }).status, 'not_configured')
  assert.equal(memory.read().secret, null)
})

test('connection test posts a labeled payload and does not follow redirects', async () => {
  const { fetches, run } = command()
  await run({ method: 'POST', action: 'save', webhookUrl: HOOK })
  fetches.length = 0
  const tested = await run({ method: 'POST', action: 'test', confirm: true })
  assert.equal(tested.status, 200)
  assert.equal(fetches.length, 1)
  assert.equal(fetches[0].url, HOOK)
  assert.equal(fetches[0].init?.redirect, 'manual')
  const payload = JSON.parse(String(fetches[0].init?.body)) as Record<string, unknown>
  assert.equal(payload.test, true)
  assert.equal(payload.full_name, 'Trisha Sumiran')
  assert.equal(payload.email, 'Trisha.byu@gmail.com')
  assert.equal(payload.phone, '8083934057')
  assert.equal(payload.postal_code, '91762')
  assert.equal(payload.door_configuration, 'French Door')
  assert.equal(payload.main_door_glass, 'Clear Glass')
  assert.match(String(payload.notes), /^TEST LEAD — NOT A REAL CUSTOMER/)
  assert.equal(payload.working_with_dealer, 'yes')
  assert.equal(payload.working_dealer_name, "America's Best Windows and Doors")
  assert.match(String(payload.notes), /Working with a dealer: Yes — Dealer: America's Best Windows and Doors/)
  assert.match(String(payload.test_submission_id), /^test-/)
  assert.equal(payload.dealer_slug, 'americas-best-windows-and-doors')
  assert.equal(payload.lead_source, 'AB')
  assert.match(String(payload.notes), /TEST LEAD — NOT A REAL CUSTOMER/)
  assert.match(String((tested.body.test as { message: string }).message), /does not mean the rest of the Zap succeeded/)
  assert.equal(JSON.stringify(tested.body).includes('abcdefgh'), false)

  let redirectCalls = 0
  const redirecting = command({
    fetchImpl: async (url) => {
      redirectCalls += 1
      assert.equal(String(url), HOOK)
      return new Response(null, { status: 302, headers: { Location: 'https://evil.example/collect' } })
    },
  })
  await redirecting.run({ method: 'POST', action: 'save', webhookUrl: HOOK })
  const redirected = await redirecting.run({ method: 'POST', action: 'test', confirm: true })
  assert.equal(redirectCalls, 1)
  assert.equal((redirected.body.test as { accepted: boolean }).accepted, false)
  assert.match(String((redirected.body.test as { message: string }).message), /not followed/)
})

test('lead source tags stay on the existing dealer map', () => {
  assert.equal(doorBuilderLeadSource('americas-best-windows-and-doors'), 'AB')
  assert.equal(doorBuilderLeadSource('wdm'), 'WDM')
  assert.equal(doorBuilderLeadSource('diligent'), 'diligent-door-builder-lead')
  const payload = doorBuilderWebhookTestPayload({ slug: 'diligent', companyName: 'Diligent' }, '2026-11-20T00:00:00.000Z')
  assert.equal(payload.test, true)
  assert.equal(payload.email, '')
  assert.equal(payload.dealer_name, 'Diligent')
})

test('management stays on the access-manager API and out of public dealer responses', () => {
  const endpoint = readFileSync('api/dealer-door-builder-webhook.ts', 'utf8')
  const component = readFileSync('src/components/DoorBuilderLeadWebhook.tsx', 'utf8')
  const crm = readFileSync('src/components/DealerCrmIntegrations.tsx', 'utf8')
  const dealerPage = readFileSync('src/pages/DealerDetailPage.tsx', 'utf8')
  const store = readFileSync('api/_lib/doorBuilderWebhookStore.ts', 'utf8')
  const migration = readFileSync('supabase/migrations/20261120190000_add_dealer_door_builder_webhooks.sql', 'utf8')
  assert.match(endpoint, /authorizeDoorBuilderWebhookManager/)
  assert.doesNotMatch(endpoint, /authorizeBillingAccessManager|CRM_CREDENTIAL_ENCRYPTION_KEY/)
  assert.match(endpoint, /DOOR_BUILDER_WEBHOOK_ENCRYPTION_KEY/)
  assert.match(endpoint, /expectedProjectRef|EXPECTED_PROJECT_REF/)
  assert.match(endpoint, /udbcnpjtwhmjzpjjhoph/)
  assert.doesNotMatch(endpoint, /webhook_ciphertext|console\./)
  assert.match(component, /Save Webhook/)
  assert.match(component, /Test Connection/)
  assert.match(component, /Remove Webhook/)
  assert.match(component, /Google Sheets/)
  assert.match(component, /Configured/)
  assert.match(component, /Not Configured/)
  assert.doesNotMatch(component, /CRM_CREDENTIAL_ENCRYPTION_KEY|webhook_ciphertext|credentials_auth_tag/)
  assert.doesNotMatch(crm, /<DoorBuilderLeadWebhook/)
  assert.match(dealerPage, /canManageDealerCredentials \? \([\s\S]*<DealerCrmIntegrations/)
  assert.match(store, /PUBLIC_COLUMNS = 'id,dealer_id,masked_url/)
  assert.doesNotMatch(store, /PUBLIC_COLUMNS = '[^']*webhook_ciphertext/)
  assert.match(migration, /Do not use supabase db push/)
  assert.match(migration, /drop table if exists public.dealer_door_builder_webhooks/)
  assert.match(migration, /webhook_ciphertext text not null/)
  assert.match(migration, /grant select \(/)
  assert.doesNotMatch(migration, /grant select \([^)]*webhook_ciphertext/s)
  assert.match(migration, /can_manage_door_builder_webhooks\(\)/)
  assert.doesNotMatch(migration, /is_billing_access_manager\(\)/)
  assert.match(migration, /door_builder_integration_managers/)
  assert.match(migration, /claim_door_builder_webhook_retry/)
  assert.match(component, /Send Sample Lead/)
  assert.match(component, /TEST LEAD/)
  assert.match(dealerPage, /<DoorBuilderLeadWebhook/)
  assert.match(migration, /unique \(dealer_id, submission_id, attempt_number\)/)
  assert.match(migration, /delivery_status = 'succeeded'/)
})
