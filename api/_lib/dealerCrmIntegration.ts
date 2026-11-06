import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

export const CRM_PROVIDERS = ['opta', 'gohighlevel', 'custom_webhook'] as const
export const CRM_INTEGRATION_STATES = ['disabled', 'test', 'live'] as const

export type CrmProvider = typeof CRM_PROVIDERS[number]
export type CrmIntegrationState = typeof CRM_INTEGRATION_STATES[number]

export type DealerCrmIntegration = {
  id: string
  dealerId: string
  provider: CrmProvider
  state: CrmIntegrationState
  fieldMapping: Record<string, string>
  hasCredentials: boolean
}

export type TrustedLeadRecord = {
  id: string
  dealerId: string | null
  firstName: string
  lastName: string
  email: string
  phone: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  source: string | null
  doorConfiguration: Record<string, unknown> | null
  pdfQuoteUrl?: string | null
}

export type EncryptedCredentialEnvelope = {
  ciphertext: string
  iv: string
  authTag: string
  keyVersion: number
}

export type CrmCredentialValues = Record<string, string>

const MAX_CREDENTIAL_BYTES = 16 * 1024
const MAX_CREDENTIAL_VALUE_LENGTH = 2048
const STANDARD_FIELD_PATHS = [
  'customer.first_name', 'customer.last_name', 'customer.full_name', 'customer.email', 'customer.phone',
  'customer.address', 'customer.city', 'customer.state', 'customer.postal_code', 'dealer.id', 'lead.id',
  'lead.source', 'door.style', 'door.finish', 'door.glass', 'door.sidelites', 'door.hardware',
  'door.configuration_summary', 'door.pdf_quote_url',
] as const

function encryptionKey(encodedKey: string) {
  const key = Buffer.from(encodedKey, 'base64')
  if (key.byteLength !== 32) throw new Error('CRM credential encryption is not configured correctly.')
  return key
}

export function isCrmCredentialEncryptionConfigured(encodedKey: string | undefined) {
  if (!encodedKey) return false
  try {
    encryptionKey(encodedKey)
    return true
  } catch {
    return false
  }
}

function requiredCredential(value: unknown, label: string) {
  if (typeof value !== 'string') throw new Error(`${label} is required.`)
  const normalized = value.trim()
  if (!normalized || normalized.length > MAX_CREDENTIAL_VALUE_LENGTH) throw new Error(`${label} is invalid.`)
  return normalized
}

export function validateCrmCredentials(provider: CrmProvider, input: Record<string, unknown>): CrmCredentialValues {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('CRM credentials must be an object.')
  if (provider === 'opta') {
    return {
      companyId: requiredCredential(input.companyId, 'Company ID'),
      sourceId: requiredCredential(input.sourceId, 'Source ID'),
      campaignId: requiredCredential(input.campaignId, 'Campaign ID'),
      authenticationKey: requiredCredential(input.authenticationKey, 'Authentication key'),
    }
  }
  if (provider === 'gohighlevel') {
    return {
      locationId: requiredCredential(input.locationId, 'Location ID'),
      privateIntegrationToken: requiredCredential(input.privateIntegrationToken, 'Private integration token'),
    }
  }
  const endpointUrl = requiredCredential(input.endpointUrl, 'Webhook URL')
  let parsed: URL
  try { parsed = new URL(endpointUrl) } catch { throw new Error('Webhook URL must be a valid HTTPS URL.') }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('Webhook URL must be a valid HTTPS URL.')
  return {
    endpointUrl: parsed.toString(),
    authorizationHeader: requiredCredential(input.authorizationHeader, 'Authorization value'),
  }
}

function credentialJson(credentials: Record<string, unknown>) {
  if (!credentials || Array.isArray(credentials)) throw new Error('CRM credentials must be an object.')
  const serialized = JSON.stringify(credentials)
  if (Buffer.byteLength(serialized, 'utf8') > MAX_CREDENTIAL_BYTES) throw new Error('CRM credentials are too large.')
  return serialized
}

export function encryptCrmCredentials(
  credentials: Record<string, unknown>,
  encodedKey: string,
  keyVersion = 1,
): EncryptedCredentialEnvelope {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(encodedKey), iv)
  const ciphertext = Buffer.concat([cipher.update(credentialJson(credentials), 'utf8'), cipher.final()])
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    keyVersion,
  }
}

export function decryptCrmCredentials(
  envelope: EncryptedCredentialEnvelope,
  encodedKey: string,
): Record<string, unknown> {
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(encodedKey), Buffer.from(envelope.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(envelope.authTag, 'base64'))
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8')
  const parsed: unknown = JSON.parse(plaintext)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('CRM credentials are invalid.')
  return parsed as Record<string, unknown>
}

export function assertValidFieldMapping(mapping: Record<string, string>) {
  const allowed = new Set<string>(STANDARD_FIELD_PATHS)
  for (const [destination, source] of Object.entries(mapping)) {
    if (!/^[A-Za-z0-9_.-]{1,120}$/.test(destination) || !allowed.has(source)) {
      throw new Error('CRM field mapping contains an unsupported field.')
    }
  }
}

export function deliveryEligibility(integration: DealerCrmIntegration, lead: TrustedLeadRecord) {
  if (!lead.dealerId || lead.dealerId !== integration.dealerId) {
    throw new Error('CRM integration dealer does not match the trusted lead dealer.')
  }
  if (integration.state === 'disabled') return { eligible: false as const, reason: 'integration_disabled' as const }
  if (!integration.hasCredentials) return { eligible: false as const, reason: 'credentials_missing' as const }
  assertValidFieldMapping(integration.fieldMapping)
  return { eligible: true as const, mode: integration.state }
}

export function leadDeliveryIdempotencyKey(integrationId: string, leadId: string) {
  return createHash('sha256').update(`dealer-crm-delivery:v1:${integrationId}:${leadId}`).digest('hex')
}

export function standardLeadFields(lead: TrustedLeadRecord) {
  const door = lead.doorConfiguration ?? {}
  return {
    customer: {
      first_name: lead.firstName,
      last_name: lead.lastName,
      full_name: [lead.firstName, lead.lastName].filter(Boolean).join(' '),
      email: lead.email,
      phone: lead.phone,
      address: lead.address,
      city: lead.city,
      state: lead.state,
      postal_code: lead.zip,
    },
    dealer: { id: lead.dealerId },
    lead: { id: lead.id, source: lead.source },
    door: {
      style: door.style ?? door.doorStyle ?? null,
      finish: door.finish ?? door.doorFinishColor ?? null,
      glass: door.mainDoorGlass ?? door.glass ?? null,
      sidelites: door.sidelites ?? door.sidelitePlacement ?? null,
      hardware: door.hardware ?? null,
      configuration_summary: door,
      pdf_quote_url: lead.pdfQuoteUrl ?? null,
    },
  }
}
