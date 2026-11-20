export const MAIN_HGI_DOOR_BUILDER_SOURCE = 'door_builder'

export const REVIEW_PATH_PREFIX = '/sales/leads/'

export type UnassignedReason =
  | 'missing_or_invalid_zip'
  | 'unknown_zip'
  | 'inactive_salesperson'
  | 'inactive_assignment'

export type RoutingCaseStatus =
  | 'awaiting_approval'
  | 'notification_sending'
  | 'notified'
  | 'notification_failed'
  | 'blocked_dealer_inactive'
  | 'unassigned'
  | 'no_eligible_dealer'

export type AttemptStatus = 'sending' | 'succeeded' | 'failed' | 'dry_run'

export type ClaimResultCode =
  | 'claimed'
  | 'already_sent'
  | 'in_progress'
  | 'blocked_inactive'
  | 'not_authorized'
  | 'not_found'
  | 'disabled'
  | 'dealer_mismatch'
  | 'no_proposal'
  | 'wrong_status'
  | 'dealer_still_eligible'

export type RouteDecision =
  | { kind: 'skip' }
  | {
      kind: 'unassigned'
      reason: UnassignedReason
      normalizedZip: string | null
    }
  | {
      kind: 'assigned'
      normalizedZip: string
      salespersonId: string
      proposedDealerId: string | null
      status: 'awaiting_approval' | 'no_eligible_dealer'
    }

export type TerritoryAssignment = {
  zipCode: string
  salespersonId: string | null
  assignmentActive: boolean
  salespersonActive: boolean
}

export type LeadRouteInput = {
  source: string | null
  dealerId: string | null
  zip: string | null
  territory: TerritoryAssignment | null
  eligibleDealerIds: string[]
  pointerDealerId?: string | null
}

export type DealerSendState = {
  found: boolean
  routingEnabled: boolean
  dealerNotificationsOpen: boolean
  status: RoutingCaseStatus
  leadId: string
  proposedDealerId: string | null
  proposedDealerActive: boolean
  coverageActive: boolean
  salespersonUserId: string | null
  salespersonActive: boolean
  pointerDealerId: string | null
  attempt: null | { key: string; status: AttemptStatus; count: number }
}

export type ViewerAccessInput = {
  viewerUserId: string | null
  viewerIsHomeGuardAdmin: boolean
  assignedSalespersonUserId: string | null
  assignedSalespersonActive: boolean
}

/** USPS ZIP or ZIP+4. Preserves leading zeros. Returns null when the value is not a ZIP. */
export function normalizeUsZip(value: string | null | undefined): string | null {
  if (value == null) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^\d{5}$/.test(trimmed)) return trimmed
  if (/^\d{5}[-\s]\d{4}$/.test(trimmed)) return trimmed.slice(0, 5)
  if (/^\d{9}$/.test(trimmed)) return trimmed.slice(0, 5)
  if (/^\d{3,4}$/.test(trimmed)) return trimmed.padStart(5, '0')
  return null
}

export function isMainHgiDoorBuilderLead(lead: { source: string | null; dealerId: string | null }) {
  return lead.source === MAIN_HGI_DOOR_BUILDER_SOURCE && lead.dealerId == null
}

export function reviewPath(leadId: string) {
  return `${REVIEW_PATH_PREFIX}${leadId}`
}

export function absoluteReviewUrl(origin: string, leadId: string) {
  const url = new URL(reviewPath(leadId), origin)
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null
  if (!url.pathname.startsWith(REVIEW_PATH_PREFIX)) return null
  return url.toString()
}

export function selectNextDealer(eligibleDealerIds: string[], pointerDealerId: string | null) {
  const ordered = [...new Set(eligibleDealerIds)].sort()
  if (!ordered.length) return null
  if (!pointerDealerId) return ordered[0]
  return ordered.find((id) => id > pointerDealerId) ?? ordered[0]
}

export function decideLeadRoute(input: LeadRouteInput): RouteDecision {
  if (!isMainHgiDoorBuilderLead({ source: input.source, dealerId: input.dealerId })) return { kind: 'skip' }
  const normalizedZip = normalizeUsZip(input.zip)
  if (!normalizedZip) return { kind: 'unassigned', reason: 'missing_or_invalid_zip', normalizedZip: null }
  const territory = input.territory
  if (!territory || territory.zipCode !== normalizedZip) {
    return { kind: 'unassigned', reason: 'unknown_zip', normalizedZip }
  }
  if (!territory.assignmentActive) {
    return { kind: 'unassigned', reason: 'inactive_assignment', normalizedZip }
  }
  if (!territory.salespersonId || !territory.salespersonActive) {
    return { kind: 'unassigned', reason: 'inactive_salesperson', normalizedZip }
  }
  const proposedDealerId = selectNextDealer(input.eligibleDealerIds, input.pointerDealerId ?? null)
  if (!proposedDealerId) {
    return {
      kind: 'assigned',
      normalizedZip,
      salespersonId: territory.salespersonId,
      proposedDealerId: null,
      status: 'no_eligible_dealer',
    }
  }
  return {
    kind: 'assigned',
    normalizedZip,
    salespersonId: territory.salespersonId,
    proposedDealerId,
    status: 'awaiting_approval',
  }
}

export function dealerEmailIdempotencyKey(leadId: string, dealerId: string) {
  return `dealer-email:${leadId}:${dealerId}`
}

export function personifyIdempotencyKey(leadId: string, salespersonId: string) {
  return `personify:${leadId}:${salespersonId}`
}

export function canReviewLead(input: ViewerAccessInput) {
  if (!input.viewerUserId) return false
  if (input.viewerIsHomeGuardAdmin) return true
  return input.assignedSalespersonActive && input.viewerUserId === input.assignedSalespersonUserId
}

function actorAllowed(state: DealerSendState, actorUserId: string, actorIsAdmin: boolean) {
  if (!actorUserId) return false
  if (actorIsAdmin) return true
  return state.salespersonActive && state.salespersonUserId === actorUserId
}

export function claimDealerSend(
  state: DealerSendState,
  input: { actorUserId: string; actorIsAdmin: boolean; dealerId: string },
): { state: DealerSendState; result: ClaimResultCode; idempotencyKey: string | null } {
  if (!state.found) return { state, result: 'not_found', idempotencyKey: null }
  if (!state.routingEnabled || !state.dealerNotificationsOpen) {
    return { state, result: 'disabled', idempotencyKey: null }
  }
  if (!actorAllowed(state, input.actorUserId, input.actorIsAdmin)) {
    return { state, result: 'not_authorized', idempotencyKey: null }
  }
  if (state.status === 'notified' || state.attempt?.status === 'succeeded') {
    return { state, result: 'already_sent', idempotencyKey: state.attempt?.key ?? null }
  }
  if (state.status === 'notification_sending' || state.attempt?.status === 'sending') {
    return { state, result: 'in_progress', idempotencyKey: state.attempt?.key ?? null }
  }
  if (!state.proposedDealerId) return { state, result: 'no_proposal', idempotencyKey: null }
  if (state.proposedDealerId !== input.dealerId) return { state, result: 'dealer_mismatch', idempotencyKey: null }
  if (state.status !== 'awaiting_approval' && state.status !== 'notification_failed' && state.status !== 'blocked_dealer_inactive') {
    return { state, result: 'wrong_status', idempotencyKey: null }
  }
  if (!state.proposedDealerActive || !state.coverageActive) {
    return {
      state: { ...state, status: 'blocked_dealer_inactive' },
      result: 'blocked_inactive',
      idempotencyKey: null,
    }
  }
  const key = dealerEmailIdempotencyKey(state.leadId, state.proposedDealerId)
  const count = state.attempt && state.attempt.key === key ? state.attempt.count + 1 : 1
  return {
    state: {
      ...state,
      status: 'notification_sending',
      attempt: { key, status: 'sending', count },
    },
    result: 'claimed',
    idempotencyKey: key,
  }
}

export function completeDealerSend(
  state: DealerSendState,
  outcome: 'succeeded' | 'failed' | 'dry_run',
): { state: DealerSendState; result: 'completed' | 'already_complete' | 'ignored' } {
  if (!state.attempt || state.attempt.status === 'succeeded') {
    return { state, result: state.attempt?.status === 'succeeded' ? 'already_complete' : 'ignored' }
  }
  if (state.attempt.status !== 'sending' || state.status !== 'notification_sending') {
    return { state, result: 'ignored' }
  }
  if (outcome === 'succeeded') {
    return {
      state: {
        ...state,
        status: 'notified',
        pointerDealerId: state.proposedDealerId,
        attempt: { ...state.attempt, status: 'succeeded' },
      },
      result: 'completed',
    }
  }
  if (outcome === 'dry_run') {
    return {
      state: {
        ...state,
        status: 'awaiting_approval',
        attempt: { ...state.attempt, status: 'dry_run' },
      },
      result: 'completed',
    }
  }
  return {
    state: {
      ...state,
      status: 'notification_failed',
      attempt: { ...state.attempt, status: 'failed' },
    },
    result: 'completed',
  }
}

export function reproposeDealer(
  state: DealerSendState,
  input: { actorUserId: string; actorIsAdmin: boolean; eligibleDealerIds: string[] },
): { state: DealerSendState; result: ClaimResultCode; proposedDealerId: string | null } {
  if (!state.found) return { state, result: 'not_found', proposedDealerId: null }
  if (!actorAllowed(state, input.actorUserId, input.actorIsAdmin)) {
    return { state, result: 'not_authorized', proposedDealerId: state.proposedDealerId }
  }
  if (state.status === 'notified' || state.status === 'notification_sending') {
    return { state, result: 'wrong_status', proposedDealerId: state.proposedDealerId }
  }
  const proposalStillValid = state.proposedDealerId && state.proposedDealerActive && state.coverageActive
  if (proposalStillValid) {
    return { state, result: 'dealer_still_eligible', proposedDealerId: state.proposedDealerId }
  }
  const proposedDealerId = selectNextDealer(input.eligibleDealerIds, state.pointerDealerId)
  return {
    state: {
      ...state,
      proposedDealerId,
      proposedDealerActive: Boolean(proposedDealerId),
      coverageActive: Boolean(proposedDealerId),
      status: proposedDealerId ? 'awaiting_approval' : 'no_eligible_dealer',
    },
    result: 'claimed',
    proposedDealerId,
  }
}

type Mutex = { run<T>(work: () => Promise<T>): Promise<T> }

function createMutex(): Mutex {
  let chain = Promise.resolve()
  return {
    run<T>(work: () => Promise<T>) {
      const next = chain.then(work, work)
      chain = next.then(() => undefined, () => undefined)
      return next
    },
  }
}

export function createDealerSendGate(initial: DealerSendState) {
  let state = initial
  let successfulSends = 0
  const mutex = createMutex()
  return {
    snapshot: () => state,
    successfulSends: () => successfulSends,
    async approve(input: { actorUserId: string; actorIsAdmin: boolean; dealerId: string; deliver: () => Promise<'succeeded' | 'failed' | 'dry_run'> }) {
      const claimed = await mutex.run(async () => {
        const outcome = claimDealerSend(state, input)
        state = outcome.state
        return outcome
      })
      if (claimed.result !== 'claimed') return claimed.result
      const delivery = await input.deliver()
      const completed = await mutex.run(async () => {
        const outcome = completeDealerSend(state, delivery)
        state = outcome.state
        return outcome
      })
      if (delivery === 'succeeded' && completed.result === 'completed') successfulSends += 1
      return completed.result
    },
  }
}
