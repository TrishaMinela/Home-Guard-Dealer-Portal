import type { NotificationMode } from './leadRoutingFlags.ts'

export const PERSONIFY_CONVERSATIONS_URL = 'https://services.leadconnectorhq.com/conversations/messages'
export const PERSONIFY_API_VERSION = '2021-07-28'
export const PERSONIFY_REQUIRED_SCOPE = 'conversations/message.write'

export type PersonifyTransport = (url: string, init: { method: 'POST'; headers: Record<string, string>; body: string }) => Promise<{ status: number; text: () => Promise<string> }>

export type PersonifyNotification = {
  salespersonContactId: string
  salespersonEmail: string
  reviewUrl: string
  zip: string
  leadId: string
  idempotencyKey: string
}

export type PersonifyDispatchResult =
  | { ok: true; disposition: 'disabled' | 'dry_run' | 'accepted'; providerReference: string | null }
  | { ok: false; disposition: 'not_configured' | 'rejected' | 'network_failure'; safeError: string }

function httpsBase(value: string | undefined) {
  if (!value) return PERSONIFY_CONVERSATIONS_URL
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return null
    return value.replace(/\/+$/, '')
  } catch {
    return null
  }
}

export function personifyLiveConfigured(env: NodeJS.ProcessEnv) {
  return Boolean(env.PERSONIFY_PRIVATE_INTEGRATION_TOKEN?.trim() && env.PERSONIFY_LOCATION_ID?.trim() && httpsBase(env.PERSONIFY_API_BASE ?? PERSONIFY_CONVERSATIONS_URL))
}

function message(notification: PersonifyNotification) {
  const text = `An HGI Door Builder lead in ZIP ${notification.zip} is ready for your review. Sign in to the Home Guard Portal. Do not forward this link.`
  const html = `<p>${text}</p><p><a href="${notification.reviewUrl}">Review this lead</a></p>`
  return {
    type: 'Email',
    contactId: notification.salespersonContactId,
    emailTo: notification.salespersonEmail,
    subject: `HGI lead ready for review (${notification.zip})`,
    message: text,
    html,
    status: 'pending',
  }
}

function providerReference(body: string) {
  try {
    const parsed = JSON.parse(body) as { messageId?: unknown; conversationId?: unknown }
    const value = typeof parsed.messageId === 'string' ? parsed.messageId : typeof parsed.conversationId === 'string' ? parsed.conversationId : ''
    return /^[A-Za-z0-9_-]{1,80}$/.test(value) ? value : null
  } catch {
    return null
  }
}

export async function sendPersonifySalespersonNotification(input: {
  mode: NotificationMode
  notification: PersonifyNotification
  env?: NodeJS.ProcessEnv
  transport?: PersonifyTransport
}): Promise<PersonifyDispatchResult> {
  if (input.mode === 'disabled') return { ok: true, disposition: 'disabled', providerReference: null }
  if (input.mode === 'dry_run') return { ok: true, disposition: 'dry_run', providerReference: null }

  const env = input.env ?? process.env
  const token = env.PERSONIFY_PRIVATE_INTEGRATION_TOKEN?.trim()
  const locationId = env.PERSONIFY_LOCATION_ID?.trim()
  const endpoint = httpsBase(env.PERSONIFY_API_BASE ?? PERSONIFY_CONVERSATIONS_URL)
  if (!token || !locationId || !endpoint || !input.notification.salespersonContactId || !input.notification.reviewUrl.startsWith('https://')) {
    return { ok: false, disposition: 'not_configured', safeError: 'personify_not_configured' }
  }

  const transport = input.transport ?? fetch
  try {
    const response = await transport(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Version: PERSONIFY_API_VERSION,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Idempotency-Key': input.notification.idempotencyKey,
      },
      body: JSON.stringify({ ...message(input.notification), locationId }),
    })
    if (response.status < 200 || response.status >= 300) {
      return { ok: false, disposition: 'rejected', safeError: `personify_http_${response.status}` }
    }
    return { ok: true, disposition: 'accepted', providerReference: providerReference(await response.text()) }
  } catch {
    return { ok: false, disposition: 'network_failure', safeError: 'personify_network_failure' }
  }
}
