import { dealerAllowsOptaDelivery } from './crmIntegrationState.ts'
import type { CrmIntegrationState } from './dealerCrmIntegration.ts'
import type { OptaDeliveryMode, OptaDeliveryResult } from './optaLeadDelivery.ts'

/** Waits before retry 2, 3, 4, 5, and 6. The sixth transient failure is dead-lettered. */
export const OPTA_RETRY_DELAYS_MS = [
  60_000,
  5 * 60_000,
  30 * 60_000,
  2 * 60 * 60_000,
  6 * 60 * 60_000,
] as const

export const OPTA_MAX_ATTEMPTS = OPTA_RETRY_DELAYS_MS.length + 1
export const OPTA_ATTEMPT_STALE_MS = 2 * 60_000

export type OptaGateReason =
  | 'integration_disabled'
  | 'live_delivery_disabled'
  | 'dealer_not_eligible'
  | 'dealer_mismatch'
  | 'lead_before_live_enable'
  | 'live_enable_time_unknown'
  | 'credentials_unavailable'

export type OptaGateDecision =
  | { send: false; reason: OptaGateReason }
  | { send: true; mode: OptaDeliveryMode }

export function decideOptaDelivery(input: {
  envLiveEnabled: boolean
  integrationState: CrmIntegrationState | null
  dealerSlug: string | null | undefined
  leadDealerId: string | null | undefined
  integrationDealerId: string | null | undefined
  leadCreatedAt: string | null | undefined
  liveEnabledAt: string | null
}): OptaGateDecision {
  if (!dealerAllowsOptaDelivery(input.dealerSlug)) {
    return { send: false, reason: 'dealer_not_eligible' }
  }
  if (!input.integrationState) return { send: false, reason: 'integration_disabled' }
  if (!input.leadDealerId || !input.integrationDealerId || input.leadDealerId !== input.integrationDealerId) {
    return { send: false, reason: 'dealer_mismatch' }
  }
  if (input.integrationState === 'disabled') return { send: false, reason: 'integration_disabled' }
  if (input.integrationState === 'test') return { send: true, mode: 'test' }
  if (!input.envLiveEnabled) return { send: false, reason: 'live_delivery_disabled' }
  if (!input.liveEnabledAt) return { send: false, reason: 'live_enable_time_unknown' }
  const created = Date.parse(input.leadCreatedAt ?? '')
  const enabled = Date.parse(input.liveEnabledAt)
  if (!Number.isFinite(created) || !Number.isFinite(enabled) || created <= enabled) {
    return { send: false, reason: 'lead_before_live_enable' }
  }
  return { send: true, mode: 'live' }
}

export function liveDeliveryEnabled(env: Record<string, string | undefined>) {
  return env.OPTA_LIVE_DELIVERY_ENABLED === 'true'
}

export type DeliveryAttemptStatus =
  | 'pending'
  | 'attempting'
  | 'succeeded'
  | 'failed'
  | 'dead_letter'
  | 'test_succeeded'
  | 'test_failed'

export type RetryDecision = 'send' | 'wait' | 'dead' | 'ignore'

export function retryDecision(row: {
  status: string
  attemptCount: number
  lastAttemptedAt: string | null
  updatedAt: string
}, nowMs: number): RetryDecision {
  if (row.status === 'succeeded' || row.status === 'test_succeeded' || row.status === 'dead_letter') return 'ignore'
  if (row.attemptCount >= OPTA_MAX_ATTEMPTS) {
    if (row.status === 'attempting') {
      const updated = Date.parse(row.updatedAt)
      if (Number.isFinite(updated) && nowMs - updated < OPTA_ATTEMPT_STALE_MS) return 'ignore'
    }
    return 'dead'
  }
  if (row.status === 'attempting') {
    const updated = Date.parse(row.updatedAt)
    if (!Number.isFinite(updated) || nowMs - updated >= OPTA_ATTEMPT_STALE_MS) return 'send'
    return 'ignore'
  }
  if (row.status !== 'pending' && row.status !== 'failed' && row.status !== 'test_failed') return 'ignore'
  if (row.status === 'pending' || row.attemptCount <= 0) return 'send'
  const delay = OPTA_RETRY_DELAYS_MS[row.attemptCount - 1]
  if (delay == null) return 'dead'
  const last = Date.parse(row.lastAttemptedAt ?? row.updatedAt)
  if (!Number.isFinite(last)) return 'send'
  return nowMs >= last + delay ? 'send' : 'wait'
}

const TRANSIENT_DISPOSITIONS = new Set(['network_failure', 'unexpected_response'])

export function optaFailureIsTransient(result: OptaDeliveryResult) {
  return !result.ok && TRANSIENT_DISPOSITIONS.has(result.disposition)
}

export function deliveryErrorCode(result: OptaDeliveryResult) {
  if (result.ok) return null
  switch (result.disposition) {
    case 'rejected': return 'REJECTED'
    case 'unauthorized': return 'UNAUTHORIZED'
    case 'missing_field': return 'MISSING_FIELD'
    case 'invalid_field': return 'INVALID_FIELD'
    case 'network_failure': return 'NETWORK_FAILURE'
    case 'ineligible': return 'INELIGIBLE'
    case 'unexpected_response':
      if (result.httpStatus === 429) return 'RATE_LIMITED'
      if (result.httpStatus >= 500) return 'SERVER_ERROR'
      return 'UNEXPECTED_RESPONSE'
    default: return 'UNEXPECTED_RESPONSE'
  }
}

export function settleOptaAttempt(input: {
  mode: OptaDeliveryMode
  attemptCount: number
  result: OptaDeliveryResult
  secrets: readonly string[]
}): {
  status: DeliveryAttemptStatus
  httpStatus: number | null
  errorCode: string | null
  errorMessage: string | null
  responseMetadata: Record<string, string | number | boolean | null>
} {
  const transient = optaFailureIsTransient(input.result)
  const exhausted = !input.result.ok && transient && input.attemptCount >= OPTA_MAX_ATTEMPTS
  const status: DeliveryAttemptStatus = input.result.ok
    ? (input.mode === 'live' ? 'succeeded' : 'test_succeeded')
    : transient && !exhausted
      ? (input.mode === 'live' ? 'failed' : 'test_failed')
      : 'dead_letter'
  return {
    status,
    httpStatus: 'httpStatus' in input.result ? input.result.httpStatus : null,
    errorCode: input.result.ok ? null : (exhausted ? 'ATTEMPTS_EXHAUSTED' : deliveryErrorCode(input.result)),
    errorMessage: safeFailureMessage(input.result, input.secrets),
    responseMetadata: {
      mode: input.mode,
      disposition: input.result.disposition,
      leadStatus: 'leadStatus' in input.result ? input.result.leadStatus : null,
      testLead: 'testLead' in input.result ? input.result.testLead : null,
      httpStatus: 'httpStatus' in input.result ? input.result.httpStatus : null,
    },
  }
}

export function credentialSecretValues(credentials: Record<string, unknown> | null | undefined) {
  if (!credentials) return []
  return Object.values(credentials).filter((value): value is string => typeof value === 'string')
}

export function redactSensitiveText(value: string, secrets: readonly string[]) {
  const needles = secretNeedles(secrets)
  let output = value
  for (const needle of needles) output = output.split(needle).join('[redacted]')
  output = output.replace(/"(authenticationKey|companyId|sourceId|campaignId|privateIntegrationToken|authorizationHeader|ciphertext|authTag|iv)"\s*:\s*"[^"]*"/gi, '"$1":"[redacted]"')
  let cleaned = ''
  for (const character of output) {
    const code = character.charCodeAt(0)
    cleaned += code <= 31 || code === 127 ? ' ' : character
  }
  return cleaned.trim().slice(0, 1000)
}

export function redactCredentialPatterns(value: string) {
  return redactSensitiveText(value, [])
}

function safeFailureMessage(result: OptaDeliveryResult, secrets: readonly string[]) {
  if (result.ok) return null
  const parts: string[] = []
  if ('reason' in result && result.reason) parts.push(result.reason)
  if ('message' in result && result.message) parts.push(result.message)
  if ('missing' in result && result.missing.length > 0) parts.push(`Missing ${result.missing.join(', ')}`)
  if ('invalid' in result && result.invalid.length > 0) parts.push(`Invalid ${result.invalid.join(', ')}`)
  if (parts.length === 0) return null
  const text = redactSensitiveText(parts.join(' '), secrets)
  return text || null
}

function secretNeedles(secrets: readonly string[]) {
  const values = new Set<string>()
  for (const secret of secrets) {
    const trimmed = secret.trim()
    if (trimmed.length < 4) continue
    values.add(trimmed)
    const encoded = encodeURIComponent(trimmed)
    if (encoded !== trimmed && encoded.length >= 4) values.add(encoded)
  }
  return [...values].sort((left, right) => right.length - left.length)
}
