import { decryptCrmCredentials, isCrmCredentialEncryptionConfigured, type EncryptedCredentialEnvelope } from './dealerCrmIntegration.ts'
import { marksDeliveryEnablement } from './crmIntegrationState.ts'
import type { CrmIntegrationState } from './dealerCrmIntegration.ts'
import type { DeliveryAttemptStatus } from './optaDeliveryPolicy.ts'

type StorageError = { code?: string; message?: string } | null
type StorageResult<T> = { data: T; error: StorageError }

type Filter = PromiseLike<StorageResult<Record<string, unknown>[]>> & {
  eq(column: string, value: string | number | boolean | null): Filter
  in(column: string, values: readonly string[]): Filter
  gt(column: string, value: string): Filter
  order(column: string, options: { ascending: boolean }): Filter
  limit(count: number): Filter
  select(columns: string): Filter
  maybeSingle(): Promise<StorageResult<Record<string, unknown> | null>>
  single(): Promise<StorageResult<Record<string, unknown>>>
}

export type CrmAdminClient = {
  from(table: string): {
    select(columns: string): Filter
    insert(values: Record<string, unknown>): Filter
    update(values: Record<string, unknown>): Filter
  }
}

export type OptaPortalLead = {
  id: string
  dealerId: string
  firstName: string
  lastName: string
  email: string
  phone: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  comments: string | null
  source: string | null
  doorConfiguration: Record<string, unknown> | null
  submissionId: string | null
  createdAt: string
}

export type OptaIntegrationRecord = {
  id: string
  dealerId: string
  state: CrmIntegrationState
  fieldMapping: Record<string, string>
  credentials: Record<string, unknown> | null
}

export type StoredDelivery = {
  id: string
  integrationId: string
  leadId: string
  dealerId: string
  status: DeliveryAttemptStatus
  attemptCount: number
  lastAttemptedAt: string | null
  updatedAt: string
}

export type OptaDeliveryStore = {
  findLead(input: { submissionId?: string; leadId?: string }): Promise<OptaPortalLead | null>
  findDealer(dealerId: string): Promise<{ id: string; slug: string } | null>
  findDealerBySlug(slug: string): Promise<{ id: string; slug: string } | null>
  findOptaIntegration(dealerId: string): Promise<OptaIntegrationRecord | null>
  latestStateEnabledAt(integrationId: string, state: 'test' | 'live'): Promise<string | null>
  insertDelivery(input: DeliveryInsert): Promise<{ inserted: true; id: string } | { inserted: false; reason: 'duplicate' }>
  listRetryCandidates(limit: number): Promise<StoredDelivery[]>
  claimRetry(input: { id: string; expectedUpdatedAt: string; attemptCount: number; now: string; fromStatus: string }): Promise<boolean>
  saveResult(input: DeliveryResultPatch): Promise<void>
  listLeadsCreatedAfter(dealerId: string, createdAfter: string, limit: number): Promise<OptaPortalLead[]>
  listDeliveryLeadIds(integrationId: string, leadIds: string[]): Promise<string[]>
}

export type DeliveryInsert = {
  integrationId: string
  leadId: string
  dealerId: string
  idempotencyKey: string
  status: DeliveryAttemptStatus
  attemptCount: number
  now: string
  mode: 'test' | 'live'
  httpStatus?: number | null
  errorCode?: string | null
  errorMessage?: string | null
  responseMetadata?: Record<string, unknown>
}

export type DeliveryResultPatch = {
  id: string
  status: DeliveryAttemptStatus
  now: string
  httpStatus: number | null
  errorCode: string | null
  errorMessage: string | null
  responseMetadata: Record<string, unknown>
}

const LEADS = 'leads'
const DEALERS = 'dealers'
const INTEGRATIONS = 'dealer_crm_integrations'
const DELIVERIES = 'dealer_crm_lead_deliveries'
const AUDIT = 'dealer_crm_integration_audit_log'
const LEAD_COLUMNS = 'id,dealer_id,first_name,last_name,email,phone,address,city,state,zip,comments,source,door_configuration,submission_id,created_at'
const INTEGRATION_COLUMNS = 'id,dealer_id,state,field_mapping,credentials_ciphertext,credentials_iv,credentials_auth_tag,credential_key_version'
const DELIVERY_COLUMNS = 'id,integration_id,lead_id,dealer_id,delivery_status,attempt_count,last_attempted_at,updated_at'
const RETRY_STATUSES = ['pending', 'failed', 'test_failed', 'attempting']

export function decodeByteaToBase64(value: unknown) {
  if (Buffer.isBuffer(value)) return value.toString('base64')
  if (typeof value !== 'string' || !value.trim()) return null
  const trimmed = value.trim()
  const hexBody = trimmed.replace(/^\\+x/i, '')
  if (/^\\+x/i.test(trimmed) && /^[0-9a-f]+$/i.test(hexBody) && hexBody.length % 2 === 0) {
    return Buffer.from(hexBody, 'hex').toString('base64')
  }
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed) && trimmed.length % 4 === 0) return trimmed
  return null
}

export function isUniqueViolation(error: StorageError) {
  if (!error) return false
  if (error.code === '23505') return true
  return /duplicate key|unique constraint/i.test(error.message ?? '')
}

function storageFailure(): never {
  throw new Error('CRM delivery storage request failed.')
}

function credentialFailure(): never {
  throw new Error('CRM credentials are unavailable.')
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null
}

function asRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function integrationState(value: unknown): CrmIntegrationState {
  if (value === 'test' || value === 'live' || value === 'disabled') return value
  return 'disabled'
}

function deliveryStatus(value: unknown): DeliveryAttemptStatus {
  if (
    value === 'pending' || value === 'attempting' || value === 'succeeded' || value === 'failed'
    || value === 'dead_letter' || value === 'test_succeeded' || value === 'test_failed'
  ) return value
  return 'failed'
}

function portalLead(row: Record<string, unknown> | null): OptaPortalLead | null {
  if (!row || typeof row.id !== 'string' || typeof row.dealer_id !== 'string' || typeof row.created_at !== 'string') return null
  if (typeof row.first_name !== 'string' || typeof row.last_name !== 'string' || typeof row.email !== 'string') return null
  return {
    id: row.id,
    dealerId: row.dealer_id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: text(row.phone),
    address: text(row.address),
    city: text(row.city),
    state: text(row.state),
    zip: text(row.zip),
    comments: text(row.comments),
    source: text(row.source),
    doorConfiguration: asRecord(row.door_configuration),
    submissionId: text(row.submission_id),
    createdAt: row.created_at,
  }
}

function storedDelivery(row: Record<string, unknown>): StoredDelivery | null {
  if (typeof row.id !== 'string' || typeof row.integration_id !== 'string' || typeof row.lead_id !== 'string') return null
  if (typeof row.dealer_id !== 'string' || typeof row.updated_at !== 'string') return null
  return {
    id: row.id,
    integrationId: row.integration_id,
    leadId: row.lead_id,
    dealerId: row.dealer_id,
    status: deliveryStatus(row.delivery_status),
    attemptCount: typeof row.attempt_count === 'number' && Number.isFinite(row.attempt_count) ? row.attempt_count : 0,
    lastAttemptedAt: text(row.last_attempted_at),
    updatedAt: row.updated_at,
  }
}

function readCredentials(row: Record<string, unknown>, encryptionKey: string | undefined) {
  if (!row.credentials_ciphertext && !row.credentials_iv && !row.credentials_auth_tag) return null
  if (!encryptionKey || !isCrmCredentialEncryptionConfigured(encryptionKey)) credentialFailure()
  const ciphertext = decodeByteaToBase64(row.credentials_ciphertext)
  const iv = decodeByteaToBase64(row.credentials_iv)
  const authTag = decodeByteaToBase64(row.credentials_auth_tag)
  if (!ciphertext || !iv || !authTag) credentialFailure()
  const envelope: EncryptedCredentialEnvelope = {
    ciphertext,
    iv,
    authTag,
    keyVersion: typeof row.credential_key_version === 'number' ? row.credential_key_version : 1,
  }
  try {
    return decryptCrmCredentials(envelope, encryptionKey as string)
  } catch {
    credentialFailure()
  }
}

function fieldMapping(value: unknown) {
  const record = asRecord(value)
  if (!record) return {}
  const mapping: Record<string, string> = {}
  for (const [key, source] of Object.entries(record)) {
    if (typeof source === 'string') mapping[key] = source
  }
  return mapping
}

function metadata(value: Record<string, unknown> | undefined) {
  if (!value) return { disposition: 'claimed' }
  const safe: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean' || entry === null) safe[key] = entry
  }
  return safe
}

export function createSupabaseOptaDeliveryStore(admin: CrmAdminClient, encryptionKey: string | undefined): OptaDeliveryStore {
  return {
    async findLead(input) {
      if (input.submissionId) {
        const result = await admin.from(LEADS).select(LEAD_COLUMNS).eq('submission_id', input.submissionId).maybeSingle()
        if (result.error) storageFailure()
        return portalLead(result.data)
      }
      if (!input.leadId) return null
      const result = await admin.from(LEADS).select(LEAD_COLUMNS).eq('id', input.leadId).maybeSingle()
      if (result.error) storageFailure()
      return portalLead(result.data)
    },
    async findDealer(dealerId) {
      const result = await admin.from(DEALERS).select('id,slug').eq('id', dealerId).maybeSingle()
      if (result.error) storageFailure()
      if (!result.data?.id || typeof result.data.slug !== 'string') return null
      return { id: String(result.data.id), slug: result.data.slug }
    },
    async findDealerBySlug(slug) {
      const result = await admin.from(DEALERS).select('id,slug').eq('slug', slug).maybeSingle()
      if (result.error) storageFailure()
      if (!result.data?.id || typeof result.data.slug !== 'string') return null
      return { id: String(result.data.id), slug: result.data.slug }
    },
    async findOptaIntegration(dealerId) {
      const result = await admin.from(INTEGRATIONS).select(INTEGRATION_COLUMNS).eq('dealer_id', dealerId).eq('provider', 'opta').maybeSingle()
      if (result.error) storageFailure()
      if (!result.data?.id || typeof result.data.dealer_id !== 'string') return null
      return {
        id: String(result.data.id),
        dealerId: result.data.dealer_id,
        state: integrationState(result.data.state),
        fieldMapping: fieldMapping(result.data.field_mapping),
        credentials: readCredentials(result.data, encryptionKey),
      }
    },
    async latestStateEnabledAt(integrationId, state) {
      const result = await admin.from(AUDIT)
        .select('action,next_state,created_at')
        .eq('integration_id', integrationId)
        .eq('next_state', state)
        .in('action', ['created', 'state_changed'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (result.error) storageFailure()
      if (!result.data || !marksDeliveryEnablement(String(result.data.action ?? ''))) return null
      return text(result.data.created_at)
    },
    async insertDelivery(input) {
      const result = await admin.from(DELIVERIES).insert({
        integration_id: input.integrationId,
        lead_id: input.leadId,
        dealer_id: input.dealerId,
        provider: 'opta',
        delivery_status: input.status,
        idempotency_key: input.idempotencyKey,
        attempt_count: input.attemptCount,
        last_attempted_at: input.now,
        updated_at: input.now,
        http_status: input.httpStatus ?? null,
        error_code: input.errorCode ?? null,
        error_message: input.errorMessage ?? null,
        response_metadata: metadata({ mode: input.mode, ...(input.responseMetadata ?? {}) }),
      }).select('id').single()
      if (isUniqueViolation(result.error)) return { inserted: false, reason: 'duplicate' }
      if (result.error || typeof result.data?.id !== 'string') storageFailure()
      return { inserted: true, id: String(result.data.id) }
    },
    async listRetryCandidates(limit) {
      const result = await admin.from(DELIVERIES)
        .select(DELIVERY_COLUMNS)
        .eq('provider', 'opta')
        .in('delivery_status', RETRY_STATUSES)
        .order('updated_at', { ascending: true })
        .limit(limit)
      if (result.error || !Array.isArray(result.data)) storageFailure()
      return result.data.map(storedDelivery).filter((row): row is StoredDelivery => row !== null)
    },
    async claimRetry(input) {
      const result = await admin.from(DELIVERIES).update({
        delivery_status: 'attempting',
        attempt_count: input.attemptCount,
        last_attempted_at: input.now,
        updated_at: input.now,
      }).eq('id', input.id).eq('updated_at', input.expectedUpdatedAt).eq('delivery_status', input.fromStatus).select('id')
      if (result.error || !Array.isArray(result.data)) storageFailure()
      return result.data.length === 1
    },
    async saveResult(input) {
      const result = await admin.from(DELIVERIES).update({
        delivery_status: input.status,
        updated_at: input.now,
        http_status: input.httpStatus,
        error_code: input.errorCode,
        error_message: input.errorMessage,
        response_metadata: metadata(input.responseMetadata),
      }).eq('id', input.id).select('id')
      if (result.error || !Array.isArray(result.data) || result.data.length !== 1) storageFailure()
    },
    async listLeadsCreatedAfter(dealerId, createdAfter, limit) {
      const result = await admin.from(LEADS)
        .select(LEAD_COLUMNS)
        .eq('dealer_id', dealerId)
        .gt('created_at', createdAfter)
        .order('created_at', { ascending: true })
        .limit(limit)
      if (result.error || !Array.isArray(result.data)) storageFailure()
      return result.data.map(portalLead).filter((lead): lead is OptaPortalLead => lead !== null)
    },
    async listDeliveryLeadIds(integrationId, leadIds) {
      if (leadIds.length === 0) return []
      const result = await admin.from(DELIVERIES).select('lead_id').eq('integration_id', integrationId).in('lead_id', leadIds)
      if (result.error || !Array.isArray(result.data)) storageFailure()
      return result.data.map((row) => text(row.lead_id)).filter((id): id is string => Boolean(id))
    },
  }
}
