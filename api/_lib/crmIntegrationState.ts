import { AMERICAS_BEST_DEALER_SLUG } from './optaLeadDelivery.ts'
import type { CrmIntegrationState } from './dealerCrmIntegration.ts'

/** The only dealer allowed to send Opta leads. Keep this list to that one slug. */
export const OPTA_DEALER_ALLOWLIST: readonly string[] = [AMERICAS_BEST_DEALER_SLUG]

/** Typed by an admin before the integration state can become live. Not a secret. */
export const OPTA_LIVE_CONFIRMATION_PHRASE = 'enable live opta delivery'

export function dealerAllowsOptaDelivery(slug: string | null | undefined) {
  const normalized = slug?.trim() ?? ''
  return OPTA_DEALER_ALLOWLIST.length === 1
    && OPTA_DEALER_ALLOWLIST[0] === AMERICAS_BEST_DEALER_SLUG
    && normalized === AMERICAS_BEST_DEALER_SLUG
}

export function validateIntegrationStateChange(input: {
  provider: string
  dealerSlug: string | null | undefined
  requestedState: string | null | undefined
  liveConfirmation?: string | null
}): { ok: true; state: CrmIntegrationState } | { ok: false; status: 400 | 409; error: string } {
  if (input.requestedState !== 'disabled' && input.requestedState !== 'test' && input.requestedState !== 'live') {
    return { ok: false, status: 400, error: 'Choose a supported integration state.' }
  }
  if (input.requestedState === 'disabled') return { ok: true, state: 'disabled' }
  if (input.provider !== 'opta' || !dealerAllowsOptaDelivery(input.dealerSlug)) {
    return { ok: false, status: 409, error: 'CRM delivery activation is only available for the approved Opta dealer.' }
  }
  if (input.requestedState === 'live' && (input.liveConfirmation ?? '').trim() !== OPTA_LIVE_CONFIRMATION_PHRASE) {
    return { ok: false, status: 409, error: 'Type the live confirmation phrase to enable live Opta delivery.' }
  }
  return { ok: true, state: input.requestedState }
}

export type CrmAuditAction = 'created' | 'configuration_updated' | 'credentials_updated' | 'state_changed'

/**
 * Audit rows that mark when test or live began. Credential and mapping saves
 * must not move that timestamp, or older leads would look newly eligible.
 */
export function marksDeliveryEnablement(action: string) {
  return action === 'state_changed' || action === 'created'
}

export function integrationAuditPlan(input: {
  isNew: boolean
  previousState: CrmIntegrationState | null
  nextState: CrmIntegrationState
  credentialsChanged: boolean
}): CrmAuditAction[] {
  if (input.isNew) {
    const actions: CrmAuditAction[] = ['created']
    if (input.nextState !== 'disabled') actions.push('state_changed')
    if (input.credentialsChanged) actions.push('credentials_updated')
    return actions
  }
  const actions: CrmAuditAction[] = []
  if (input.previousState !== input.nextState) actions.push('state_changed')
  if (input.credentialsChanged) actions.push('credentials_updated')
  if (actions.length === 0) actions.push('configuration_updated')
  return actions
}
