import assert from 'node:assert/strict'
import test from 'node:test'
import {
  activityPanelState,
  attentionPanelState,
  axisLabelIndexes,
  buildActivityRows,
  buildAttentionItems,
  buildKpis,
  buildLeadActivity,
  countActiveDealers,
  leadChartState,
  pendingRequestsHref,
  pendingUrlRequests,
  yAxisTicks,
  type DashboardDealer,
  type DashboardIssue,
  type DashboardLeadRef,
  type DashboardNotification,
} from '../src/pages/adminDashboard/metrics.ts'

const now = new Date(2026, 10, 12, 15, 30, 0)

function iso(year: number, month: number, day: number, hour = 12, minute = 0) {
  return new Date(year, month - 1, day, hour, minute, 0, 0).toISOString()
}

function dayKey(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function dealer(overrides: Partial<DashboardDealer> & Pick<DashboardDealer, 'id'>): DashboardDealer {
  return {
    company_name: 'Fixture Dealer',
    is_active: true,
    slug_request_status: null,
    requested_slug: null,
    slug_requested_at: null,
    ...overrides,
  }
}

test('buckets lead submissions by local day inside an inclusive window', () => {
  const activity = buildLeadActivity(
    [
      { created_at: iso(2026, 11, 12, 9) },
      { created_at: iso(2026, 11, 12, 18) },
      { created_at: iso(2026, 11, 6, 0) },
      { created_at: iso(2026, 11, 5, 23, 59) },
      { created_at: 'not-a-date' },
    ],
    '7d',
    now,
  )

  assert.equal(activity.grain, 'day')
  assert.equal(activity.buckets.length, 7)
  assert.equal(activity.buckets[0].key, dayKey(2026, 11, 6))
  assert.equal(activity.buckets[0].count, 1)
  assert.equal(activity.buckets[6].key, dayKey(2026, 11, 12))
  assert.equal(activity.buckets[6].count, 2)
  assert.equal(activity.buckets.reduce((sum, bucket) => sum + bucket.count, 0), 3)
  assert.equal(activity.total, 3)
  const busiest = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(2026, 10, 12))
  assert.equal(activity.summary, `3 lead submissions. Busiest day was ${busiest} with 2.`)
})

test('90 day window keeps a zero day and excludes the day before it starts', () => {
  const start = new Date(2026, 10, 12)
  start.setDate(start.getDate() - 89)
  const justBefore = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  justBefore.setMilliseconds(-1)

  const activity = buildLeadActivity(
    [
      { created_at: new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0).toISOString() },
      { created_at: justBefore.toISOString() },
      { created_at: iso(2026, 11, 13, 0) },
    ],
    '90d',
    now,
  )

  assert.equal(activity.buckets.length, 90)
  assert.equal(activity.buckets[0].count, 1)
  assert.equal(activity.total, 1)
  assert.equal(activity.buckets.at(-1)?.key, dayKey(2026, 11, 12))
})

test('all-time activity stays daily for a short span and switches to months after 62 days', () => {
  const short = buildLeadActivity(
    [{ created_at: iso(2026, 11, 10) }, { created_at: iso(2026, 11, 12) }],
    'all',
    now,
  )
  assert.equal(short.grain, 'day')
  assert.equal(short.buckets.length, 3)
  assert.equal(short.buckets[1].count, 0)
  assert.equal(short.total, 2)

  const long = buildLeadActivity(
    [
      { created_at: iso(2025, 1, 15) },
      { created_at: iso(2026, 11, 2) },
      { created_at: iso(2026, 11, 12) },
    ],
    'all',
    now,
  )
  assert.equal(long.grain, 'month')
  assert.equal(long.buckets[0].key, '2025-01')
  assert.equal(long.buckets[0].count, 1)
  assert.equal(long.buckets.at(-1)?.key, '2026-11')
  assert.equal(long.buckets.at(-1)?.count, 2)
  assert.equal(long.total, 3)
  assert.ok(long.buckets.some((bucket) => bucket.key === '2025-06' && bucket.count === 0))
})

test('empty and invalid lead series produce an empty chart summary', () => {
  const empty = buildLeadActivity([], '30d', now)
  assert.deepEqual(empty.buckets, [])
  assert.equal(empty.total, 0)
  assert.equal(empty.summary, 'No lead submissions in this range.')

  const invalid = buildLeadActivity([{ created_at: '' }, { created_at: 'yesterday' }], 'all', now)
  assert.equal(invalid.total, 0)
})

test('KPI derivations separate ranged leads from current dealer status', () => {
  const dealers = [
    dealer({ id: 'active', is_active: true }),
    dealer({ id: 'disabled', is_active: false }),
    dealer({
      id: 'pending-one',
      slug_request_status: 'pending',
      requested_slug: 'one',
      slug_requested_at: iso(2026, 11, 1),
    }),
    dealer({
      id: 'pending-two',
      slug_request_status: 'pending',
      requested_slug: null,
      slug_requested_at: iso(2026, 11, 11),
    }),
    dealer({ id: 'rejected', slug_request_status: 'rejected', requested_slug: 'nope' }),
    dealer({ id: 'clear', slug_request_status: null }),
  ]
  const leads = [
    { created_at: iso(2026, 11, 12) },
    { created_at: iso(2026, 11, 1) },
    { created_at: iso(2026, 8, 1) },
    { created_at: 'bad' },
  ]

  assert.equal(countActiveDealers(dealers), 5)
  assert.equal(pendingUrlRequests(dealers).map((item) => item.id).join(','), 'pending-two,pending-one')

  const week = buildKpis({ leads, dealers, range: '7d', now })
  assert.equal(week[0].value, 1)
  assert.equal(week[0].description, 'Submitted in the last 7 days.')
  assert.match(week[0].note, /4 loaded in total/)
  assert.match(week[0].note, /Date range applies/)
  assert.equal(week[1].value, 5)
  assert.match(week[1].note, /Not date filtered/)
  assert.equal(week[2].value, 2)
  assert.equal(week[2].href, '#needs-attention')
  assert.match(week[2].note, /Not date filtered/)

  const all = buildKpis({ leads, dealers, range: 'all', now })
  assert.equal(all[0].value, 3)
  assert.match(all[0].description, /currently loaded/)
  assert.match(all[0].note, /Date range is All/)
})

test('a single pending request links to that dealer and none leaves the card static', () => {
  const only = [dealer({ id: 'solo', slug_request_status: 'pending', requested_slug: 'solo' })]
  assert.equal(pendingRequestsHref(only), '/admin/dealers/solo')
  assert.equal(buildKpis({ leads: [], dealers: only, range: '30d', now })[2].href, '/admin/dealers/solo')
  assert.equal(pendingRequestsHref([dealer({ id: 'clear' })]), null)
})

test('needs attention lists pending URL requests before unresolved AI issues', () => {
  const dealers = [
    dealer({
      id: 'older',
      company_name: 'Older Doors',
      slug_request_status: 'pending',
      requested_slug: 'older',
      slug_requested_at: iso(2026, 10, 1),
    }),
    dealer({
      id: 'newer',
      company_name: '  ',
      slug_request_status: 'pending',
      requested_slug: null,
      slug_requested_at: iso(2026, 11, 10),
    }),
    dealer({ id: 'rejected', slug_request_status: 'rejected', requested_slug: 'skip' }),
  ]
  const issues: DashboardIssue[] = [
    {
      id: 'critical',
      severity: 'critical',
      title: 'Render failed',
      admin_summary: 'The render failed.',
      last_seen_at: iso(2026, 11, 12),
      occurrence_count: 4,
      status: 'unresolved',
    },
    {
      id: 'done',
      severity: 'warning',
      title: 'Resolved warning',
      admin_summary: 'Already resolved.',
      last_seen_at: iso(2026, 11, 11),
      occurrence_count: 2,
      status: 'resolved',
    },
    {
      id: 'warn',
      severity: 'warning',
      title: 'Slow provider',
      admin_summary: 'Latency is high.',
      last_seen_at: iso(2026, 11, 9),
      occurrence_count: 1,
      status: 'unresolved',
    },
  ]

  const items = buildAttentionItems(dealers, issues)
  assert.deepEqual(items.map((item) => item.id), ['url-newer', 'url-older', 'ai-critical', 'ai-warn'])
  assert.equal(items[0].title, 'Dealer')
  assert.match(items[0].detail, /no requested URL/)
  assert.equal(items[0].href, '/admin/dealers/newer')
  assert.equal(items[1].detail, 'Requested /older')
  assert.equal(items[1].actionLabel, 'View Request')
  assert.equal(items[2].href, '/admin/ai-usage?issue=critical')
  assert.equal(items[2].meta, 'Occurred 4 times')
  assert.equal(items[3].meta, null)
})

test('recent activity uses lead and dealer records, then sorts by time', () => {
  const leads: DashboardLeadRef[] = [
    {
      id: '123e4567-e89b-12d3-a456-426614174000',
      dealer_id: null,
      first_name: 'Ada',
      last_name: 'Lovelace',
      created_at: iso(2026, 11, 12, 9),
    },
    {
      id: 'owned',
      dealer_id: 'missing-dealer',
      first_name: 'Grace',
      last_name: 'Hopper',
      created_at: iso(2026, 11, 2, 9),
    },
  ]
  const dealers = [
    dealer({
      id: 'north',
      company_name: 'Northline',
      slug_request_status: 'pending',
      requested_slug: 'northline',
      slug_requested_at: iso(2026, 11, 8, 14),
    }),
  ]
  const notifications: DashboardNotification[] = [
    {
      id: 'lead-owned',
      type: 'lead',
      title: 'New Lead',
      message: 'Grace Hopper submitted a request',
      actionLabel: 'View Lead',
      path: '/admin/leads/owned',
    },
    {
      id: 'slug-north',
      type: 'request',
      title: 'Visualizer URL request',
      message: 'Northline requested /northline',
      actionLabel: 'View Request',
      path: '/admin/dealers/north',
    },
    {
      id: 'lead-123e4567-e89b-12d3-a456-426614174000',
      type: 'lead',
      title: 'New Lead',
      message: 'fallback message',
      actionLabel: 'View Lead',
      path: '/admin/leads/123e4567-e89b-12d3-a456-426614174000',
    },
    {
      id: 'ai-issue-1',
      type: 'ai_issue',
      title: 'Render failed',
      message: 'Summary',
      actionLabel: 'View Issue',
      path: '/admin/ai-usage?issue=1',
      severity: 'critical',
      occurredAt: iso(2026, 11, 9, 8),
      occurrenceCount: 3,
    },
    {
      id: 'lead-unknown',
      type: 'lead',
      title: 'New Lead',
      message: 'Unknown person submitted a request',
      actionLabel: 'View Lead',
      path: '/admin/leads/unknown',
    },
  ]

  const rows = buildActivityRows(notifications, leads, dealers)
  assert.deepEqual(rows.map((row) => row.id), [
    'lead-123e4567-e89b-12d3-a456-426614174000',
    'ai-issue-1',
    'slug-north',
    'lead-owned',
    'lead-unknown',
  ])
  assert.equal(rows[0].subject, 'Ada Lovelace')
  assert.equal(rows[0].context, 'HGI')
  assert.equal(rows[0].occurredAt, leads[0].created_at)
  assert.equal(rows[1].context, 'Critical · 3 times')
  assert.equal(rows[2].subject, 'Northline')
  assert.equal(rows[2].context, '/northline')
  assert.equal(rows[2].actionLabel, 'View Request')
  assert.equal(rows[3].context, 'Unknown dealer')
  assert.equal(rows[4].subject, 'Unknown person submitted a request')
  assert.equal(rows[4].occurredAt, null)
})

test('panel states cover loading, error, empty, and ready data', () => {
  assert.equal(leadChartState({ isLoading: true, error: 'failed', totalInRange: 0 }), 'loading')
  assert.equal(leadChartState({ isLoading: false, error: 'failed', totalInRange: 0 }), 'error')
  assert.equal(leadChartState({ isLoading: false, error: 'failed', totalInRange: 2 }), 'ready')
  assert.equal(leadChartState({ isLoading: false, error: '', totalInRange: 0 }), 'empty')
  assert.equal(leadChartState({ isLoading: false, error: '', totalInRange: 4 }), 'ready')

  assert.equal(activityPanelState({ isLoading: true, error: '', count: 0 }), 'loading')
  assert.equal(activityPanelState({ isLoading: false, error: 'history failed', count: 0 }), 'error')
  assert.equal(activityPanelState({ isLoading: false, error: 'history failed', count: 2 }), 'ready')
  assert.equal(activityPanelState({ isLoading: false, error: '', count: 0 }), 'empty')

  assert.equal(attentionPanelState({ isLoading: true, requestCount: 0, issueCount: 0, issuesLoading: true }), 'loading')
  assert.equal(attentionPanelState({ isLoading: false, requestCount: 1, issueCount: 0, issuesLoading: true }), 'ready')
  assert.equal(attentionPanelState({ isLoading: false, requestCount: 0, issueCount: 0, issuesLoading: true }), 'ready')
  assert.equal(attentionPanelState({ isLoading: false, requestCount: 0, issueCount: 0, issuesLoading: false }), 'empty')
})

test('axis helpers stay readable for sparse and dense series', () => {
  assert.deepEqual(axisLabelIndexes(7, 7), [0, 1, 2, 3, 4, 5, 6])
  const sampled = axisLabelIndexes(30, 6)
  assert.equal(sampled[0], 0)
  assert.equal(sampled.at(-1), 29)
  assert.ok(sampled.length <= 6)

  assert.deepEqual(yAxisTicks(1), [0, 1])
  assert.deepEqual(yAxisTicks(4), [0, 1, 2, 3, 4])
  assert.deepEqual(yAxisTicks(6), [0, 2, 4, 6])
  assert.deepEqual(yAxisTicks(23), [0, 10, 20, 30])
})
