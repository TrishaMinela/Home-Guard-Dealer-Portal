import { createHash } from 'node:crypto'
import { buildSampleZapierLead, DEFAULT_SAMPLE_CONTACT, SAMPLE_DOOR_FIELDS, SAMPLE_LEAD_NOTE, sampleContactFromInput } from './sampleDoorBuilderLead.ts'

// Door Builder Catch Hook rules. Tests load this module directly.

export const ZAPIER_CATCH_HOOK_HOST = 'hooks.zapier.com'
const CATCH_PATH = /^\/hooks\/catch\/(\d{1,12})\/([A-Za-z0-9]{6,80})\/?$/
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export type WebhookEnvelope = {
  ciphertext: string
  iv: string
  authTag: string
  keyVersion: number
}

export type StoredWebhookRecord = {
  id: string
  dealerId: string
  maskedUrl: string
  verified: boolean
  updatedAt: string
  lastSuccessAt: string | null
  lastSuccessHttpStatus: number | null
  lastFailureAt: string | null
  lastFailureHttpStatus: number | null
  lastTestAt: string | null
  lastTestHttpStatus: number | null
}

export type WebhookAuditRecord = {
  id: string
  action: 'saved' | 'replaced' | 'removed' | 'tested'
  maskedUrl: string | null
  httpStatus: number | null
  testSubmissionId: string | null
  actorUserId: string | null
  createdAt: string
}

export type FailedDeliveryRecord = {
  id: string
  submissionId: string
  attemptNumber: number
  httpStatus: number | null
  errorCode: string | null
  attemptedAt: string
  webhookId: string | null
  destinationFingerprint: string
  leaseActive: boolean
}

export type RetryClaim =
  | { result: 'claimed'; attemptId: string; webhookId: string | null; destinationFingerprint: string; payload: Record<string, unknown> }
  | { result: 'already_succeeded' | 'in_progress' | 'not_failed' }

export type DoorBuilderWebhookStore = {
  findDealer(dealerId: string): Promise<{ id: string; companyName: string; slug: string } | null>
  findWebhook(dealerId: string): Promise<StoredWebhookRecord | null>
  readSecret(dealerId: string): Promise<{ webhookId: string; envelope: WebhookEnvelope; maskedUrl: string } | null>
  writeWebhook(input: { dealerId: string; actorUserId: string; envelope: WebhookEnvelope; maskedUrl: string }): Promise<'saved' | 'replaced'>
  removeWebhook(input: { dealerId: string; actorUserId: string; maskedUrl: string }): Promise<boolean>
  recordTest(input: { dealerId: string; actorUserId: string; maskedUrl: string; httpStatus: number | null; accepted: boolean; testSubmissionId: string }): Promise<void>
  listAudit(dealerId: string): Promise<WebhookAuditRecord[]>
  listFailures(dealerId: string): Promise<FailedDeliveryRecord[]>
  claimRetry(dealerId: string, submissionId: string): Promise<RetryClaim>
  finishRetry(input: { attemptId: string; dealerId: string; status: 'succeeded' | 'failed'; httpStatus: number | null; errorCode: string | null }): Promise<void>
}

export class DoorBuilderWebhookStorageUnavailable extends Error {
  constructor() {
    super('Door Builder webhook storage is not available.')
  }
}

type Authorization =
  | { authorized: true; userId: string }
  | { authorized: false; status: number; message: string }

export type WebhookCommand = {
  method: string
  dealerId: string
  action?: string
  webhookUrl?: unknown
  contact?: unknown
  submissionId?: unknown
  confirm?: unknown
  authorization: string | undefined
  authorize: (authorization: string | undefined) => Promise<Authorization>
  store: DoorBuilderWebhookStore
  fetchImpl: typeof fetch
  encryptionConfigured: boolean
  encryptionKey: string | undefined
  encrypt: (webhookUrl: string, key: string) => WebhookEnvelope
  decrypt: (envelope: WebhookEnvelope, key: string) => string
  now?: () => Date
}

export function validateZapierCatchHookUrl(input: unknown): string {
  if (typeof input !== 'string') throw new Error('INVALID_WEBHOOK')
  const trimmed = input.trim()
  if (!trimmed || trimmed.length > 200 || /[%\s@\\]|#|\?/.test(trimmed) || /^https:\/\/[^/?#]*:\d+/i.test(trimmed)) throw new Error('INVALID_WEBHOOK')
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    throw new Error('INVALID_WEBHOOK')
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) throw new Error('INVALID_WEBHOOK')
  if (url.hostname !== ZAPIER_CATCH_HOOK_HOST) throw new Error('INVALID_WEBHOOK')
  if (url.search || url.hash) throw new Error('INVALID_WEBHOOK')
  const match = CATCH_PATH.exec(url.pathname)
  if (!match) throw new Error('INVALID_WEBHOOK')
  const canonicalPath = `/hooks/catch/${match[1]}/${match[2]}/`
  if (url.pathname !== canonicalPath && url.pathname !== canonicalPath.slice(0, -1)) throw new Error('INVALID_WEBHOOK')
  return `https://${ZAPIER_CATCH_HOOK_HOST}${canonicalPath}`
}

export function webhookDestinationFingerprint(webhookUrl: string) {
  return createHash('sha256').update(validateZapierCatchHookUrl(webhookUrl)).digest('hex')
}

export function maskZapierCatchHookUrl(webhookUrl: string): string {
  const normalized = validateZapierCatchHookUrl(webhookUrl)
  const match = CATCH_PATH.exec(new URL(normalized).pathname)
  if (!match) throw new Error('INVALID_WEBHOOK')
  const visible = match[1].slice(0, 2)
  return `https://${ZAPIER_CATCH_HOOK_HOST}/hooks/catch/${visible}••••/••••/`
}

export function doorBuilderLeadSource(slug: string): string {
  if (slug === 'americas-best-windows-and-doors') return 'AB'
  if (slug === 'wdm') return 'WDM'
  return `${slug}-door-builder-lead`
}

export function doorBuilderWebhookTestPayload(dealer: { slug: string; companyName: string }, submittedAt: string) {
  return {
    test: true,
    submitted_at: submittedAt,
    first_name: '',
    last_name: '',
    full_name: '',
    email: '',
    phone: '',
    postal_code: '',
    notes: 'Door Builder webhook connection test. This is not a customer lead.',
    door_configuration: '',
    door_line: '',
    door_style: '',
    sidelite_placement: '',
    sidelite_slab: '',
    sidelite_glass: '',
    main_door_glass: '',
    door_finish_type: '',
    door_finish_color: '',
    jamb_type: '',
    jamb_finish_type: '',
    jamb_finish_color: '',
    hardware: '',
    lock_setup: '',
    door_swing: '',
    hinge_option: '',
    lead_source: doorBuilderLeadSource(dealer.slug),
    dealer_name: dealer.companyName,
    dealer_slug: dealer.slug,
  }
}

export function testConnectionMessage(httpStatus: number | null, redirected: boolean) {
  if (redirected) return 'Zapier responded with a redirect. The redirect was not followed, so the test was not accepted.'
  if (httpStatus === null) return 'Zapier did not accept the test request. No HTTP status was returned.'
  if (httpStatus >= 200 && httpStatus < 300) {
    return `Zapier accepted the test request (HTTP ${httpStatus}). This does not mean the rest of the Zap succeeded.`
  }
  return `Zapier did not accept the test request (HTTP ${httpStatus}). No customer lead was sent.`
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function emptyWebhook() {
  return {
    status: 'not_configured' as const,
    maskedUrl: null,
    verified: false,
    updatedAt: null,
    lastSuccessAt: null,
    lastSuccessHttpStatus: null,
    lastFailureAt: null,
    lastFailureHttpStatus: null,
    lastTestAt: null,
    lastTestHttpStatus: null,
  }
}

function presentWebhook(record: StoredWebhookRecord) {
  return {
    status: 'configured' as const,
    maskedUrl: record.maskedUrl,
    verified: record.verified,
    updatedAt: record.updatedAt,
    lastSuccessAt: record.lastSuccessAt,
    lastSuccessHttpStatus: record.lastSuccessHttpStatus,
    lastFailureAt: record.lastFailureAt,
    lastFailureHttpStatus: record.lastFailureHttpStatus,
    lastTestAt: record.lastTestAt,
    lastTestHttpStatus: record.lastTestHttpStatus,
  }
}

async function publicFailures(store: DoorBuilderWebhookStore, dealerId: string, current: { webhookId: string; fingerprint: string } | null) {
  const rows = await store.listFailures(dealerId)
  return rows.map((row) => {
    const destinationMatches = Boolean(current && row.webhookId === current.webhookId && row.destinationFingerprint === current.fingerprint)
    const blockedReason = row.leaseActive
      ? 'A retry is already in progress.'
      : destinationMatches
        ? null
        : 'The webhook was changed or removed after this failure, so it was not sent to a different destination.'
    return {
      id: row.id,
      submissionId: row.submissionId,
      attemptNumber: row.attemptNumber,
      httpStatus: row.httpStatus,
      errorCode: row.errorCode,
      attemptedAt: row.attemptedAt,
      canRetry: !row.leaseActive && destinationMatches,
      blockedReason,
    }
  })
}

async function snapshot(store: DoorBuilderWebhookStore, dealer: { id: string; slug: string; companyName: string }, encryptionConfigured: boolean, current: { webhookId: string; fingerprint: string } | null, notice?: string, test?: { accepted: boolean; httpStatus: number | null; testedAt: string; message: string }) {
  const [webhook, audit, failures] = await Promise.all([
    store.findWebhook(dealer.id),
    store.listAudit(dealer.id),
    publicFailures(store, dealer.id, current),
  ])
  return {
    encryptionConfigured,
    webhook: webhook ? presentWebhook(webhook) : emptyWebhook(),
    sampleLead: buildSampleZapierLead({
      contact: { ...DEFAULT_SAMPLE_CONTACT, note: '' },
      dealer: { ...dealer, leadSource: doorBuilderLeadSource(dealer.slug) },
      submittedAt: 'Set when the test is sent',
      testSubmissionId: 'test-…',
    }),
    sampleDoor: SAMPLE_DOOR_FIELDS,
    sampleContact: DEFAULT_SAMPLE_CONTACT,
    sampleNote: SAMPLE_LEAD_NOTE,
    failures,
    audit: audit.map((entry) => ({
      id: entry.id,
      action: entry.action,
      maskedUrl: entry.maskedUrl,
      httpStatus: entry.httpStatus,
      testSubmissionId: entry.testSubmissionId,
      createdAt: entry.createdAt,
    })),
    ...(notice ? { notice } : {}),
    ...(test ? { test } : {}),
  }
}

function safeDealerIdentity(dealer: { slug: string; companyName: string }) {
  if (!SLUG_PATTERN.test(dealer.slug) || dealer.slug.length > 63) return null
  let companyName = ''
  for (const character of dealer.companyName) companyName += character.charCodeAt(0) >= 32 ? character : ' '
  companyName = companyName.trim().slice(0, 200)
  if (!companyName) return null
  return { slug: dealer.slug, companyName }
}

async function currentPin(
  store: DoorBuilderWebhookStore,
  dealerId: string,
  encryptionKey: string | undefined,
  decrypt: (envelope: WebhookEnvelope, key: string) => string,
) {
  if (!encryptionKey) return null
  const secret = await store.readSecret(dealerId)
  if (!secret) return null
  try {
    const url = validateZapierCatchHookUrl(decrypt(secret.envelope, encryptionKey))
    return { webhookId: secret.webhookId, fingerprint: webhookDestinationFingerprint(url), url }
  } catch {
    return null
  }
}

async function postCatchHook(destination: string, body: unknown, fetchImpl: typeof fetch) {
  let response: Response
  try {
    response = await fetchImpl(destination, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    })
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
    return { accepted: false, httpStatus: null as number | null, redirected: false, timedOut }
  }
  const redirected = (response.status >= 300 && response.status < 400) || response.type === 'opaqueredirect'
  await response.arrayBuffer().catch(() => undefined)
  const httpStatus = response.status || null
  return {
    accepted: !redirected && response.status >= 200 && response.status < 300,
    httpStatus,
    redirected,
    timedOut: false,
  }
}

export async function executeDoorBuilderWebhookRequest(input: WebhookCommand): Promise<{ status: number; body: Record<string, unknown> }> {
  if (input.method !== 'GET' && input.method !== 'POST') return { status: 405, body: { error: 'Method not allowed.' } }
  const access = await input.authorize(input.authorization)
  if (!access.authorized) return { status: access.status, body: { error: access.message } }
  if (!UUID_PATTERN.test(input.dealerId)) return { status: 400, body: { error: 'A valid dealer is required.' } }

  try {
    const dealer = await input.store.findDealer(input.dealerId)
    if (!dealer || dealer.id !== input.dealerId) return { status: 404, body: { error: 'Dealer not found.' } }

    let notice: string | undefined
    let test: { accepted: boolean; httpStatus: number | null; testedAt: string; message: string } | undefined
    const current = await currentPin(input.store, dealer.id, input.encryptionKey, input.decrypt)

    if (input.method === 'POST') {
      if (input.action === 'save') {
        if (!input.encryptionConfigured || !input.encryptionKey) {
          return { status: 503, body: { error: 'Secure webhook storage is not configured.' } }
        }
        let normalized: string
        try {
          normalized = validateZapierCatchHookUrl(input.webhookUrl)
        } catch {
          return { status: 400, body: { error: 'Enter a Zapier Catch Hook URL from hooks.zapier.com.' } }
        }
        const maskedUrl = maskZapierCatchHookUrl(normalized)
        let envelope: WebhookEnvelope
        try {
          envelope = input.encrypt(normalized, input.encryptionKey)
        } catch {
          return { status: 503, body: { error: 'Secure webhook storage is not configured.' } }
        }
        const outcome = await input.store.writeWebhook({
          dealerId: dealer.id,
          actorUserId: access.userId,
          envelope,
          maskedUrl,
        })
        notice = outcome === 'replaced' ? 'Door Builder webhook replaced.' : 'Door Builder webhook saved.'
      } else if (input.action === 'remove') {
        if (input.confirm !== true) return { status: 400, body: { error: 'Remove confirmation is required.' } }
        const current = await input.store.findWebhook(dealer.id)
        if (!current) return { status: 404, body: { error: 'No Door Builder webhook is saved for this dealer.' } }
        await input.store.removeWebhook({ dealerId: dealer.id, actorUserId: access.userId, maskedUrl: current.maskedUrl })
        notice = 'Door Builder webhook removed.'
      } else if (input.action === 'test') {
        if (input.confirm !== true) return { status: 400, body: { error: 'Confirm the sample lead before sending it.' } }
        if (!input.encryptionConfigured || !input.encryptionKey) {
          return { status: 503, body: { error: 'Secure webhook storage is not configured.' } }
        }
        const secret = await input.store.readSecret(dealer.id)
        if (!secret) return { status: 404, body: { error: 'Save a Door Builder webhook before testing the connection.' } }
        const identity = safeDealerIdentity(dealer)
        if (!identity) return { status: 500, body: { error: 'Door Builder webhook settings could not be tested.' } }
        let contact
        try { contact = sampleContactFromInput(input.contact) } catch (error) {
          return { status: 400, body: { error: error instanceof Error ? error.message : 'Review the sample contact and try again.' } }
        }
        let destination: string
        try { destination = validateZapierCatchHookUrl(input.decrypt(secret.envelope, input.encryptionKey)) } catch {
          return { status: 500, body: { error: 'The saved webhook could not be used. Save it again.' } }
        }
        const submittedAt = (input.now ?? (() => new Date()))().toISOString()
        const testSubmissionId = `test-${crypto.randomUUID()}`
        const payload = buildSampleZapierLead({
          contact,
          dealer: { ...identity, leadSource: doorBuilderLeadSource(identity.slug) },
          submittedAt,
          testSubmissionId,
        })
        const result = await postCatchHook(destination, payload, input.fetchImpl)
        await input.store.recordTest({
          dealerId: dealer.id,
          actorUserId: access.userId,
          maskedUrl: secret.maskedUrl,
          httpStatus: result.httpStatus,
          accepted: result.accepted,
          testSubmissionId,
        })
        const timedOut = result.timedOut
        test = {
          accepted: result.accepted,
          httpStatus: result.httpStatus,
          testedAt: submittedAt,
          message: timedOut
            ? 'The sample lead request timed out before Zapier returned a status. No Portal lead was saved.'
            : `${testConnectionMessage(result.httpStatus, result.redirected)} No Portal lead was saved, and the Home Guard master webhook was not called.`,
        }
      } else if (input.action === 'retry') {
        if (typeof input.submissionId !== 'string' || !UUID_PATTERN.test(input.submissionId)) {
          return { status: 400, body: { error: 'A failed delivery is required.' } }
        }
        const claim = await input.store.claimRetry(dealer.id, input.submissionId)
        if (claim.result === 'already_succeeded') return { status: 409, body: { error: 'This delivery already succeeded and was not sent again.' } }
        if (claim.result === 'in_progress') return { status: 409, body: { error: 'A retry is already in progress.' } }
        if (claim.result !== 'claimed') return { status: 404, body: { error: 'No failed delivery is available to retry.' } }
        const pinned = await currentPin(input.store, dealer.id, input.encryptionKey, input.decrypt)
        const sameDestination = Boolean(pinned && claim.webhookId && pinned.webhookId === claim.webhookId && pinned.fingerprint === claim.destinationFingerprint)
        if (!sameDestination || !pinned) {
          await input.store.finishRetry({ attemptId: claim.attemptId, dealerId: dealer.id, status: 'failed', httpStatus: null, errorCode: 'DESTINATION_CHANGED' })
          notice = 'The webhook was changed or removed after this failure, so the lead was not sent to a different destination.'
        } else {
          const destination = pinned.url
          if (destination && webhookDestinationFingerprint(destination) === claim.destinationFingerprint) {
            const result = await postCatchHook(destination, claim.payload, input.fetchImpl)
            await input.store.finishRetry({
              attemptId: claim.attemptId,
              dealerId: dealer.id,
              status: result.accepted ? 'succeeded' : 'failed',
              httpStatus: result.httpStatus,
              errorCode: result.accepted ? null : 'HTTP_FAILURE',
            })
            notice = result.accepted ? 'The failed delivery was sent again to the original webhook.' : 'The retry was not accepted by Zapier. The master lead was not changed.'
          } else if (destination) {
            await input.store.finishRetry({ attemptId: claim.attemptId, dealerId: dealer.id, status: 'failed', httpStatus: null, errorCode: 'DESTINATION_CHANGED' })
            notice = 'The webhook was changed after this failure, so the lead was not sent to the new destination.'
          }
        }
      } else {
        return { status: 400, body: { error: 'Choose a webhook action.' } }
      }
    }

    return { status: 200, body: await snapshot(input.store, dealer, input.encryptionConfigured, current, notice, test) }
  } catch (error) {
    if (error instanceof DoorBuilderWebhookStorageUnavailable) {
      return { status: 503, body: { error: 'Door Builder webhook storage is not available yet.' } }
    }
    return { status: 500, body: { error: 'Door Builder webhook settings could not be saved.' } }
  }
}
