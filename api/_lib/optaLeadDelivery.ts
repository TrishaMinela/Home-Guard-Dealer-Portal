import { standardLeadFields, validateCrmCredentials, type TrustedLeadRecord } from './dealerCrmIntegration.ts'

/**
 * Server-only Opta test delivery for America's Best Windows & Doors.
 *
 * The campaign instruction document (loaded from the public docs shortcode)
 * specifies POST https://abw.opta.io/ca/submit with Content-Type application/json.
 * Campaign identifiers are request fields, not URL parameters: compid, pubid,
 * campid, and auth. They are read from the existing encrypted credential record.
 * This module never builds a live request and is not called by lead submission.
 */
export const AMERICAS_BEST_DEALER_SLUG = 'americas-best-windows-and-doors'
export const OPTA_SUBMIT_URL = 'https://abw.opta.io/ca/submit'
export const OPTA_TEST_VALUE = 'true'
/** Documented sample for the required price field. Door Builder does not collect a price. */
export const OPTA_DOCUMENTED_SAMPLE_PRICE = '0.0'

export type OptaDeliveryMode = 'test' | 'live'

export type OptaDeliveryLead = TrustedLeadRecord & {
  dealerSlug: string
  price?: string | null
  notes?: string | null
  trustedFormUrl?: string | null
  subId1?: string | null
  subId2?: string | null
  userAgent?: string | null
  ipAddress?: string | null
}

export type OptaSubmitBody = {
  compid: string
  pubid: string
  campid: string
  auth: string
  test: typeof OPTA_TEST_VALUE
  first: string
  last: string
  email: string
  phone: string
  address: string
  city: string
  state: string
  zip: string
  price: string
  notes?: string
  lead_id?: string
  tf?: string
  subid1?: string
  subid2?: string
  user_agent?: string
  ip?: string
}

export type OptaPreparedRequest = {
  url: typeof OPTA_SUBMIT_URL
  method: 'POST'
  headers: { 'Content-Type': 'application/json'; Accept: 'application/json' }
  body: OptaSubmitBody
}

export type OptaTransportResponse = { status: number; text: () => Promise<string> }
export type OptaTransport = (
  url: string,
  init: { method: 'POST'; headers: Record<string, string>; body: string; redirect: 'error' },
) => Promise<OptaTransportResponse>

export type OptaDeliveryResult =
  | { ok: true; disposition: 'test_accepted'; httpStatus: 200; leadStatus: true; testLead: true; reason: string; message: string }
  | { ok: false; disposition: 'rejected'; httpStatus: 200; leadStatus: false; reason: string; message: string }
  | { ok: false; disposition: 'unauthorized'; httpStatus: number }
  | { ok: false; disposition: 'missing_field'; missing: string[]; invalid: string[] }
  | { ok: false; disposition: 'invalid_field'; missing: string[]; invalid: string[] }
  | { ok: false; disposition: 'network_failure' }
  | { ok: false; disposition: 'ineligible'; reason: 'dealer_not_eligible' | 'live_delivery_disabled' | 'credentials_invalid' }
  | { ok: false; disposition: 'unexpected_response'; httpStatus: number; leadStatus: boolean | null; testLead: boolean | null }

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_RESPONSE_CHARS = 32_768

export function syntheticAmericasBestOptaLead(): OptaDeliveryLead {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    dealerId: 'synthetic-dealer',
    dealerSlug: AMERICAS_BEST_DEALER_SLUG,
    firstName: 'Synthetic',
    lastName: 'Testlead',
    email: 'synthetic.opta.test@example.com',
    phone: '5550100199',
    address: '100 Test Street',
    city: 'Columbus',
    state: 'OH',
    zip: '43215',
    source: 'door_builder',
    doorConfiguration: null,
    price: OPTA_DOCUMENTED_SAMPLE_PRICE,
    notes: 'HGI Door Builder synthetic Opta test. Not a customer.',
    subId1: 'HGI-AB-door-builder',
  }
}

export function buildOptaTestLeadRequest(
  lead: OptaDeliveryLead,
  credentials: Record<string, unknown>,
  mode: OptaDeliveryMode = 'test',
): { ready: true; request: OptaPreparedRequest } | Exclude<OptaDeliveryResult, { ok: true }> {
  if (mode !== 'test') return { ok: false, disposition: 'ineligible', reason: 'live_delivery_disabled' }
  if (lead.dealerSlug.trim() !== AMERICAS_BEST_DEALER_SLUG) {
    return { ok: false, disposition: 'ineligible', reason: 'dealer_not_eligible' }
  }

  let stored: ReturnType<typeof validateCrmCredentials>
  try {
    stored = validateCrmCredentials('opta', credentials)
  } catch {
    return { ok: false, disposition: 'ineligible', reason: 'credentials_invalid' }
  }

  const fields = standardLeadFields(lead)
  const missing: string[] = []
  const invalid: string[] = []
  const first = requiredText(fields.customer.first_name, 'first', missing)
  const last = requiredText(fields.customer.last_name, 'last', missing)
  const email = requiredEmail(fields.customer.email, missing, invalid)
  const phone = requiredPhone(fields.customer.phone, missing, invalid)
  const address = requiredText(fields.customer.address, 'address', missing)
  const city = requiredText(fields.customer.city, 'city', missing)
  const state = requiredState(fields.customer.state, missing, invalid)
  const zip = requiredZip(fields.customer.postal_code, missing, invalid)
  const price = requiredText(lead.price, 'price', missing)
  const trustedForm = optionalTrustedForm(lead.trustedFormUrl, invalid)
  if (missing.length > 0 || invalid.length > 0 || !first || !last || !email || !phone || !address || !city || !state || !zip || !price || trustedForm === 'invalid') {
    return { ok: false, disposition: missing.length > 0 ? 'missing_field' : 'invalid_field', missing, invalid }
  }

  const body: OptaSubmitBody = {
    compid: stored.companyId,
    pubid: stored.sourceId,
    campid: stored.campaignId,
    auth: stored.authenticationKey,
    test: OPTA_TEST_VALUE,
    first,
    last,
    email,
    phone,
    address,
    city,
    state,
    zip,
    price,
  }
  const notes = optionalText(lead.notes)
  const leadId = optionalText(lead.id)
  const subId1 = optionalText(lead.subId1) ?? optionalText(lead.source)
  const subId2 = optionalText(lead.subId2)
  const userAgent = optionalText(lead.userAgent)
  const ipAddress = optionalIp(lead.ipAddress, invalid)
  if (ipAddress === 'invalid') {
    return { ok: false, disposition: 'invalid_field', missing, invalid }
  }
  if (notes) body.notes = notes
  if (leadId) body.lead_id = leadId
  if (trustedForm) body.tf = trustedForm
  if (subId1) body.subid1 = subId1
  if (subId2) body.subid2 = subId2
  if (userAgent) body.user_agent = userAgent
  if (ipAddress) body.ip = ipAddress
  if (body.test !== OPTA_TEST_VALUE) return { ok: false, disposition: 'ineligible', reason: 'live_delivery_disabled' }

  return {
    ready: true,
    request: {
      url: OPTA_SUBMIT_URL,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body,
    },
  }
}

export async function deliverOptaTestLead(
  lead: OptaDeliveryLead,
  credentials: Record<string, unknown>,
  transport: OptaTransport,
  mode: OptaDeliveryMode = 'test',
): Promise<OptaDeliveryResult> {
  const prepared = buildOptaTestLeadRequest(lead, credentials, mode)
  if (!('ready' in prepared)) return prepared
  if (prepared.request.body.test !== OPTA_TEST_VALUE || prepared.request.url !== OPTA_SUBMIT_URL) {
    return { ok: false, disposition: 'ineligible', reason: 'live_delivery_disabled' }
  }

  let response: OptaTransportResponse
  try {
    response = await transport(prepared.request.url, {
      method: prepared.request.method,
      headers: prepared.request.headers,
      body: JSON.stringify(prepared.request.body),
      redirect: 'error',
    })
  } catch {
    return { ok: false, disposition: 'network_failure' }
  }
  return interpretOptaResponse(response)
}

async function interpretOptaResponse(response: OptaTransportResponse): Promise<OptaDeliveryResult> {
  if (response.status === 401 || response.status === 403) return { ok: false, disposition: 'unauthorized', httpStatus: response.status }

  let raw = ''
  try {
    raw = await response.text()
  } catch {
    return { ok: false, disposition: 'unexpected_response', httpStatus: response.status, leadStatus: null, testLead: null }
  }
  if (raw.length > MAX_RESPONSE_CHARS) {
    return { ok: false, disposition: 'unexpected_response', httpStatus: response.status, leadStatus: null, testLead: null }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, disposition: 'unexpected_response', httpStatus: response.status, leadStatus: null, testLead: null }
  }
  const body = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
  const leadStatus = body?.leadStatus === true ? true : body?.leadStatus === false ? false : null
  const testLead = body?.testLead === true ? true : body?.testLead === false ? false : null
  if (response.status === 200 && leadStatus === false) {
    return { ok: false, disposition: 'rejected', httpStatus: 200, leadStatus: false, reason: sanitizedText(body?.reason), message: sanitizedText(body?.message) }
  }
  if (response.status === 200 && leadStatus === true && testLead === true) {
    return { ok: true, disposition: 'test_accepted', httpStatus: 200, leadStatus: true, testLead: true, reason: sanitizedText(body?.reason), message: sanitizedText(body?.message) }
  }
  return { ok: false, disposition: 'unexpected_response', httpStatus: response.status, leadStatus, testLead }
}

function requiredText(value: string | null | undefined, parameter: string, missing: string[]) {
  const text = value?.trim() ?? ''
  if (!text) missing.push(parameter)
  return text || null
}

function requiredEmail(value: string | null | undefined, missing: string[], invalid: string[]) {
  const text = value?.trim() ?? ''
  if (!text) {
    missing.push('email')
    return null
  }
  if (!EMAIL_PATTERN.test(text)) {
    invalid.push('email')
    return null
  }
  return text
}

function requiredPhone(value: string | null | undefined, missing: string[], invalid: string[]) {
  const raw = value?.trim() ?? ''
  if (!raw) {
    missing.push('phone')
    return null
  }
  const digits = raw.replace(/\D/g, '')
  const normalized = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  if (!/^\d{10}$/.test(normalized)) {
    invalid.push('phone')
    return null
  }
  return normalized
}

function requiredState(value: string | null | undefined, missing: string[], invalid: string[]) {
  const raw = value?.trim() ?? ''
  if (!raw) {
    missing.push('state')
    return null
  }
  const code = raw.toUpperCase()
  if (!/^[A-Z]{2}$/.test(code)) {
    invalid.push('state')
    return null
  }
  return code
}

function requiredZip(value: string | null | undefined, missing: string[], invalid: string[]) {
  const raw = value?.trim() ?? ''
  if (!raw) {
    missing.push('zip')
    return null
  }
  const match = raw.match(/^(\d{5})(?:-\d{4})?$/)
  if (!match) {
    invalid.push('zip')
    return null
  }
  return match[1]
}

function optionalTrustedForm(value: string | null | undefined, invalid: string[]) {
  const raw = value?.trim() ?? ''
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:') {
      invalid.push('tf')
      return 'invalid' as const
    }
    return url.toString()
  } catch {
    invalid.push('tf')
    return 'invalid' as const
  }
}

function optionalText(value: string | null | undefined) {
  const text = value?.trim() ?? ''
  return text || null
}

function optionalIp(value: string | null | undefined, invalid: string[]) {
  const text = value?.trim() ?? ''
  if (!text) return null
  const ipv4 = /^(?:\d{1,3}\.){3}\d{1,3}$/
  const ipv6 = /^[0-9a-f:]+$/i
  if (ipv4.test(text) || (text.includes(':') && ipv6.test(text))) return text
  invalid.push('ip')
  return 'invalid' as const
}

function sanitizedText(value: unknown) {
  if (typeof value !== 'string') return ''
  let text = ''
  for (const character of value) {
    const code = character.charCodeAt(0)
    text += code <= 31 || code === 127 ? ' ' : character
  }
  return text.trim().slice(0, 500)
}
