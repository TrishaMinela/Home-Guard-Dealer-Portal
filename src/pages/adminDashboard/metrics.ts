export const DASHBOARD_RANGES = ['7d', '30d', '90d', 'all'] as const

export type DashboardRange = (typeof DASHBOARD_RANGES)[number]

export const LEAD_SERIES_LIMITATION =
  'Counts use each loaded lead’s created_at. The admin leads query is not paged, so a server row cap would omit older submissions from this total and chart.'

export type LeadTimestamp = {
  created_at: string
}

export type DashboardDealer = {
  id: string
  company_name: string
  is_active: boolean
  slug_request_status: 'pending' | 'rejected' | null
  requested_slug: string | null
  slug_requested_at: string | null
}

export type DashboardLeadRef = {
  id: string
  dealer_id: string | null
  first_name: string
  last_name: string
  created_at: string
}

export type DashboardIssue = {
  id: string
  severity: 'critical' | 'warning'
  title: string
  admin_summary: string
  last_seen_at: string
  occurrence_count: number
  status: 'unresolved' | 'resolved'
}

export type DashboardNotification = {
  id: string
  type: 'request' | 'lead' | 'ai_issue'
  title: string
  message: string
  actionLabel: string
  path: string
  severity?: 'critical' | 'warning'
  occurredAt?: string
  occurrenceCount?: number
}

export type ActivityBucket = {
  key: string
  label: string
  count: number
}

export type LeadActivity = {
  buckets: ActivityBucket[]
  total: number
  grain: 'day' | 'month'
  summary: string
}

export type KpiModel = {
  id: 'leads' | 'dealers' | 'requests'
  label: string
  value: number
  description: string
  note: string
  href: string | null
}

export type AttentionItem = {
  id: string
  kind: 'url_request' | 'ai_issue'
  indicator: 'pending' | 'critical' | 'warning'
  indicatorLabel: string
  title: string
  detail: string
  meta: string | null
  href: string
  actionLabel: string
  occurredAt: string | null
}

export type ActivityRow = {
  id: string
  typeLabel: string
  subject: string
  context: string
  actionLabel: string
  path: string
  occurredAt: string | null
}

export type PanelState = 'loading' | 'error' | 'empty' | 'ready'

const DAY_FORMAT: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
const MONTH_FORMAT: Intl.DateTimeFormatOptions = { month: 'short', year: 'numeric' }

function parseTimestamp(value: string) {
  const time = Date.parse(value)
  return Number.isNaN(time) ? null : new Date(time)
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function dayKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function formatCount(value: number) {
  return new Intl.NumberFormat('en-US').format(value)
}

function rangeDays(range: Exclude<DashboardRange, 'all'>) {
  if (range === '7d') return 7
  if (range === '30d') return 30
  return 90
}

export function rangeWindow(range: Exclude<DashboardRange, 'all'>, now: Date) {
  const start = startOfLocalDay(now)
  start.setDate(start.getDate() - (rangeDays(range) - 1))
  const end = startOfLocalDay(now)
  end.setDate(end.getDate() + 1)
  return { start, end }
}

export function leadsInRange<T extends LeadTimestamp>(leads: T[], range: DashboardRange, now: Date) {
  const dated = leads.flatMap((lead) => {
    const date = parseTimestamp(lead.created_at)
    return date ? [{ lead, date }] : []
  })

  if (range === 'all') return dated

  const { start, end } = rangeWindow(range, now)
  return dated.filter(({ date }) => date >= start && date < end)
}

export function countActiveDealers(dealers: Array<Pick<DashboardDealer, 'is_active'>>) {
  return dealers.filter((dealer) => dealer.is_active === true).length
}

export function pendingUrlRequests<T extends Pick<DashboardDealer, 'slug_request_status' | 'slug_requested_at'>>(dealers: T[]) {
  return dealers
    .filter((dealer) => dealer.slug_request_status === 'pending')
    .sort((left, right) => {
      const leftTime = left.slug_requested_at ? Date.parse(left.slug_requested_at) : Number.NaN
      const rightTime = right.slug_requested_at ? Date.parse(right.slug_requested_at) : Number.NaN
      const leftMissing = Number.isNaN(leftTime)
      const rightMissing = Number.isNaN(rightTime)
      if (leftMissing && rightMissing) return 0
      if (leftMissing) return 1
      if (rightMissing) return -1
      return rightTime - leftTime
    })
}

export function pendingRequestsHref(dealers: DashboardDealer[]) {
  const pending = pendingUrlRequests(dealers)
  if (pending.length === 1) return `/admin/dealers/${pending[0].id}`
  if (pending.length > 1) return '#needs-attention'
  return null
}

export function buildKpis(input: {
  leads: LeadTimestamp[]
  dealers: DashboardDealer[]
  range: DashboardRange
  now?: Date
}): KpiModel[] {
  const now = input.now ?? new Date()
  const loaded = input.leads.length
  const inRange = leadsInRange(input.leads, input.range, now).length
  const active = countActiveDealers(input.dealers)
  const pending = pendingUrlRequests(input.dealers)
  const requestsHref = pendingRequestsHref(input.dealers)
  const leadCopy = input.range === 'all'
    ? {
        description: 'All submitted leads currently loaded.',
        note: 'Date range is All, so this is every loaded submission.',
      }
    : {
        description: `Submitted in the last ${rangeDays(input.range)} days.`,
        note: `${formatCount(loaded)} loaded in total. Date range applies.`,
      }

  return [
    {
      id: 'leads',
      label: 'Total Leads',
      value: input.range === 'all' ? leadsInRange(input.leads, 'all', now).length : inRange,
      description: leadCopy.description,
      note: leadCopy.note,
      href: null,
    },
    {
      id: 'dealers',
      label: 'Active Dealers',
      value: active,
      description: `${formatCount(input.dealers.length)} dealers total.`,
      note: 'Current active status. Not date filtered.',
      href: null,
    },
    {
      id: 'requests',
      label: 'Pending Requests',
      value: pending.length,
      description: pending.length === 1
        ? 'Outstanding Visualizer URL request.'
        : 'Outstanding Visualizer URL requests.',
      note: pending.length === 0
        ? 'Nothing waiting. Not date filtered.'
        : pending.length === 1
          ? "Opens this dealer's URL request. Not date filtered."
          : 'Opens the list below. Not date filtered.',
      href: requestsHref,
    },
  ]
}

function calendarSpanDays(start: Date, end: Date) {
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate())
  return Math.round((endUtc - startUtc) / 86_400_000) + 1
}

function dailyBuckets(start: Date, end: Date, dates: Date[]): ActivityBucket[] {
  const counts = new Map<string, number>()
  for (const date of dates) {
    const key = dayKey(date)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const buckets: ActivityBucket[] = []
  const cursor = startOfLocalDay(start)
  const last = startOfLocalDay(end)
  while (cursor <= last) {
    const key = dayKey(cursor)
    buckets.push({
      key,
      label: new Intl.DateTimeFormat(undefined, DAY_FORMAT).format(cursor),
      count: counts.get(key) ?? 0,
    })
    cursor.setDate(cursor.getDate() + 1)
  }
  return buckets
}

function monthlyBuckets(start: Date, end: Date, dates: Date[]): ActivityBucket[] {
  const counts = new Map<string, number>()
  for (const date of dates) {
    const key = monthKey(date)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const buckets: ActivityBucket[] = []
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1)
  const last = new Date(end.getFullYear(), end.getMonth(), 1)
  while (cursor <= last) {
    const key = monthKey(cursor)
    buckets.push({
      key,
      label: new Intl.DateTimeFormat(undefined, MONTH_FORMAT).format(cursor),
      count: counts.get(key) ?? 0,
    })
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return buckets
}

function summarize(buckets: ActivityBucket[], grain: 'day' | 'month') {
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0)
  if (total === 0) return 'No lead submissions in this range.'
  const peak = buckets.reduce((best, bucket) => (bucket.count >= best.count ? bucket : best))
  const noun = total === 1 ? 'submission' : 'submissions'
  const unit = grain === 'month' ? 'month' : 'day'
  return `${formatCount(total)} lead ${noun}. Busiest ${unit} was ${peak.label} with ${formatCount(peak.count)}.`
}

export function buildLeadActivity(leads: LeadTimestamp[], range: DashboardRange, now: Date): LeadActivity {
  const dated = leads.flatMap((lead) => {
    const date = parseTimestamp(lead.created_at)
    return date ? [date] : []
  })

  if (range === 'all') {
    if (dated.length === 0) {
      return { buckets: [], total: 0, grain: 'day', summary: 'No lead submissions in this range.' }
    }
    const earliest = dated.reduce((min, date) => (date < min ? date : min))
    const latest = dated.reduce((max, date) => (date > max ? date : max))
    const end = latest > now ? latest : now
    const span = calendarSpanDays(earliest, end)
    const grain = span > 62 ? 'month' : 'day'
    const buckets = grain === 'month'
      ? monthlyBuckets(earliest, end, dated)
      : dailyBuckets(earliest, end, dated)
    return { buckets, total: dated.length, grain, summary: summarize(buckets, grain) }
  }

  const window = rangeWindow(range, now)
  const included = dated.filter((date) => date >= window.start && date < window.end)
  if (included.length === 0) {
    return { buckets: [], total: 0, grain: 'day', summary: 'No lead submissions in this range.' }
  }
  const end = new Date(window.end.getTime() - 1)
  const buckets = dailyBuckets(window.start, end, included)
  return { buckets, total: included.length, grain: 'day', summary: summarize(buckets, 'day') }
}

export function leadChartState(input: { isLoading: boolean; error: string; totalInRange: number }): PanelState {
  if (input.isLoading) return 'loading'
  if (input.error && input.totalInRange === 0) return 'error'
  if (input.totalInRange === 0) return 'empty'
  return 'ready'
}

export function activityPanelState(input: { isLoading: boolean; error: string; count: number }): PanelState {
  if (input.isLoading) return 'loading'
  if (input.error && input.count === 0) return 'error'
  if (input.count === 0) return 'empty'
  return 'ready'
}

export function attentionPanelState(input: {
  isLoading: boolean
  requestCount: number
  issueCount: number
  issuesLoading: boolean
}): 'loading' | 'empty' | 'ready' {
  if (input.isLoading) return 'loading'
  if (input.requestCount === 0 && input.issueCount === 0 && !input.issuesLoading) return 'empty'
  return 'ready'
}

export function buildAttentionItems(dealers: DashboardDealer[], issues: DashboardIssue[]): AttentionItem[] {
  const requests = pendingUrlRequests(dealers).map((dealer) => ({
    id: `url-${dealer.id}`,
    kind: 'url_request' as const,
    indicator: 'pending' as const,
    indicatorLabel: 'Pending',
    title: dealer.company_name.trim() || 'Dealer',
    detail: dealer.requested_slug
      ? `Requested /${dealer.requested_slug}`
      : 'Pending status is set, but no requested URL was recorded.',
    meta: null,
    href: `/admin/dealers/${dealer.id}`,
    actionLabel: 'View Request',
    occurredAt: dealer.slug_requested_at,
  }))

  const unresolved = issues.filter((issue) => issue.status === 'unresolved')
  const issueItems = unresolved.map((issue) => ({
    id: `ai-${issue.id}`,
    kind: 'ai_issue' as const,
    indicator: issue.severity,
    indicatorLabel: issue.severity === 'critical' ? 'Critical' : 'Warning',
    title: issue.title,
    detail: issue.admin_summary,
    meta: issue.occurrence_count > 1 ? `Occurred ${formatCount(issue.occurrence_count)} times` : null,
    href: `/admin/ai-usage?issue=${issue.id}`,
    actionLabel: 'View Issue',
    occurredAt: issue.last_seen_at,
  }))

  return [...requests, ...issueItems]
}

function sourceId(notificationId: string, prefix: string) {
  return notificationId.startsWith(prefix) ? notificationId.slice(prefix.length) : null
}

function dealerName(dealers: DashboardDealer[], dealerId: string | null) {
  if (!dealerId) return 'HGI'
  return dealers.find((dealer) => dealer.id === dealerId)?.company_name ?? 'Unknown dealer'
}

export function buildActivityRows(
  notifications: DashboardNotification[],
  leads: DashboardLeadRef[],
  dealers: DashboardDealer[],
): ActivityRow[] {
  const rows = notifications.map((notification) => {
    if (notification.type === 'lead') {
      const lead = leads.find((item) => item.id === sourceId(notification.id, 'lead-'))
      const name = lead ? `${lead.first_name} ${lead.last_name}`.trim() : ''
      return {
        id: notification.id,
        typeLabel: 'New lead',
        subject: name || notification.message,
        context: lead ? dealerName(dealers, lead.dealer_id) : '',
        actionLabel: notification.actionLabel,
        path: notification.path,
        occurredAt: lead?.created_at ?? null,
      }
    }

    if (notification.type === 'request') {
      const dealer = dealers.find((item) => item.id === sourceId(notification.id, 'slug-'))
      return {
        id: notification.id,
        typeLabel: 'URL request',
        subject: dealer?.company_name || notification.message,
        context: dealer?.requested_slug ? `/${dealer.requested_slug}` : 'Visualizer URL',
        actionLabel: notification.actionLabel,
        path: notification.path,
        occurredAt: dealer?.slug_requested_at ?? null,
      }
    }

    const severity = notification.severity === 'critical'
      ? 'Critical'
      : notification.severity === 'warning'
        ? 'Warning'
        : 'AI Visualizer'
    const repeats = notification.occurrenceCount && notification.occurrenceCount > 1
      ? ` · ${formatCount(notification.occurrenceCount)} times`
      : ''
    return {
      id: notification.id,
      typeLabel: 'AI issue',
      subject: notification.title,
      context: `${severity}${repeats}`,
      actionLabel: notification.actionLabel,
      path: notification.path,
      occurredAt: notification.occurredAt ?? null,
    }
  })

  return rows.sort((left, right) => {
    const leftTime = left.occurredAt ? Date.parse(left.occurredAt) : Number.NaN
    const rightTime = right.occurredAt ? Date.parse(right.occurredAt) : Number.NaN
    const leftMissing = Number.isNaN(leftTime)
    const rightMissing = Number.isNaN(rightTime)
    if (leftMissing && rightMissing) return left.id.localeCompare(right.id)
    if (leftMissing) return 1
    if (rightMissing) return -1
    if (rightTime !== leftTime) return rightTime - leftTime
    return left.id.localeCompare(right.id)
  })
}

export function axisLabelIndexes(length: number, maxLabels: number) {
  if (length <= 0 || maxLabels <= 0) return []
  if (length <= maxLabels) return Array.from({ length }, (_, index) => index)
  const last = length - 1
  const step = last / (maxLabels - 1)
  const indexes = new Set<number>()
  for (let index = 0; index < maxLabels; index += 1) indexes.add(Math.round(index * step))
  return [...indexes]
}

function tickStep(max: number) {
  if (max <= 5) return 1
  const rough = max / 4
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const normalized = rough / magnitude
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return nice * magnitude
}

export function yAxisTicks(maxCount: number) {
  const max = Math.max(1, maxCount)
  const step = tickStep(max)
  const ticks = [0]
  while (ticks[ticks.length - 1] < max) {
    ticks.push(ticks[ticks.length - 1] + step)
    if (ticks.length > 8) break
  }
  return ticks
}
