import { decryptCrmCredentials, isCrmCredentialEncryptionConfigured, leadDeliveryIdempotencyKey, type EncryptedCredentialEnvelope } from './dealerCrmIntegration.ts'
import {
  AMERICAS_BEST_DEALER_SLUG,
  DEFAULT_OPTA_UNCONFIRMED_POLICY,
  buildOptaTestLeadRequest,
  deliverOptaTestLead,
  syntheticAmericasBestOptaLead,
  type OptaDeliveryLead,
  type OptaDeliveryResult,
  type OptaTransport,
  type OptaUnconfirmedFieldPolicy,
} from './optaLeadDelivery.ts'

/** Collected Door Builder fields mapped to the Opta parameters confirmed for this campaign. */
export const DOOR_BUILDER_OPTA_FIELDS = {
  first: 'customer.first_name',
  last: 'customer.last_name',
  email: 'customer.email',
  phone: 'customer.phone',
  zip: 'customer.postal_code',
  notes: 'lead.notes',
  lead_id: 'lead.id',
  subid1: 'lead.source',
} as const

export const OPTA_AUTOMATIC_DELIVERY_ENABLED = false
export const OPTA_SYNTHETIC_TEST_CONFIRMATION = 'send-americas-best-synthetic-test'

const RETRYABLE_DELIVERY_STATUSES = new Set(['failed', 'test_failed'])
const BLOCKING_DELIVERY_STATUSES = new Set(['pending', 'attempting', 'succeeded', 'test_succeeded', 'dead_letter'])

export type OptaSafeLog = {
  event: 'opta_delivery'
  disposition: string
  httpStatus?: number
  leadStatus?: boolean | null
  testLead?: boolean | null
}

export type OptaDeliveryDraft = {
  integration_id: string
  lead_id: string
  dealer_id: string
  provider: 'opta'
  delivery_status: 'test_succeeded' | 'test_failed'
  idempotency_key: string
  http_status: number | null
  response_metadata: { disposition: string; leadStatus: boolean | null; testLead: boolean | null }
  error_code: string | null
  error_message: null
}

export function optaPolicyFromFieldMapping(mapping: Record<string, string> | null | undefined): OptaUnconfirmedFieldPolicy {
  const policy: OptaUnconfirmedFieldPolicy = { ...DEFAULT_OPTA_UNCONFIRMED_POLICY }
  if (mapping?.address === 'customer.address') policy.address = 'require_present'
  if (mapping?.city === 'customer.city') policy.city = 'require_present'
  if (mapping?.state === 'customer.state') policy.state = 'require_present'
  return policy
}

export function planOptaDuplicateDelivery(existing: { delivery_status: string } | null) {
  if (!existing) return { action: 'send' as const, retry: false }
  if (RETRYABLE_DELIVERY_STATUSES.has(existing.delivery_status)) return { action: 'send' as const, retry: true }
  if (BLOCKING_DELIVERY_STATUSES.has(existing.delivery_status)) return { action: 'skip_duplicate' as const, retry: false }
  return { action: 'skip_duplicate' as const, retry: false }
}

export function optaSafeLog(result: { disposition: string; httpStatus?: number; leadStatus?: boolean | null; testLead?: boolean | null }): OptaSafeLog {
  const event: OptaSafeLog = { event: 'opta_delivery', disposition: result.disposition }
  if ('httpStatus' in result && result.httpStatus !== undefined) event.httpStatus = result.httpStatus
  if ('leadStatus' in result) event.leadStatus = result.leadStatus
  if ('testLead' in result) event.testLead = result.testLead
  return event
}

export function optaDeliveryDraft(input: {
  integrationId: string
  leadId: string
  dealerId: string
  idempotencyKey: string
  result: OptaDeliveryResult
}): OptaDeliveryDraft {
  const errorCode = input.result.ok ? null
    : input.result.disposition === 'rejected' ? 'REJECTED'
    : input.result.disposition === 'unauthorized' ? 'UNAUTHORIZED'
    : input.result.disposition === 'missing_field' ? 'MISSING_FIELD'
    : input.result.disposition === 'invalid_field' ? 'INVALID_FIELD'
    : input.result.disposition === 'network_failure' ? 'NETWORK_FAILURE'
    : input.result.disposition === 'ineligible' ? 'INELIGIBLE'
    : 'UNEXPECTED_RESPONSE'
  return {
    integration_id: input.integrationId,
    lead_id: input.leadId,
    dealer_id: input.dealerId,
    provider: 'opta',
    delivery_status: input.result.ok ? 'test_succeeded' : 'test_failed',
    idempotency_key: input.idempotencyKey,
    http_status: 'httpStatus' in input.result ? input.result.httpStatus : null,
    response_metadata: {
      disposition: input.result.disposition,
      leadStatus: 'leadStatus' in input.result ? input.result.leadStatus : null,
      testLead: 'testLead' in input.result ? input.result.testLead : null,
    },
    error_code: errorCode,
    error_message: null,
  }
}

/**
 * The synthetic test id is not a customer row. dealer_crm_lead_deliveries.lead_id
 * has a composite foreign key to leads, so this draft must not be inserted unless
 * that lead already exists. No migration is added for synthetic rows.
 */
export function canPersistOptaDelivery(leadExists: boolean) {
  return leadExists
}

export async function runAuthorizedSyntheticOptaTest(input: {
  confirmation: string | undefined
  credentials: Record<string, unknown>
  transport: OptaTransport
  integrationId: string
  existingDelivery?: { delivery_status: string } | null
  policy?: OptaUnconfirmedFieldPolicy
  logger?: (event: OptaSafeLog) => void
}) {
  const lead = syntheticAmericasBestOptaLead()
  const idempotencyKey = leadDeliveryIdempotencyKey(input.integrationId, lead.id)
  if (input.confirmation !== OPTA_SYNTHETIC_TEST_CONFIRMATION) {
    const outcome = { ok: false as const, disposition: 'confirmation_required' as const, idempotencyKey, persisted: false as const }
    input.logger?.(optaSafeLog(outcome))
    return outcome
  }
  const plan = planOptaDuplicateDelivery(input.existingDelivery ?? null)
  if (plan.action === 'skip_duplicate') {
    const outcome = { ok: false as const, disposition: 'duplicate' as const, idempotencyKey, persisted: false as const }
    input.logger?.(optaSafeLog(outcome))
    return outcome
  }
  const result = await deliverOptaTestLead(lead, input.credentials, input.transport, 'test', input.policy ?? DEFAULT_OPTA_UNCONFIRMED_POLICY)
  input.logger?.(optaSafeLog(result))
  return { ...result, idempotencyKey, persisted: false as const }
}

export async function evaluateOptaDeliveryHook(gateEnabled: boolean, input: {
  integration: { id: string; state: 'disabled' | 'test' | 'live'; fieldMapping?: Record<string, string> }
  lead: OptaDeliveryLead
  credentials: Record<string, unknown>
  transport: OptaTransport
  existingDelivery?: { delivery_status: string } | null
  leadExists?: boolean
  store?: { save: (draft: OptaDeliveryDraft) => Promise<void> }
}) {
  if (!gateEnabled) return { ok: false as const, disposition: 'automatic_delivery_disabled' as const }
  if (input.integration.state === 'disabled') return { ok: false as const, disposition: 'ineligible' as const, reason: 'integration_disabled' as const }
  if (input.integration.state !== 'test') return { ok: false as const, disposition: 'ineligible' as const, reason: 'live_delivery_disabled' as const }
  if (input.lead.dealerSlug.trim() !== AMERICAS_BEST_DEALER_SLUG) {
    return { ok: false as const, disposition: 'ineligible' as const, reason: 'dealer_not_eligible' as const }
  }
  const idempotencyKey = leadDeliveryIdempotencyKey(input.integration.id, input.lead.id)
  if (planOptaDuplicateDelivery(input.existingDelivery ?? null).action === 'skip_duplicate') {
    return { ok: false as const, disposition: 'duplicate' as const, idempotencyKey }
  }
  const result = await deliverOptaTestLead(
    input.lead,
    input.credentials,
    input.transport,
    'test',
    optaPolicyFromFieldMapping(input.integration.fieldMapping),
  )
  if (input.store && canPersistOptaDelivery(input.leadExists === true) && input.lead.dealerId) {
    await input.store.save(optaDeliveryDraft({
      integrationId: input.integration.id,
      leadId: input.lead.id,
      dealerId: input.lead.dealerId,
      idempotencyKey,
      result,
    }))
  }
  return result
}

export function automaticOptaDelivery(input: Parameters<typeof evaluateOptaDeliveryHook>[1]) {
  return evaluateOptaDeliveryHook(OPTA_AUTOMATIC_DELIVERY_ENABLED, input)
}

export async function optaSyntheticTestCli(
  argv: string[],
  env: Record<string, string | undefined>,
  transport: OptaTransport,
  io?: { log?: (line: string) => void; error?: (line: string) => void; readFile?: (path: string) => Promise<string> },
) {
  const log = io?.log ?? console.log
  const error = io?.error ?? console.error
  if (argv.some((arg) => arg.includes('test=false') || arg === '--live')) {
    error('Refusing to send. Live delivery is disabled.')
    return { exitCode: 2, sent: false as const }
  }
  const send = argv.includes('--send')
  const confirmation = argv.find((arg) => arg.startsWith('--confirm='))?.slice('--confirm='.length)
  if (!send) {
    const prepared = buildOptaTestLeadRequest(syntheticAmericasBestOptaLead(), {
      companyId: '<companyId from secure storage>',
      sourceId: '<sourceId from secure storage>',
      campaignId: '<campaignId from secure storage>',
      authenticationKey: '<authenticationKey from secure storage>',
    }, 'test', DEFAULT_OPTA_UNCONFIRMED_POLICY)
    log(JSON.stringify(prepared, null, 2))
    log('Dry run only. No Opta request was sent.')
    return { exitCode: 0, sent: false as const }
  }
  if (confirmation !== OPTA_SYNTHETIC_TEST_CONFIRMATION || env.OPTA_SYNTHETIC_POST_ENABLED !== 'true') {
    error('Refusing to send. Synthetic Opta posts stay disabled until the confirmation flag and OPTA_SYNTHETIC_POST_ENABLED=true are both set.')
    return { exitCode: 2, sent: false as const }
  }
  const encryptionKey = env.CRM_CREDENTIAL_ENCRYPTION_KEY
  const envelopeFile = env.OPTA_CREDENTIAL_ENVELOPE_FILE
  if (!encryptionKey || !isCrmCredentialEncryptionConfigured(encryptionKey) || !envelopeFile || !io?.readFile) {
    error('Refusing to send. Encrypted Opta credentials are not available to this command.')
    return { exitCode: 2, sent: false as const }
  }
  let credentials: Record<string, unknown>
  try {
    const envelope = JSON.parse(await io.readFile(envelopeFile)) as EncryptedCredentialEnvelope
    credentials = decryptCrmCredentials(envelope, encryptionKey)
  } catch {
    error('Refusing to send. Encrypted Opta credentials could not be read.')
    return { exitCode: 2, sent: false as const }
  }
  const logs: OptaSafeLog[] = []
  await runAuthorizedSyntheticOptaTest({
    confirmation,
    credentials,
    transport,
    integrationId: env.OPTA_TEST_INTEGRATION_ID?.trim() || 'synthetic-integration',
    logger: (event) => {
      logs.push(event)
      log(JSON.stringify(event))
    },
  })
  return { exitCode: 0, sent: true as const, logs }
}
