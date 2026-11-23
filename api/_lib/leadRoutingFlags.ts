export type NotificationMode = 'disabled' | 'dry_run' | 'live'

const MODES = new Set<NotificationMode>(['disabled', 'dry_run', 'live'])

function mode(value: string | undefined): NotificationMode {
  return value && MODES.has(value as NotificationMode) ? value as NotificationMode : 'disabled'
}

export function leadRoutingEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.LEAD_ROUTING_ENABLED === 'true'
}

export function personifyNotificationsMode(env: NodeJS.ProcessEnv = process.env): NotificationMode {
  return mode(env.PERSONIFY_NOTIFICATIONS_MODE)
}

export function dealerNotificationsMode(env: NodeJS.ProcessEnv = process.env): NotificationMode {
  return mode(env.DEALER_NOTIFICATIONS_MODE)
}
