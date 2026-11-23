import type { NotificationMode } from './leadRoutingFlags.ts'

export type DealerNotificationTransport = (url: string, init: { method: 'POST'; headers: Record<string, string>; body: string }) => Promise<{ status: number; text: () => Promise<string> }>

export type DealerNotificationPayload = {
  idempotencyKey: string
  leadId: string
  dealerId: string
  zip: string | null
  dealerEmail: string | null
  customer: {
    firstName: string
    lastName: string
    email: string
    phone: string | null
    comments: string | null
  }
  doorConfiguration: unknown
}

export type DealerNotificationResult =
  | { ok: true; disposition: 'disabled' | 'dry_run' | 'accepted'; providerReference: string | null }
  | { ok: false; disposition: 'not_configured' | 'rejected' | 'network_failure'; safeError: string }

export function dealerNotificationWebhook(env: NodeJS.ProcessEnv) {
  const value = env.DEALER_NOTIFICATION_WEBHOOK_URL?.trim()
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.hostname === 'hooks.zapier.com') return null
    return url.toString()
  } catch {
    return null
  }
}

export async function sendDealerLeadNotification(input: {
  mode: NotificationMode
  payload: DealerNotificationPayload
  env?: NodeJS.ProcessEnv
  transport?: DealerNotificationTransport
}): Promise<DealerNotificationResult> {
  if (input.mode === 'disabled') return { ok: true, disposition: 'disabled', providerReference: null }
  if (input.mode === 'dry_run') return { ok: true, disposition: 'dry_run', providerReference: null }

  const webhook = dealerNotificationWebhook(input.env ?? process.env)
  if (!webhook || !input.payload.dealerEmail) {
    return { ok: false, disposition: 'not_configured', safeError: 'dealer_notification_not_configured' }
  }
  const transport = input.transport ?? fetch
  try {
    const response = await transport(webhook, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Idempotency-Key': input.payload.idempotencyKey,
      },
      body: JSON.stringify(input.payload),
    })
    if (response.status < 200 || response.status >= 300) {
      return { ok: false, disposition: 'rejected', safeError: `dealer_notification_http_${response.status}` }
    }
    return { ok: true, disposition: 'accepted', providerReference: null }
  } catch {
    return { ok: false, disposition: 'network_failure', safeError: 'dealer_notification_network_failure' }
  }
}
