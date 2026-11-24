import { dealerAllowsOptaDelivery } from './crmIntegrationState.js'
import { leadDeliveryIdempotencyKey } from './dealerCrmIntegration.js'
import { optaPolicyFromFieldMapping } from './optaDeliveryControl.js'
import {
  credentialSecretValues,
  decideOptaDelivery,
  liveDeliveryEnabled,
  OPTA_MAX_ATTEMPTS,
  redactSensitiveText,
  retryDecision,
  settleOptaAttempt,
} from './optaDeliveryPolicy.js'
import type { OptaDeliveryStore, OptaPortalLead, StoredDelivery } from './optaDeliveryStore.js'
import {
  AMERICAS_BEST_DEALER_SLUG,
  buildOptaLeadRequest,
  deliverOptaLead,
  type OptaDeliveryLead,
  type OptaDeliveryMode,
  type OptaTransport,
} from './optaLeadDelivery.js'

export type OptaWorkerDeps = {
  store: OptaDeliveryStore
  transport: OptaTransport
  env: Record<string, string | undefined>
  now?: () => Date
  logger?: (line: string) => void
}

export type OptaWorkerResponse = {
  httpStatus: number
  body: Record<string, string | boolean | number | null>
}

const DISCOVERY_LIMIT = 20
const RETRY_SCAN_LIMIT = 40

export async function deliverSubmittedLead(deps: OptaWorkerDeps, input: { submissionId?: string; leadId?: string }): Promise<OptaWorkerResponse> {
  const lead = await deps.store.findLead(input)
  if (!lead) return { httpStatus: 404, body: { ok: false, disposition: 'not_found' } }
  return deliverPortalLead(deps, lead)
}

export async function sweepOptaDeliveries(deps: OptaWorkerDeps) {
  const now = currentDate(deps)
  const report = { scanned: 0, claimed: 0, sent: 0, skipped: 0, deadLettered: 0, failed: 0 }
  const candidates = await deps.store.listRetryCandidates(RETRY_SCAN_LIMIT)
  report.scanned = candidates.length
  for (const row of candidates) {
    try {
      await retryExisting(deps, row, now, report)
    } catch {
      report.failed += 1
      logSafe(deps, { event: 'opta_delivery', disposition: 'error', code: 'RETRY_FAILED' }, [])
    }
  }
  try {
    await discoverUnsent(deps, report)
  } catch {
    report.failed += 1
    logSafe(deps, { event: 'opta_delivery', disposition: 'error', code: 'DISCOVERY_FAILED' }, [])
  }
  return report
}

async function deliverPortalLead(deps: OptaWorkerDeps, lead: OptaPortalLead): Promise<OptaWorkerResponse> {
  const dealer = await deps.store.findDealer(lead.dealerId)
  if (!dealer || !dealerAllowsOptaDelivery(dealer.slug)) {
    logSafe(deps, { event: 'opta_delivery', disposition: 'skipped', reason: 'dealer_not_eligible', mode: null }, [])
    return { httpStatus: 200, body: { ok: false, disposition: 'skipped', reason: 'dealer_not_eligible' } }
  }
  const loaded = await loadIntegration(deps, dealer.id)
  if (loaded.status === 'unreadable') return skippedCredentials()
  const integration = loaded.integration
  const liveEnabledAt = integration?.state === 'live'
    ? await deps.store.latestStateEnabledAt(integration.id, 'live')
    : null
  const decision = decideOptaDelivery({
    envLiveEnabled: liveDeliveryEnabled(deps.env),
    integrationState: integration?.state ?? null,
    dealerSlug: dealer?.slug,
    leadDealerId: lead.dealerId,
    integrationDealerId: integration?.dealerId,
    leadCreatedAt: lead.createdAt,
    liveEnabledAt,
  })
  if (decision.send === false) {
    logSafe(deps, { event: 'opta_delivery', disposition: 'skipped', reason: decision.reason, mode: null }, [])
    return { httpStatus: 200, body: { ok: false, disposition: 'skipped', reason: decision.reason } }
  }
  if (!integration?.credentials) {
    logSafe(deps, { event: 'opta_delivery', disposition: 'skipped', reason: 'credentials_unavailable', mode: decision.mode }, [])
    return { httpStatus: 200, body: { ok: false, disposition: 'skipped', reason: 'credentials_unavailable' } }
  }

  const secrets = secretList(deps, integration.credentials)
  const optaLead = toOptaLead(lead, dealer?.slug ?? '')
  const policy = optaPolicyFromFieldMapping(integration.fieldMapping)
  const prepared = buildOptaLeadRequest(optaLead, integration.credentials, decision.mode, policy)
  const now = currentDate(deps).toISOString()
  if (!('ready' in prepared)) {
    const settled = settleOptaAttempt({ mode: decision.mode, attemptCount: 1, result: prepared, secrets })
    const inserted = await deps.store.insertDelivery({
      integrationId: integration.id,
      leadId: lead.id,
      dealerId: lead.dealerId,
      idempotencyKey: leadDeliveryIdempotencyKey(integration.id, lead.id),
      status: 'dead_letter',
      attemptCount: 1,
      now,
      mode: decision.mode,
      httpStatus: settled.httpStatus,
      errorCode: settled.errorCode,
      errorMessage: settled.errorMessage,
      responseMetadata: settled.responseMetadata,
    })
    if (!inserted.inserted) return duplicateResponse()
    logSafe(deps, { event: 'opta_delivery', disposition: prepared.disposition, mode: decision.mode, deliveryStatus: 'dead_letter' }, secrets)
    return { httpStatus: 200, body: { ok: false, disposition: 'dead_letter', errorCode: settled.errorCode } }
  }

  const claimed = await deps.store.insertDelivery({
    integrationId: integration.id,
    leadId: lead.id,
    dealerId: lead.dealerId,
    idempotencyKey: leadDeliveryIdempotencyKey(integration.id, lead.id),
    status: 'attempting',
    attemptCount: 1,
    now,
    mode: decision.mode,
    responseMetadata: { mode: decision.mode, disposition: 'attempting' },
  })
  if (!claimed.inserted) return duplicateResponse()
  return finishAttempt(deps, {
    claimId: claimed.id,
    lead: optaLead,
    credentials: integration.credentials,
    mode: decision.mode,
    attemptCount: 1,
    secrets,
    policy,
  })
}

async function retryExisting(deps: OptaWorkerDeps, row: StoredDelivery, now: Date, report: { claimed: number; sent: number; skipped: number; deadLettered: number; failed: number }) {
  const decisionTime = retryDecision(row, now.getTime())
  if (decisionTime === 'ignore' || decisionTime === 'wait') {
    report.skipped += 1
    return
  }
  if (decisionTime === 'dead') {
    await deps.store.saveResult({
      id: row.id,
      status: 'dead_letter',
      now: now.toISOString(),
      httpStatus: null,
      errorCode: 'ATTEMPTS_EXHAUSTED',
      errorMessage: null,
      responseMetadata: { disposition: 'attempts_exhausted' },
    })
    report.deadLettered += 1
    return
  }

  const lead = await deps.store.findLead({ leadId: row.leadId })
  const dealer = lead ? await deps.store.findDealer(lead.dealerId) : null
  if (!lead || !dealer || !dealerAllowsOptaDelivery(dealer.slug)) {
    await deps.store.saveResult({
      id: row.id,
      status: 'dead_letter',
      now: now.toISOString(),
      httpStatus: null,
      errorCode: 'INELIGIBLE',
      errorMessage: null,
      responseMetadata: { disposition: 'ineligible', reason: lead ? 'dealer_not_eligible' : 'not_found' },
    })
    report.deadLettered += 1
    return
  }
  const loaded = await loadIntegration(deps, lead.dealerId)
  if (loaded.status === 'unreadable') {
    report.skipped += 1
    return
  }
  const integration = loaded.integration
  const liveEnabledAt = integration?.state === 'live'
    ? await deps.store.latestStateEnabledAt(integration.id, 'live')
    : null
  const gate = decideOptaDelivery({
    envLiveEnabled: liveDeliveryEnabled(deps.env),
    integrationState: integration?.state ?? null,
    dealerSlug: dealer?.slug,
    leadDealerId: lead?.dealerId,
    integrationDealerId: integration?.dealerId,
    leadCreatedAt: lead?.createdAt,
    liveEnabledAt,
  })
  if (!lead || gate.send === false) {
    const recoverable = gate.send === false && (gate.reason === 'integration_disabled' || gate.reason === 'live_delivery_disabled' || gate.reason === 'live_enable_time_unknown' || gate.reason === 'lead_before_live_enable')
    if (lead && recoverable) {
      report.skipped += 1
      return
    }
    await deps.store.saveResult({
      id: row.id,
      status: 'dead_letter',
      now: now.toISOString(),
      httpStatus: null,
      errorCode: 'INELIGIBLE',
      errorMessage: null,
      responseMetadata: { disposition: 'ineligible', reason: gate.send === false ? gate.reason : 'not_found' },
    })
    report.deadLettered += 1
    return
  }
  if (!integration?.credentials) {
    report.skipped += 1
    return
  }

  const nextAttempt = row.attemptCount + 1
  if (nextAttempt > OPTA_MAX_ATTEMPTS) {
    await deps.store.saveResult({
      id: row.id,
      status: 'dead_letter',
      now: now.toISOString(),
      httpStatus: null,
      errorCode: 'ATTEMPTS_EXHAUSTED',
      errorMessage: null,
      responseMetadata: { disposition: 'attempts_exhausted' },
    })
    report.deadLettered += 1
    return
  }
  const claimed = await deps.store.claimRetry({
    id: row.id,
    expectedUpdatedAt: row.updatedAt,
    attemptCount: nextAttempt,
    now: now.toISOString(),
    fromStatus: row.status,
  })
  if (!claimed) {
    report.skipped += 1
    return
  }
  report.claimed += 1
  const secrets = secretList(deps, integration.credentials)
  const response = await finishAttempt(deps, {
    claimId: row.id,
    lead: toOptaLead(lead, dealer?.slug ?? ''),
    credentials: integration.credentials,
    mode: gate.mode,
    attemptCount: nextAttempt,
    secrets,
    policy: optaPolicyFromFieldMapping(integration.fieldMapping),
  })
  if (response.body.ok === true) report.sent += 1
  else if (response.body.disposition === 'dead_letter') report.deadLettered += 1
  else report.failed += 1
}

async function discoverUnsent(deps: OptaWorkerDeps, report: { sent: number; skipped: number; deadLettered: number; failed: number }) {
  const dealer = await deps.store.findDealerBySlug(AMERICAS_BEST_DEALER_SLUG)
  if (!dealer || !dealerAllowsOptaDelivery(dealer.slug)) return
  const loaded = await loadIntegration(deps, dealer.id)
  if (loaded.status === 'unreadable') return
  const integration = loaded.integration
  if (!integration || integration.state === 'disabled') return
  if (integration.state === 'live' && !liveDeliveryEnabled(deps.env)) return
  const enabledAt = await deps.store.latestStateEnabledAt(integration.id, integration.state)
  if (!enabledAt) return
  const leads = await deps.store.listLeadsCreatedAfter(dealer.id, enabledAt, DISCOVERY_LIMIT, integration.id)
  const existing = new Set(await deps.store.listDeliveryLeadIds(integration.id, leads.map((lead) => lead.id)))
  for (const lead of leads) {
    if (existing.has(lead.id)) continue
    if (Date.parse(lead.createdAt) <= Date.parse(enabledAt)) {
      report.skipped += 1
      continue
    }
    const response = await deliverPortalLead(deps, lead)
    if (response.body.ok === true && response.body.skipped !== true) report.sent += 1
    else if (response.body.disposition === 'dead_letter') report.deadLettered += 1
    else report.skipped += 1
  }
}

async function finishAttempt(deps: OptaWorkerDeps, input: {
  claimId: string
  lead: OptaDeliveryLead
  credentials: Record<string, unknown>
  mode: OptaDeliveryMode
  attemptCount: number
  secrets: string[]
  policy: ReturnType<typeof optaPolicyFromFieldMapping>
}): Promise<OptaWorkerResponse> {
  const transport: OptaTransport = async (url, init) => {
    try {
      return await deps.transport(url, init)
    } catch (error) {
      const detail = redactSensitiveText(error instanceof Error ? error.message : 'network failure', input.secrets)
      logSafe(deps, { event: 'opta_delivery', disposition: 'network_failure', mode: input.mode, detail }, input.secrets)
      throw new Error(detail)
    }
  }
  let result: Awaited<ReturnType<typeof deliverOptaLead>>
  try {
    result = await deliverOptaLead(input.lead, input.credentials, transport, input.mode, input.policy)
  } catch (error) {
    const detail = redactSensitiveText(error instanceof Error ? error.message : 'network failure', input.secrets)
    logSafe(deps, { event: 'opta_delivery', disposition: 'network_failure', mode: input.mode, detail }, input.secrets)
    result = { ok: false, disposition: 'network_failure' }
  }
  const settled = settleOptaAttempt({
    mode: input.mode,
    attemptCount: input.attemptCount,
    result,
    secrets: input.secrets,
  })
  try {
    await deps.store.saveResult({
      id: input.claimId,
      status: settled.status,
      now: currentDate(deps).toISOString(),
      httpStatus: settled.httpStatus,
      errorCode: settled.errorCode,
      errorMessage: settled.errorMessage,
      responseMetadata: settled.responseMetadata,
    })
  } catch (error) {
    logSafe(deps, {
      event: 'opta_delivery',
      disposition: 'error',
      code: 'RESULT_NOT_RECORDED',
      detail: redactSensitiveText(error instanceof Error ? error.message : 'storage failure', input.secrets),
    }, input.secrets)
  }
  logSafe(deps, {
    event: 'opta_delivery',
    disposition: result.disposition,
    mode: input.mode,
    deliveryStatus: settled.status,
    httpStatus: settled.httpStatus,
    attempt: input.attemptCount,
  }, input.secrets)
  return {
    httpStatus: 200,
    body: {
      ok: result.ok,
      disposition: result.ok ? result.disposition : (settled.status === 'dead_letter' ? 'dead_letter' : result.disposition),
      deliveryStatus: settled.status,
      errorCode: settled.errorCode,
    },
  }
}

function toOptaLead(lead: OptaPortalLead, dealerSlug: string): OptaDeliveryLead {
  return {
    id: lead.id,
    dealerId: lead.dealerId,
    dealerSlug,
    firstName: lead.firstName,
    lastName: lead.lastName,
    email: lead.email,
    phone: lead.phone,
    address: lead.address,
    city: lead.city,
    state: lead.state,
    zip: lead.zip,
    source: lead.source ?? 'door_builder',
    doorConfiguration: lead.doorConfiguration,
    comments: lead.comments,
  }
}

function secretList(deps: OptaWorkerDeps, credentials: Record<string, unknown>) {
  return [...credentialSecretValues(credentials), deps.env.CRM_CREDENTIAL_ENCRYPTION_KEY ?? ''].filter((value) => value.length >= 4)
}

function currentDate(deps: OptaWorkerDeps) {
  return deps.now ? deps.now() : new Date()
}

function duplicateResponse(): OptaWorkerResponse {
  return { httpStatus: 200, body: { ok: true, skipped: true, disposition: 'duplicate' } }
}

async function loadIntegration(deps: OptaWorkerDeps, dealerId: string): Promise<
  | { status: 'ready'; integration: Awaited<ReturnType<OptaDeliveryStore['findOptaIntegration']>> }
  | { status: 'unreadable' }
> {
  try {
    return { status: 'ready', integration: await deps.store.findOptaIntegration(dealerId) }
  } catch (error) {
    if (isCredentialFailure(error)) return { status: 'unreadable' }
    throw error
  }
}

function skippedCredentials(): OptaWorkerResponse {
  return { httpStatus: 200, body: { ok: false, disposition: 'skipped', reason: 'credentials_unavailable' } }
}

function isCredentialFailure(error: unknown) {
  return error instanceof Error && error.message === 'CRM credentials are unavailable.'
}

function logSafe(deps: OptaWorkerDeps, event: Record<string, string | number | boolean | null>, secrets: readonly string[]) {
  const line = redactSensitiveText(JSON.stringify(event), secrets)
  if (deps.logger) deps.logger(line)
  else console.info(line)
}
