import { createClient } from '@supabase/supabase-js'
import {
  decryptCrmCredentials,
  isCrmCredentialEncryptionConfigured,
  validateCrmCredentials,
  type EncryptedCredentialEnvelope,
} from './dealerCrmIntegration.ts'
import { AMERICAS_BEST_DEALER_SLUG } from './optaLeadDelivery.ts'

export const HGI_PORTAL_DEV_PROJECT_REF = 'udbcnpjtwhmjzpjjhoph'

const OPTA_FIELDS = ['companyId', 'sourceId', 'campaignId', 'authenticationKey'] as const

export type SavedOptaCredentialRow = {
  id?: string
  state: string | null
  credential_key_version: number | null
  credentials_ciphertext: unknown
  credentials_iv: unknown
  credentials_auth_tag: unknown
}

export type OptaCredentialReport = {
  mode: 'verify-credentials'
  dealerSlug: typeof AMERICAS_BEST_DEALER_SLUG
  provider: 'opta'
  rowFound: boolean
  state: string | null
  credentialsPresent: boolean
  decrypted: boolean
  fields: Record<(typeof OPTA_FIELDS)[number], boolean>
  keyVersion: number | null
  optaRequestSent: false
  reason?: 'encryption_key_missing' | 'supabase_not_configured' | 'wrong_supabase_project' | 'credentials_unreadable' | 'credentials_missing' | 'credentials_invalid'
}

export function emptyCredentialReport(reason?: OptaCredentialReport['reason']): OptaCredentialReport {
  return {
    mode: 'verify-credentials',
    dealerSlug: AMERICAS_BEST_DEALER_SLUG,
    provider: 'opta',
    rowFound: false,
    state: null,
    credentialsPresent: false,
    decrypted: false,
    fields: { companyId: false, sourceId: false, campaignId: false, authenticationKey: false },
    keyVersion: null,
    optaRequestSent: false,
    ...(reason ? { reason } : {}),
  }
}

export function credentialByteaToBase64(value: unknown) {
  if (value == null) return null
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return Buffer.from(value).toString('base64')
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^\\+x[0-9a-f]+$/i.test(trimmed)) return Buffer.from(trimmed.replace(/^\\+x/i, ''), 'hex').toString('base64')
  return /^[A-Za-z0-9+/]+={0,2}$/.test(trimmed) ? trimmed : null
}

export function inspectSavedOptaCredentials(row: SavedOptaCredentialRow | null, encryptionKey: string | undefined): { report: OptaCredentialReport; credentials: Record<string, unknown> | null } {
  if (!row) return { report: emptyCredentialReport('credentials_missing'), credentials: null }
  const report = emptyCredentialReport()
  report.rowFound = true
  report.state = row.state
  report.keyVersion = row.credential_key_version
  const ciphertext = credentialByteaToBase64(row.credentials_ciphertext)
  const iv = credentialByteaToBase64(row.credentials_iv)
  const authTag = credentialByteaToBase64(row.credentials_auth_tag)
  report.credentialsPresent = Boolean(ciphertext && iv && authTag)
  if (!report.credentialsPresent) return { report: { ...report, reason: 'credentials_missing' }, credentials: null }
  if (!isCrmCredentialEncryptionConfigured(encryptionKey)) return { report: { ...report, reason: 'encryption_key_missing' }, credentials: null }
  try {
    const credentials = decryptCrmCredentials({ ciphertext, iv, authTag, keyVersion: row.credential_key_version ?? 1 } as EncryptedCredentialEnvelope, encryptionKey as string)
    const valid = validateCrmCredentials('opta', credentials)
    for (const field of OPTA_FIELDS) report.fields[field] = valid[field].length > 0
    report.decrypted = OPTA_FIELDS.every((field) => report.fields[field])
    if (!report.decrypted) report.reason = 'credentials_invalid'
    return { report, credentials: report.decrypted ? valid : null }
  } catch {
    return { report: { ...report, decrypted: false, reason: 'credentials_invalid' }, credentials: null }
  }
}

export function savedCredentialReadiness(env: Record<string, string | undefined>) {
  const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL
  if (!supabaseUrl || !env.SUPABASE_SERVICE_ROLE_KEY) return { ok: false as const, reason: 'supabase_not_configured' as const }
  try {
    if (new URL(supabaseUrl).hostname.split('.')[0] !== HGI_PORTAL_DEV_PROJECT_REF) return { ok: false as const, reason: 'wrong_supabase_project' as const }
  } catch {
    return { ok: false as const, reason: 'supabase_not_configured' as const }
  }
  return { ok: true as const, supabaseUrl }
}

export async function readAmericasBestOptaCredentialRow(env: Record<string, string | undefined>): Promise<SavedOptaCredentialRow | null> {
  const ready = savedCredentialReadiness(env)
  if (!ready.ok) throw Object.assign(new Error(ready.reason), { code: ready.reason })
  const admin = createClient(ready.supabaseUrl, env.SUPABASE_SERVICE_ROLE_KEY as string, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: dealer, error: dealerError } = await admin.from('dealers').select('id').eq('slug', AMERICAS_BEST_DEALER_SLUG).maybeSingle()
  if (dealerError || !dealer?.id) throw Object.assign(new Error('credentials_unreadable'), { code: 'credentials_unreadable' })
  const { data, error } = await admin
    .from('dealer_crm_integrations')
    .select('id,state,credential_key_version,credentials_ciphertext,credentials_iv,credentials_auth_tag')
    .eq('dealer_id', dealer.id)
    .eq('provider', 'opta')
    .maybeSingle()
  if (error) throw Object.assign(new Error('credentials_unreadable'), { code: 'credentials_unreadable' })
  return data
}
