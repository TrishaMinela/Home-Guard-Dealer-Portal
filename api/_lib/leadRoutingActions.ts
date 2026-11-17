import { dealerNotificationWebhook, sendDealerLeadNotification, type DealerNotificationPayload, type DealerNotificationResult } from './dealerLeadNotification.ts'
import { dealerNotificationsMode, leadRoutingEnabled, personifyNotificationsMode, type NotificationMode } from './leadRoutingFlags.ts'
import { personifyLiveConfigured, sendPersonifySalespersonNotification, type PersonifyDispatchResult, type PersonifyNotification } from './personifyNotification.ts'

export type RoutingSettings = {
  routingEnabled: boolean
  personifyMode: NotificationMode
  dealerMode: NotificationMode
}

export type ClaimPayload = {
  result: string
  attemptId?: string
  idempotencyKey?: string
  leadId?: string
  dealerId?: string
}

const WRITE_RESULTS = new Set(['claimed'])

export function routingWritesAllowed(env: NodeJS.ProcessEnv, settings: RoutingSettings) {
  return leadRoutingEnabled(env) && settings.routingEnabled
}

export async function performDealerNotification(input: {
  env: NodeJS.ProcessEnv
  settings: RoutingSettings
  claim: () => Promise<ClaimPayload>
  complete: (attemptId: string, outcome: 'succeeded' | 'failed' | 'dry_run', safeError: string | null) => Promise<void>
  loadPayload: () => Promise<DealerNotificationPayload | null>
  transport?: Parameters<typeof sendDealerLeadNotification>[0]['transport']
}): Promise<{ httpStatus: number; body: Record<string, unknown>; externalCalls: number }> {
  const mode = dealerNotificationsMode(input.env)
  if (!routingWritesAllowed(input.env, input.settings) || mode === 'disabled' || input.settings.dealerMode === 'disabled' || mode !== input.settings.dealerMode) {
    return { httpStatus: 409, body: { error: 'lead_routing_disabled' }, externalCalls: 0 }
  }
  if (mode === 'live' && !dealerNotificationWebhook(input.env)) {
    return { httpStatus: 409, body: { error: 'dealer_notifications_not_configured' }, externalCalls: 0 }
  }

  const claimed = await input.claim()
  if (!WRITE_RESULTS.has(claimed.result) || !claimed.attemptId || !claimed.idempotencyKey) {
    return { httpStatus: 200, body: { result: claimed.result, idempotencyKey: claimed.idempotencyKey ?? null }, externalCalls: 0 }
  }
  const payload = await input.loadPayload()
  if (!payload) {
    await input.complete(claimed.attemptId, 'failed', 'lead_unavailable')
    return { httpStatus: 409, body: { result: 'failed', idempotencyKey: claimed.idempotencyKey }, externalCalls: 0 }
  }
  let externalCalls = 0
  const result: DealerNotificationResult = await sendDealerLeadNotification({
    mode,
    env: input.env,
    payload: { ...payload, idempotencyKey: claimed.idempotencyKey },
    transport: input.transport
      ? async (url, init) => {
          externalCalls += 1
          return input.transport!(url, init)
        }
      : async (url, init) => {
          externalCalls += 1
          return fetch(url, init)
        },
  })
  if (mode === 'dry_run') {
    await input.complete(claimed.attemptId, 'dry_run', null)
    return { httpStatus: 200, body: { result: 'dry_run', idempotencyKey: claimed.idempotencyKey }, externalCalls }
  }
  if (!result.ok) {
    await input.complete(claimed.attemptId, 'failed', result.safeError)
    return { httpStatus: 502, body: { result: 'failed', idempotencyKey: claimed.idempotencyKey }, externalCalls }
  }
  await input.complete(claimed.attemptId, 'succeeded', null)
  return { httpStatus: 200, body: { result: 'succeeded', idempotencyKey: claimed.idempotencyKey }, externalCalls }
}

export async function performSalespersonNotification(input: {
  env: NodeJS.ProcessEnv
  settings: RoutingSettings
  notification: PersonifyNotification | null
  claim: () => Promise<ClaimPayload>
  complete: (attemptId: string, outcome: 'succeeded' | 'failed' | 'dry_run', safeError: string | null) => Promise<void>
  transport?: Parameters<typeof sendPersonifySalespersonNotification>[0]['transport']
}): Promise<{ httpStatus: number; body: Record<string, unknown>; externalCalls: number }> {
  const mode = personifyNotificationsMode(input.env)
  if (!routingWritesAllowed(input.env, input.settings) || mode === 'disabled' || input.settings.personifyMode === 'disabled' || mode !== input.settings.personifyMode) {
    return { httpStatus: 409, body: { error: 'lead_routing_disabled' }, externalCalls: 0 }
  }
  if (!input.notification) return { httpStatus: 409, body: { error: 'salesperson_not_assigned' }, externalCalls: 0 }
  if (mode === 'live' && (!personifyLiveConfigured(input.env) || !input.notification.salespersonContactId || !input.notification.reviewUrl.startsWith('https://'))) {
    return { httpStatus: 409, body: { error: 'personify_not_configured' }, externalCalls: 0 }
  }
  const claimed = await input.claim()
  if (!WRITE_RESULTS.has(claimed.result) || !claimed.attemptId) {
    return { httpStatus: 200, body: { result: claimed.result }, externalCalls: 0 }
  }
  let externalCalls = 0
  const result: PersonifyDispatchResult = await sendPersonifySalespersonNotification({
    mode,
    env: input.env,
    notification: input.notification,
    transport: input.transport
      ? async (url, init) => {
          externalCalls += 1
          return input.transport!(url, init)
        }
      : async (url, init) => {
          externalCalls += 1
          return fetch(url, init)
        },
  })
  if (mode === 'dry_run') {
    await input.complete(claimed.attemptId, 'dry_run', null)
    return { httpStatus: 200, body: { result: 'dry_run' }, externalCalls }
  }
  if (!result.ok) {
    await input.complete(claimed.attemptId, 'failed', result.safeError)
    return { httpStatus: 502, body: { result: 'failed' }, externalCalls }
  }
  await input.complete(claimed.attemptId, 'succeeded', null)
  return { httpStatus: 200, body: { result: 'succeeded' }, externalCalls }
}
