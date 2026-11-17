import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { OPTA_AUTOMATIC_DELIVERY_ENABLED } from '../api/_lib/optaDeliveryControl.ts'
import { sendDealerLeadNotification } from '../api/_lib/dealerLeadNotification.ts'
import { dealerNotificationsMode, leadRoutingEnabled, personifyNotificationsMode } from '../api/_lib/leadRoutingFlags.ts'
import { performDealerNotification, performSalespersonNotification } from '../api/_lib/leadRoutingActions.ts'
import { sendPersonifySalespersonNotification } from '../api/_lib/personifyNotification.ts'
import {
  absoluteReviewUrl,
  canReviewLead,
  claimDealerSend,
  completeDealerSend,
  createDealerSendGate,
  dealerEmailIdempotencyKey,
  decideLeadRoute,
  isMainHgiDoorBuilderLead,
  normalizeUsZip,
  reproposeDealer,
  selectNextDealer,
  type DealerSendState,
} from '../api/_lib/zipLeadRouting.ts'

const dealers = [
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3',
]
const salesperson = '22222222-2222-4222-8222-222222222222'
const admin = '11111111-1111-4111-8111-111111111111'

function baseState(overrides: Partial<DealerSendState> = {}): DealerSendState {
  return {
    found: true,
    routingEnabled: true,
    dealerNotificationsOpen: true,
    status: 'awaiting_approval',
    leadId: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
    proposedDealerId: dealers[0],
    proposedDealerActive: true,
    coverageActive: true,
    salespersonUserId: salesperson,
    salespersonActive: true,
    pointerDealerId: null,
    attempt: null,
    ...overrides,
  }
}

test('ZIP normalization keeps leading zeros and collapses ZIP+4', () => {
  assert.equal(normalizeUsZip('46204'), '46204')
  assert.equal(normalizeUsZip(' 46204-1234 '), '46204')
  assert.equal(normalizeUsZip('462041234'), '46204')
  assert.equal(normalizeUsZip('00501'), '00501')
  assert.equal(normalizeUsZip('501'), '00501')
  assert.equal(normalizeUsZip('0123'), '00123')
  assert.equal(normalizeUsZip('ZIP'), null)
  assert.equal(normalizeUsZip(''), null)
  assert.equal(normalizeUsZip(null), null)
})

test('only main HGI Door Builder leads are routed', () => {
  assert.equal(isMainHgiDoorBuilderLead({ source: 'door_builder', dealerId: null }), true)
  assert.equal(isMainHgiDoorBuilderLead({ source: 'door_builder', dealerId: dealers[0] }), false)
  assert.equal(isMainHgiDoorBuilderLead({ source: null, dealerId: null }), false)
  const dealerLead = decideLeadRoute({ source: 'door_builder', dealerId: dealers[0], zip: '46204', territory: null, eligibleDealerIds: dealers })
  assert.equal(dealerLead.kind, 'skip')
  const missing = decideLeadRoute({ source: 'door_builder', dealerId: null, zip: 'nope', territory: null, eligibleDealerIds: [] })
  assert.deepEqual(missing, { kind: 'unassigned', reason: 'missing_or_invalid_zip', normalizedZip: null })
  const unknown = decideLeadRoute({ source: 'door_builder', dealerId: null, zip: '99999', territory: null, eligibleDealerIds: dealers })
  assert.equal(unknown.kind, 'unassigned')
  const inactive = decideLeadRoute({
    source: 'door_builder',
    dealerId: null,
    zip: '00501',
    territory: { zipCode: '00501', salespersonId: 'sp', assignmentActive: true, salespersonActive: false },
    eligibleDealerIds: dealers,
  })
  assert.equal(inactive.kind, 'unassigned')
  if (inactive.kind === 'unassigned') assert.equal(inactive.reason, 'inactive_salesperson')
})

test('rotation is per ZIP and advances only after success', () => {
  assert.equal(selectNextDealer(dealers, null), dealers[0])
  assert.equal(selectNextDealer(dealers, dealers[0]), dealers[1])
  assert.equal(selectNextDealer(dealers, dealers[2]), dealers[0])
  assert.equal(selectNextDealer([dealers[0], dealers[2]], dealers[0]), dealers[2])
  let pointer: string | null = null
  const proposed: string[] = []
  for (let index = 0; index < 6; index += 1) {
    const next = selectNextDealer(dealers, pointer)
    assert.ok(next)
    proposed.push(next)
    pointer = next
  }
  assert.deepEqual(proposed, [dealers[0], dealers[1], dealers[2], dealers[0], dealers[1], dealers[2]])
})

test('review links require the assigned active salesperson or an admin', () => {
  assert.equal(canReviewLead({ viewerUserId: null, viewerIsHomeGuardAdmin: false, assignedSalespersonUserId: salesperson, assignedSalespersonActive: true }), false)
  assert.equal(canReviewLead({ viewerUserId: admin, viewerIsHomeGuardAdmin: false, assignedSalespersonUserId: salesperson, assignedSalespersonActive: true }), false)
  assert.equal(canReviewLead({ viewerUserId: salesperson, viewerIsHomeGuardAdmin: false, assignedSalespersonUserId: salesperson, assignedSalespersonActive: true }), true)
  assert.equal(canReviewLead({ viewerUserId: salesperson, viewerIsHomeGuardAdmin: false, assignedSalespersonUserId: salesperson, assignedSalespersonActive: false }), false)
  assert.equal(canReviewLead({ viewerUserId: admin, viewerIsHomeGuardAdmin: true, assignedSalespersonUserId: salesperson, assignedSalespersonActive: false }), true)
  assert.equal(absoluteReviewUrl('https://portal.example', 'lead-1'), 'https://portal.example/sales/leads/lead-1')
  assert.equal(absoluteReviewUrl('https://portal.example', 'lead-1')?.includes('token'), false)
  assert.equal(absoluteReviewUrl('http://portal.example', 'lead-1'), null)
})

test('approval is required and a failed delivery retries the same dealer', () => {
  const initial = baseState()
  assert.equal(initial.attempt, null)
  const blocked = claimDealerSend(baseState({ proposedDealerActive: false }), { actorUserId: salesperson, actorIsAdmin: false, dealerId: dealers[0] })
  assert.equal(blocked.result, 'blocked_inactive')
  assert.equal(blocked.state.attempt, null)
  const mismatch = claimDealerSend(initial, { actorUserId: salesperson, actorIsAdmin: false, dealerId: dealers[1] })
  assert.equal(mismatch.result, 'dealer_mismatch')
  assert.equal(mismatch.state.status, 'awaiting_approval')
  const claimed = claimDealerSend(initial, { actorUserId: salesperson, actorIsAdmin: false, dealerId: dealers[0] })
  assert.equal(claimed.result, 'claimed')
  assert.equal(claimed.idempotencyKey, dealerEmailIdempotencyKey(initial.leadId, dealers[0]))
  const duplicate = claimDealerSend(claimed.state, { actorUserId: admin, actorIsAdmin: true, dealerId: dealers[0] })
  assert.equal(duplicate.result, 'in_progress')
  const failed = completeDealerSend(claimed.state, 'failed')
  assert.equal(failed.state.status, 'notification_failed')
  assert.equal(failed.state.pointerDealerId, null)
  assert.equal(failed.state.proposedDealerId, dealers[0])
  const retry = claimDealerSend(failed.state, { actorUserId: salesperson, actorIsAdmin: false, dealerId: dealers[0] })
  assert.equal(retry.idempotencyKey, claimed.idempotencyKey)
  assert.equal(retry.state.attempt?.count, 2)
  const succeeded = completeDealerSend(retry.state, 'succeeded')
  assert.equal(succeeded.state.pointerDealerId, dealers[0])
  const again = claimDealerSend(succeeded.state, { actorUserId: salesperson, actorIsAdmin: false, dealerId: dealers[0] })
  assert.equal(again.result, 'already_sent')
})

test('reproposal does not skip an active dealer or send a notification', () => {
  const kept = reproposeDealer(baseState(), { actorUserId: salesperson, actorIsAdmin: false, eligibleDealerIds: dealers })
  assert.equal(kept.result, 'dealer_still_eligible')
  const next = reproposeDealer(baseState({ proposedDealerActive: false, status: 'blocked_dealer_inactive', pointerDealerId: dealers[0] }), {
    actorUserId: salesperson,
    actorIsAdmin: false,
    eligibleDealerIds: [dealers[1], dealers[2]],
  })
  assert.equal(next.proposedDealerId, dealers[1])
  assert.equal(next.state.attempt, null)
})

test('parallel approvals produce one successful send', async () => {
  let calls = 0
  const gate = createDealerSendGate(baseState())
  const results = await Promise.all([
    gate.approve({ actorUserId: salesperson, actorIsAdmin: false, dealerId: dealers[0], deliver: async () => { calls += 1; await new Promise((resolve) => setTimeout(resolve, 20)); return 'succeeded' } }),
    gate.approve({ actorUserId: admin, actorIsAdmin: true, dealerId: dealers[0], deliver: async () => { calls += 1; return 'succeeded' } }),
  ])
  assert.equal(calls, 1)
  assert.equal(gate.successfulSends(), 1)
  assert.equal(gate.snapshot().status, 'notified')
  assert.ok(results.includes('completed'))
  assert.ok(results.includes('already_sent') || results.includes('in_progress'))
})

test('notification flags default off and adapters do not call the network', async () => {
  assert.equal(leadRoutingEnabled({}), false)
  assert.equal(personifyNotificationsMode({}), 'disabled')
  assert.equal(dealerNotificationsMode({}), 'disabled')
  let calls = 0
  const transport = async () => { calls += 1; return { status: 200, text: async () => '{"messageId":"abc"}' } }
  const personify = await sendPersonifySalespersonNotification({
    mode: 'disabled',
    notification: { salespersonContactId: 'c', salespersonEmail: 's@example.com', reviewUrl: 'https://portal.example/sales/leads/1', zip: '46204', leadId: '1', idempotencyKey: 'personify:1:s' },
    transport,
  })
  const dealer = await sendDealerLeadNotification({
    mode: 'live',
    env: { DEALER_NOTIFICATION_WEBHOOK_URL: 'https://hooks.zapier.com/hooks/catch/test' },
    payload: { idempotencyKey: 'k', leadId: '1', dealerId: dealers[0], zip: '46204', dealerEmail: 'dealer@example.com', customer: { firstName: 'Avery', lastName: 'Stone', email: 'avery@example.com', phone: null, comments: null }, doorConfiguration: null },
    transport,
  })
  assert.equal(personify.disposition, 'disabled')
  assert.equal(dealer.disposition, 'not_configured')
  assert.equal(calls, 0)
  const disabled = await performDealerNotification({
    env: {},
    settings: { routingEnabled: false, personifyMode: 'disabled', dealerMode: 'disabled' },
    claim: async () => { throw new Error('claim should not run') },
    complete: async () => { throw new Error('complete should not run') },
    loadPayload: async () => null,
  })
  assert.equal(disabled.httpStatus, 409)
  assert.equal(disabled.externalCalls, 0)
  const salespersonDisabled = await performSalespersonNotification({
    env: { LEAD_ROUTING_ENABLED: 'true', PERSONIFY_NOTIFICATIONS_MODE: 'disabled' },
    settings: { routingEnabled: true, personifyMode: 'disabled', dealerMode: 'disabled' },
    notification: null,
    claim: async () => { throw new Error('claim should not run') },
    complete: async () => { throw new Error('complete should not run') },
  })
  assert.equal(salespersonDisabled.body.error, 'lead_routing_disabled')
})

test('routing migration does not change existing lead ingestion or Opta delivery', () => {
  const sql = readFileSync('supabase/migrations/20261117160000_add_zip_lead_routing.sql', 'utf8')
  const rollback = readFileSync('supabase/rollbacks/20261117160000_add_zip_lead_routing_rollback.sql', 'utf8')
  assert.equal(OPTA_AUTOMATIC_DELIVERY_ENABLED, false)
  assert.doesNotMatch(sql, /submit_public_lead|opta|personify webhook|hooks\.zapier/)
  assert.match(sql, /new\.source is distinct from 'door_builder'/)
  assert.match(sql, /new\.dealer_id is not null/)
  assert.match(sql, /routing_enabled boolean not null default false/)
  assert.match(sql, /dealer_notifications_mode text not null default 'disabled'/)
  assert.match(rollback, /drop trigger if exists lead_routing_after_lead_insert/)
  assert.doesNotMatch(rollback, /drop table public\.leads|drop table public\.dealers/)
})
