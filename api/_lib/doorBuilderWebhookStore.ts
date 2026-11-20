import { DoorBuilderWebhookStorageUnavailable, type DoorBuilderWebhookStore, type StoredWebhookRecord, type WebhookAuditRecord, type WebhookEnvelope } from './doorBuilderWebhookPolicy.js'

type StorageError = { code?: string; message?: string } | null
type StorageResult<T> = { data: T; error: StorageError }

type Filter = PromiseLike<StorageResult<Record<string, unknown>[]>> & {
  eq(column: string, value: string): Filter
  order(column: string, options: { ascending: boolean }): Filter
  limit(count: number): Filter
  select(columns: string): Filter
  maybeSingle(): Promise<StorageResult<Record<string, unknown> | null>>
  single(): Promise<StorageResult<Record<string, unknown>>>
}

export type WebhookAdminClient = {
  rpc(fn: string, args: Record<string, unknown>): Promise<StorageResult<Record<string, unknown> | null>>
  from(table: string): {
    select(columns: string): Filter
    insert(values: Record<string, unknown>): Filter
    update(values: Record<string, unknown>): Filter
    delete(): Filter
  }
}

const WEBHOOKS = 'dealer_door_builder_webhooks'
const AUDIT = 'dealer_door_builder_webhook_audit'
const PUBLIC_COLUMNS = 'id,dealer_id,masked_url,verified,updated_at,last_success_at,last_success_http_status,last_failure_at,last_failure_http_status,last_test_at,last_test_http_status'
const SECRET_COLUMNS = 'id,webhook_ciphertext,webhook_iv,webhook_auth_tag,credential_key_version,masked_url'
const AUDIT_COLUMNS = 'id,action,masked_url,http_status,test_submission_id,actor_user_id,created_at'
const FAILURE_COLUMNS = 'id,submission_id,attempt_number,http_status,error_code,attempted_at,webhook_id,destination_fingerprint,lease_expires_at,delivery_status'

function unwrap<T>(result: StorageResult<T>): T {
  if (result.error) {
    const message = result.error.message ?? ''
    if (result.error.code === 'PGRST205' || /schema cache/i.test(message)) throw new DoorBuilderWebhookStorageUnavailable()
    throw new Error('Door Builder webhook storage request failed.')
  }
  return result.data
}

function text(value: unknown) {
  return typeof value === 'string' ? value : null
}

function statusCode(value: unknown) {
  return typeof value === 'number' && value >= 100 && value <= 599 ? value : null
}

function webhookRecord(row: Record<string, unknown>): StoredWebhookRecord {
  return {
    id: String(row.id),
    dealerId: String(row.dealer_id),
    maskedUrl: String(row.masked_url),
    verified: row.verified === true,
    updatedAt: String(row.updated_at),
    lastSuccessAt: text(row.last_success_at),
    lastSuccessHttpStatus: statusCode(row.last_success_http_status),
    lastFailureAt: text(row.last_failure_at),
    lastFailureHttpStatus: statusCode(row.last_failure_http_status),
    lastTestAt: text(row.last_test_at),
    lastTestHttpStatus: statusCode(row.last_test_http_status),
  }
}

function auditRecord(row: Record<string, unknown>): WebhookAuditRecord {
  const action = row.action
  if (action !== 'saved' && action !== 'replaced' && action !== 'removed' && action !== 'tested') {
    throw new Error('Door Builder webhook storage request failed.')
  }
  return {
    id: String(row.id),
    action,
    maskedUrl: text(row.masked_url),
    httpStatus: statusCode(row.http_status),
    testSubmissionId: text(row.test_submission_id),
    actorUserId: text(row.actor_user_id),
    createdAt: String(row.created_at),
  }
}

export function createSupabaseDoorBuilderWebhookStore(admin: WebhookAdminClient): DoorBuilderWebhookStore {
  return {
    async findDealer(dealerId) {
      const result = unwrap(await admin.from('dealers').select('id,company_name,slug').eq('id', dealerId).maybeSingle())
      if (!result?.id || !result.company_name || !result.slug) return null
      return { id: String(result.id), companyName: String(result.company_name), slug: String(result.slug) }
    },
    async findWebhook(dealerId) {
      const result = unwrap(await admin.from(WEBHOOKS).select(PUBLIC_COLUMNS).eq('dealer_id', dealerId).maybeSingle())
      return result ? webhookRecord(result) : null
    },
    async readSecret(dealerId) {
      const result = unwrap(await admin.from(WEBHOOKS).select(SECRET_COLUMNS).eq('dealer_id', dealerId).maybeSingle())
      if (!result?.webhook_ciphertext || !result.webhook_iv || !result.webhook_auth_tag) return null
      const envelope: WebhookEnvelope = {
        ciphertext: String(result.webhook_ciphertext),
        iv: String(result.webhook_iv),
        authTag: String(result.webhook_auth_tag),
        keyVersion: Number(result.credential_key_version),
      }
      return { webhookId: String(result.id), envelope, maskedUrl: String(result.masked_url ?? '') }
    },
    async writeWebhook({ dealerId, actorUserId, envelope, maskedUrl }) {
      const existing = unwrap(await admin.from(WEBHOOKS).select('id').eq('dealer_id', dealerId).maybeSingle())
      const values = {
        masked_url: maskedUrl,
        webhook_ciphertext: envelope.ciphertext,
        webhook_iv: envelope.iv,
        webhook_auth_tag: envelope.authTag,
        credential_key_version: envelope.keyVersion,
        verified: false,
        updated_by: actorUserId,
        updated_at: new Date().toISOString(),
      }
      const webhookId = existing?.id
        ? String(unwrap(await admin.from(WEBHOOKS).update(values).eq('id', String(existing.id)).eq('dealer_id', dealerId).select('id').single()).id)
        : String(unwrap(await admin.from(WEBHOOKS).insert({ ...values, dealer_id: dealerId, created_by: actorUserId }).select('id').single()).id)
      unwrap(await admin.from(AUDIT).insert({
        webhook_id: webhookId,
        dealer_id: dealerId,
        actor_user_id: actorUserId,
        action: existing ? 'replaced' : 'saved',
        masked_url: maskedUrl,
      }))
      return existing ? 'replaced' : 'saved'
    },
    async removeWebhook({ dealerId, actorUserId, maskedUrl }) {
      const existing = unwrap(await admin.from(WEBHOOKS).select('id').eq('dealer_id', dealerId).maybeSingle())
      if (!existing?.id) return false
      unwrap(await admin.from(AUDIT).insert({
        webhook_id: existing.id,
        dealer_id: dealerId,
        actor_user_id: actorUserId,
        action: 'removed',
        masked_url: maskedUrl,
      }))
      unwrap(await admin.from(WEBHOOKS).delete().eq('id', String(existing.id)).eq('dealer_id', dealerId))
      return true
    },
    async recordTest({ dealerId, actorUserId, maskedUrl, httpStatus, accepted, testSubmissionId }) {
      const existing = unwrap(await admin.from(WEBHOOKS).select('id').eq('dealer_id', dealerId).maybeSingle())
      if (!existing?.id) throw new Error('Door Builder webhook storage request failed.')
      unwrap(await admin.from(WEBHOOKS).update({
        last_test_at: new Date().toISOString(),
        last_test_http_status: httpStatus,
        ...(accepted ? { verified: true } : {}),
      }).eq('id', String(existing.id)).eq('dealer_id', dealerId))
      unwrap(await admin.from(AUDIT).insert({
        webhook_id: existing.id,
        dealer_id: dealerId,
        actor_user_id: actorUserId,
        action: 'tested',
        masked_url: maskedUrl,
        http_status: httpStatus,
        test_submission_id: testSubmissionId,
      }))
    },
    async listFailures(dealerId) {
      const rows = unwrap(await admin.from('dealer_door_builder_webhook_deliveries').select(FAILURE_COLUMNS).eq('dealer_id', dealerId).order('attempt_number', { ascending: false }).limit(100))
      const latest = new Map<string, Record<string, unknown>>()
      for (const row of rows) {
        const submissionId = String(row.submission_id)
        if (!latest.has(submissionId)) latest.set(submissionId, row)
      }
      return [...latest.values()].filter((row) => row.delivery_status === 'failed').map((row) => ({
        id: String(row.id),
        submissionId: String(row.submission_id),
        attemptNumber: Number(row.attempt_number),
        httpStatus: statusCode(row.http_status),
        errorCode: text(row.error_code),
        attemptedAt: String(row.attempted_at),
        webhookId: text(row.webhook_id),
        destinationFingerprint: String(row.destination_fingerprint),
        leaseActive: false,
      }))
    },
    async claimRetry(dealerId, submissionId) {
      const result = unwrap(await admin.rpc('claim_door_builder_webhook_retry', { p_dealer_id: dealerId, p_submission_id: submissionId }))
      const row = result as unknown as Record<string, unknown>
      if (row.result === 'claimed' && row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)) {
        return {
          result: 'claimed' as const,
          attemptId: String(row.attemptId),
          webhookId: text(row.webhookId),
          destinationFingerprint: String(row.destinationFingerprint),
          payload: row.payload as Record<string, unknown>,
        }
      }
      const outcome = row.result
      if (outcome === 'already_succeeded' || outcome === 'in_progress' || outcome === 'not_failed') return { result: outcome }
      return { result: 'not_failed' as const }
    },
    async finishRetry({ attemptId, dealerId, status, httpStatus, errorCode }) {
      unwrap(await admin.from('dealer_door_builder_webhook_deliveries').update({
        delivery_status: status,
        http_status: httpStatus,
        error_code: errorCode,
        updated_at: new Date().toISOString(),
        lease_expires_at: null,
      }).eq('id', attemptId).eq('dealer_id', dealerId))
      if (status === 'succeeded') {
        unwrap(await admin.from(WEBHOOKS).update({ verified: true }).eq('dealer_id', dealerId))
      }
    },
    async listAudit(dealerId) {
      const rows = unwrap(await admin.from(AUDIT).select(AUDIT_COLUMNS).eq('dealer_id', dealerId).order('created_at', { ascending: false }).limit(25))
      return rows.map(auditRecord)
    },
  }
}
