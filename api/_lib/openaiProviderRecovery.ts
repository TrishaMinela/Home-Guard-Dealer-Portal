import { createHash } from 'node:crypto'

const OPENAI_API_BASE = 'https://api.openai.com/v1'
export const HGI_OPENAI_PROJECT_ID = 'proj_haRRNxvf4CVwa2jHugJ762SM'
const HGI_BILLING_ACCOUNT_ID = '7791a715-da6b-40bb-8795-4148cecff204'

export const PROVIDER_RECOVERY_WINDOWS = [
  { id: 'oct-01-04', start: '2026-10-01', endExclusive: '2026-10-05', label: 'Oct 1–4, 2026 UTC' },
  { id: 'oct-23-28', start: '2026-10-23', endExclusive: '2026-10-29', label: 'Oct 23–28, 2026 UTC' },
] as const

type RecoveryWindow = (typeof PROVIDER_RECOVERY_WINDOWS)[number]
export type ProviderSyncWindow = { id: string; start: string; endExclusive: string; label: string }
type JsonRecord = Record<string, unknown>
type UsageBucket = { start_time?: number; end_time?: number; results?: JsonRecord[] }
type PageResponse = { data?: UsageBucket[]; has_more?: boolean; next_page?: string | null }

export type ActivityRow = {
  provider: 'openai'
  provider_project_id: string
  usage_date: string
  period_start_at: string
  period_end_at: string
  provider_model: string
  telemetry_model: string
  operation_type: 'image_generation' | 'entrance_analysis' | 'unclassified'
  request_count: number
  input_tokens: number
  output_tokens: number
  cached_input_tokens: number
  text_input_tokens: number
  text_output_tokens: number
  image_input_tokens: number
  image_output_tokens: number
  calculated_estimated_cost_usd: number | null
  source_file_name: string
  source_file_sha256: string
  source_row_sha256: string
}

export type CostRow = {
  provider: 'openai'
  reconciled_project_id: string
  export_project_id: string | null
  usage_date: string
  period_start_at: string
  period_end_at: string
  currency: 'usd'
  actual_cost_usd: number
  scope_verification: 'export_project_id' | 'daily_activity_exact_match'
  source_file_name: string
  source_file_sha256: string
  source_row_sha256: string
}

export type ProviderRecoveryDryRunReport = {
  readOnly: true
  writesPerformed: false
  passed: boolean
  safeToApply: boolean
  range: { id: string; label: string; startInclusive: string; endExclusive: string; timezone: 'UTC' }
  projectAttribution: { verified: boolean; projectId: string }
  datesCovered: string[]
  zeroUsageDates: string[]
  provider: {
    requestCount: number
    imageRequestCount: number
    completionRequestCount: number
    modelRequests: Record<string, number>
    actualCostUsd: number
  }
  existingRows: { activity: number; costs: number }
  wouldInsert: { activity: number; costs: number }
  exactDuplicates: { activity: number; costs: number }
  conflicts: string[]
  idempotent: boolean
  octoberPreview: {
    coveredDates: string[]
    uncoveredDatesThroughOct28: string[]
    providerRequestCountThroughOct28: number
    verifiedProviderCostUsdThroughOct28: number
    provisionalAiUsageChargesUsd: number | null
  }
}

export type ProviderRecoveryApplyReport = Omit<ProviderRecoveryDryRunReport, 'readOnly' | 'writesPerformed'> & {
  readOnly: false
  writesPerformed: boolean
  inserted: { activity: number; costs: number }
  postApply: { activityRows: number; costRows: number; verified: boolean }
}

type RecoveryOptions = {
  start: string
  endExclusive: string
  adminApiKey: string
  supabaseUrl: string
  supabasePublishableKey: string
  accessToken: string
  fetchImpl?: typeof fetch
  onPrepared?: (activity: ActivityRow[], costs: CostRow[], activityInserts: ActivityRow[], costInserts: CostRow[]) => void
}

export function allowedRecoveryWindow(start: string, endExclusive: string): RecoveryWindow | null {
  return PROVIDER_RECOVERY_WINDOWS.find((window) => window.start === start && window.endExclusive === endExclusive) ?? null
}

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex')
const stableJson = (value: unknown): string => JSON.stringify(value, (_key, nested) => {
  if (!nested || typeof nested !== 'object' || Array.isArray(nested)) return nested
  return Object.fromEntries(Object.entries(nested as JsonRecord).sort(([left], [right]) => left.localeCompare(right)))
})
const optionalString = (value: unknown): string | null => typeof value === 'string' && value ? value : null
const nonNegativeInteger = (value: unknown): number => {
  const number = typeof value === 'number' ? value : 0
  if (!Number.isSafeInteger(number) || number < 0) throw new Error('OpenAI returned an invalid usage count.')
  return number
}
const iso = (unixSeconds: number): string => new Date(unixSeconds * 1000).toISOString()
const dateFromUnix = (unixSeconds: number): string => iso(unixSeconds).slice(0, 10)
const roundUsd = (value: number): number => Number(value.toFixed(10))

function calculatedCost(row: Omit<ActivityRow, 'calculated_estimated_cost_usd' | 'source_row_sha256'>): number | null {
  if (row.telemetry_model === 'gpt-image-2.5-sunburst') {
    return (row.text_input_tokens * 5 + row.image_input_tokens * 8 + row.image_output_tokens * 30) / 1_000_000
  }
  if (row.telemetry_model === 'gpt-5.4-mini') {
    return ((row.input_tokens - row.cached_input_tokens) * 0.75 + row.cached_input_tokens * 0.075 + row.output_tokens * 4.5) / 1_000_000
  }
  if (row.telemetry_model === 'gpt-4o-mini') {
    return (row.input_tokens * 0.15 + row.output_tokens * 0.6) / 1_000_000
  }
  return null
}

function canonicalModel(model: string): string {
  if (model.startsWith('gpt-image-2.5')) return 'gpt-image-2.5-sunburst'
  if (model.startsWith('gpt-5.4-mini')) return 'gpt-5.4-mini'
  if (model.startsWith('gpt-4o-mini')) return 'gpt-4o-mini'
  return model
}

function utcDates(start: string, endExclusive: string): string[] {
  const result: string[] = []
  const cursor = new Date(`${start}T00:00:00.000Z`)
  const end = new Date(`${endExclusive}T00:00:00.000Z`)
  while (cursor < end) {
    result.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return result
}

async function readPages(
  pathname: string,
  params: URLSearchParams,
  adminKey: string,
  fetchImpl: typeof fetch,
): Promise<UsageBucket[]> {
  const buckets: UsageBucket[] = []
  const seenPages = new Set<string>()
  let page: string | null = null
  for (let requestNumber = 0; requestNumber < 100; requestNumber += 1) {
    const url = new URL(`${OPENAI_API_BASE}${pathname}`)
    url.search = params.toString()
    if (page) url.searchParams.set('page', page)
    let response: Response | null = null
    for (let attempt = 0; attempt < 3; attempt += 1) {
      response = await fetchImpl(url, {
        headers: { Authorization: `Bearer ${adminKey}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(30_000),
      })
      if (response.status !== 429 || attempt === 2) break
      await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** attempt)))
    }
    if (!response) throw new Error('OpenAI reporting request failed before receiving a response.')
    if (!response.ok) {
      const category = response.status === 401
        ? 'authentication failed or key expired'
        : response.status === 403
          ? 'organization reporting permission denied'
          : `HTTP ${response.status}`
      throw new Error(`OpenAI reporting request failed: ${category}.`)
    }
    const payload = await response.json() as PageResponse
    if (!Array.isArray(payload.data)) throw new Error('OpenAI returned an invalid reporting response.')
    buckets.push(...payload.data)
    if (!payload.has_more) return buckets
    if (!payload.next_page || seenPages.has(payload.next_page)) throw new Error('OpenAI returned invalid pagination.')
    seenPages.add(payload.next_page)
    page = payload.next_page
  }
  throw new Error('OpenAI pagination exceeded the safety limit.')
}

function sourceName(kind: string, window: ProviderSyncWindow): string {
  return `openai-admin-api-${kind}-${window.start}-${window.endExclusive}-exclusive.json`
}

function activityRows(buckets: UsageBucket[], operationSource: 'images' | 'completions', window: ProviderSyncWindow): ActivityRow[] {
  const sourcePayload = stableJson(buckets)
  const sourceHash = sha256(sourcePayload)
  const rows: ActivityRow[] = []
  for (const bucket of buckets) {
    if (!Number.isSafeInteger(bucket.start_time) || !Number.isSafeInteger(bucket.end_time)) throw new Error('OpenAI returned an invalid activity bucket.')
    for (const result of bucket.results ?? []) {
      if (result.project_id !== HGI_OPENAI_PROJECT_ID) throw new Error('OpenAI activity included an unexpected project.')
      const providerModel = optionalString(result.model)?.toLowerCase() ?? 'unknown'
      const telemetryModel = canonicalModel(providerModel)
      if (!['gpt-image-2.5-sunburst', 'gpt-5.4-mini', 'gpt-4o-mini'].includes(telemetryModel)) {
        throw new Error('OpenAI returned an unexpected model for the HGI project.')
      }
      const operation: ActivityRow['operation_type'] = telemetryModel === 'gpt-image-2.5-sunburst'
        ? 'image_generation'
        : telemetryModel === 'gpt-5.4-mini'
          ? 'entrance_analysis'
          : 'unclassified'
      const withoutHash = {
        provider: 'openai' as const,
        provider_project_id: HGI_OPENAI_PROJECT_ID,
        usage_date: dateFromUnix(bucket.start_time as number),
        period_start_at: iso(bucket.start_time as number),
        period_end_at: iso(bucket.end_time as number),
        provider_model: providerModel,
        telemetry_model: telemetryModel,
        operation_type: operation,
        request_count: nonNegativeInteger(result.num_model_requests),
        input_tokens: nonNegativeInteger(result.input_tokens),
        output_tokens: nonNegativeInteger(result.output_tokens),
        cached_input_tokens: nonNegativeInteger(result.input_cached_tokens ?? result.cached_input_tokens),
        text_input_tokens: nonNegativeInteger(result.input_text_tokens),
        text_output_tokens: nonNegativeInteger(result.output_text_tokens),
        image_input_tokens: nonNegativeInteger(result.input_image_tokens),
        image_output_tokens: nonNegativeInteger(result.output_image_tokens),
        source_file_name: sourceName(operationSource, window),
        source_file_sha256: sourceHash,
      }
      const withCost = { ...withoutHash, calculated_estimated_cost_usd: calculatedCost(withoutHash) }
      rows.push({ ...withCost, source_row_sha256: sha256(stableJson(withCost)) })
    }
  }
  return rows
}

function mergeActivity(rows: ActivityRow[]): ActivityRow[] {
  const merged = new Map<string, ActivityRow>()
  for (const row of rows) {
    const key = `${row.usage_date}|${row.provider_model}`
    const existing = merged.get(key)
    if (!existing) {
      merged.set(key, row)
      continue
    }
    const combinedWithoutHash = {
      ...existing,
      request_count: existing.request_count + row.request_count,
      input_tokens: existing.input_tokens + row.input_tokens,
      output_tokens: existing.output_tokens + row.output_tokens,
      cached_input_tokens: existing.cached_input_tokens + row.cached_input_tokens,
      text_input_tokens: existing.text_input_tokens + row.text_input_tokens,
      text_output_tokens: existing.text_output_tokens + row.text_output_tokens,
      image_input_tokens: existing.image_input_tokens + row.image_input_tokens,
      image_output_tokens: existing.image_output_tokens + row.image_output_tokens,
      calculated_estimated_cost_usd: (existing.calculated_estimated_cost_usd ?? 0) + (row.calculated_estimated_cost_usd ?? 0),
      source_file_name: `${existing.source_file_name}+${row.source_file_name}`,
      source_file_sha256: sha256(`${existing.source_file_sha256}|${row.source_file_sha256}`),
    }
    merged.set(key, { ...combinedWithoutHash, source_row_sha256: sha256(stableJson(combinedWithoutHash)) })
  }
  return [...merged.values()].sort((left, right) => `${left.usage_date}|${left.provider_model}`.localeCompare(`${right.usage_date}|${right.provider_model}`))
}

function calculatedDailyCost(rows: ActivityRow[], usageDate: string): number {
  return rows
    .filter((row) => row.usage_date === usageDate)
    .reduce((sum, row) => sum + (row.calculated_estimated_cost_usd ?? 0), 0)
}

function costRows(buckets: UsageBucket[], rows: ActivityRow[], window: ProviderSyncWindow): CostRow[] {
  const sourcePayload = stableJson(buckets)
  const sourceHash = sha256(sourcePayload)
  const result: CostRow[] = []
  for (const bucket of buckets) {
    if (!Number.isSafeInteger(bucket.start_time) || !Number.isSafeInteger(bucket.end_time)) throw new Error('OpenAI returned an invalid cost bucket.')
    const usageDate = dateFromUnix(bucket.start_time as number)
    let actualCost = 0
    let directlyAttributed = true
    for (const item of bucket.results ?? []) {
      const projectId = optionalString(item.project_id)
      if (projectId && projectId !== HGI_OPENAI_PROJECT_ID) throw new Error('OpenAI costs included an unexpected project.')
      if (!projectId) directlyAttributed = false
      const amount = item.amount as JsonRecord | undefined
      if (amount?.currency !== 'usd' || typeof amount.value !== 'number' || amount.value < 0) {
        throw new Error('OpenAI returned an invalid cost amount.')
      }
      actualCost += amount.value
    }
    if (!directlyAttributed) {
      const calculated = calculatedDailyCost(rows, usageDate)
      if (!Number.isFinite(calculated) || Math.abs(actualCost - calculated) > 0.000000001) {
        throw new Error(`Provider cost attribution could not be proven for ${usageDate}.`)
      }
    }
    const withoutHash = {
      provider: 'openai' as const,
      reconciled_project_id: HGI_OPENAI_PROJECT_ID,
      export_project_id: directlyAttributed ? HGI_OPENAI_PROJECT_ID : null,
      usage_date: usageDate,
      period_start_at: iso(bucket.start_time as number),
      period_end_at: iso(bucket.end_time as number),
      currency: 'usd' as const,
      actual_cost_usd: roundUsd(actualCost),
      scope_verification: directlyAttributed ? 'export_project_id' as const : 'daily_activity_exact_match' as const,
      source_file_name: sourceName('costs', window),
      source_file_sha256: sourceHash,
    }
    result.push({ ...withoutHash, source_row_sha256: sha256(stableJson(withoutHash)) })
  }
  return result
}

async function supabaseRows(
  table: string,
  select: string,
  start: string,
  endExclusive: string,
  supabaseUrl: string,
  publishableKey: string,
  accessToken: string,
  fetchImpl: typeof fetch,
): Promise<JsonRecord[]> {
  const params = new URLSearchParams({ select, usage_date: `gte.${start}`, order: 'usage_date.asc' })
  params.append('usage_date', `lt.${endExclusive}`)
  const response = await fetchImpl(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/${table}?${params}`, {
    headers: { apikey: publishableKey, Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) throw new Error(`Existing ${table} data could not be read (${response.status}).`)
  return response.json() as Promise<JsonRecord[]>
}

async function pricingMarkup(
  supabaseUrl: string,
  publishableKey: string,
  accessToken: string,
  fetchImpl: typeof fetch,
): Promise<number | null> {
  const params = new URLSearchParams({
    select: 'markup_basis_points,effective_from,effective_until',
    billing_account_id: `eq.${HGI_BILLING_ACCOUNT_ID}`,
    pricing_scope: 'eq.ai_visualizer',
    currency: 'eq.usd',
    effective_from: 'lte.2026-10-01',
    order: 'effective_from.desc',
    limit: '1',
  })
  const response = await fetchImpl(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/billing_pricing_versions?${params}`, {
    headers: { apikey: publishableKey, Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) return null
  const rows = await response.json() as Array<{ markup_basis_points?: number; effective_until?: string | null }>
  const pricing = rows[0]
  if (!pricing || pricing.effective_until && pricing.effective_until <= '2026-10-01') return null
  return typeof pricing.markup_basis_points === 'number' ? pricing.markup_basis_points : null
}

function planRows<T extends { source_row_sha256: string }>(
  candidates: T[],
  existing: JsonRecord[],
  key: (row: T | JsonRecord) => string,
  equivalent: (candidate: T, existing: JsonRecord) => boolean,
): { inserts: T[]; exact: number; conflicts: string[] } {
  const existingByKey = new Map(existing.map((row) => [key(row), row]))
  const inserts: T[] = []
  let exact = 0
  const conflicts: string[] = []
  for (const candidate of candidates) {
    const naturalKey = key(candidate)
    const current = existingByKey.get(naturalKey)
    if (!current) inserts.push(candidate)
    else if (equivalent(candidate, current)) exact += 1
    else conflicts.push(naturalKey)
  }
  return { inserts, exact, conflicts }
}

async function runProviderWindowDryRun(options: RecoveryOptions, window: ProviderSyncWindow): Promise<ProviderRecoveryDryRunReport> {
  if (!options.adminApiKey) throw new Error('The server-only OpenAI Admin credential is not configured.')
  const expectedRef = new URL(options.supabaseUrl).hostname.split('.')[0]
  if (expectedRef !== 'udbcnpjtwhmjzpjjhoph') throw new Error('The server is connected to the wrong Supabase project.')

  const fetchImpl = options.fetchImpl ?? fetch
  const projectResponse = await fetchImpl(`${OPENAI_API_BASE}/organization/projects/${encodeURIComponent(HGI_OPENAI_PROJECT_ID)}`, {
    headers: { Authorization: `Bearer ${options.adminApiKey}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  })
  if (!projectResponse.ok) throw new Error(`OpenAI project verification failed (HTTP ${projectResponse.status}).`)
  const project = await projectResponse.json() as JsonRecord
  if (project.id !== HGI_OPENAI_PROJECT_ID) throw new Error('The Admin credential returned an unexpected OpenAI project.')

  const start = Date.parse(`${window.start}T00:00:00.000Z`) / 1000
  const end = Date.parse(`${window.endExclusive}T00:00:00.000Z`) / 1000
  const usageParams = new URLSearchParams({ start_time: String(start), end_time: String(end), bucket_width: '1d', limit: '31' })
  usageParams.append('project_ids[]', HGI_OPENAI_PROJECT_ID)
  usageParams.append('group_by[]', 'project_id')
  usageParams.append('group_by[]', 'model')
  const costParams = new URLSearchParams(usageParams)
  costParams.delete('group_by[]')
  costParams.append('group_by[]', 'project_id')
  costParams.append('group_by[]', 'line_item')

  const [images, completions, costs, existingActivity, existingCosts, octoberActivity, octoberCosts, markupBasisPoints] = await Promise.all([
    readPages('/organization/usage/images', usageParams, options.adminApiKey, fetchImpl),
    readPages('/organization/usage/completions', usageParams, options.adminApiKey, fetchImpl),
    readPages('/organization/costs', costParams, options.adminApiKey, fetchImpl),
    supabaseRows('ai_provider_activity_daily', 'provider,provider_project_id,usage_date,provider_model,request_count,source_row_sha256', window.start, window.endExclusive, options.supabaseUrl, options.supabasePublishableKey, options.accessToken, fetchImpl),
    supabaseRows('ai_provider_cost_daily', 'provider,reconciled_project_id,usage_date,currency,actual_cost_usd,source_row_sha256', window.start, window.endExclusive, options.supabaseUrl, options.supabasePublishableKey, options.accessToken, fetchImpl),
    supabaseRows('ai_provider_activity_daily', 'provider,provider_project_id,usage_date,provider_model,request_count', '2026-10-01', '2026-10-29', options.supabaseUrl, options.supabasePublishableKey, options.accessToken, fetchImpl),
    supabaseRows('ai_provider_cost_daily', 'provider,reconciled_project_id,usage_date,currency,actual_cost_usd', '2026-10-01', '2026-10-29', options.supabaseUrl, options.supabasePublishableKey, options.accessToken, fetchImpl),
    pricingMarkup(options.supabaseUrl, options.supabasePublishableKey, options.accessToken, fetchImpl),
  ])

  const activity = mergeActivity([...activityRows(images, 'images', window), ...activityRows(completions, 'completions', window)])
  const cost = costRows(costs, activity, window)
  const dates = utcDates(window.start, window.endExclusive)
  const returnedCostDates = new Set(cost.map((row) => row.usage_date))
  if (dates.some((date) => !returnedCostDates.has(date))) throw new Error('OpenAI Costs did not explicitly cover every requested UTC date.')

  const activityPlan = planRows(
    activity,
    existingActivity,
    (row) => `${row.provider}|${row.provider_project_id}|${row.usage_date}|${row.provider_model}`,
    (candidate, current) => Number(current.request_count) === candidate.request_count,
  )
  const costPlan = planRows(
    cost,
    existingCosts,
    (row) => `${row.provider}|${row.reconciled_project_id}|${row.usage_date}|${row.currency}`,
    (candidate, current) => Math.abs(Number(current.actual_cost_usd) - candidate.actual_cost_usd) <= 0.000000001,
  )
  const conflicts = [...activityPlan.conflicts.map((key) => `activity:${key}`), ...costPlan.conflicts.map((key) => `cost:${key}`)]
  options.onPrepared?.(activity, cost, activityPlan.inserts, costPlan.inserts)

  const activityByKey = new Map(octoberActivity.map((row) => [`${row.usage_date}|${row.provider_model}`, Number(row.request_count ?? 0)]))
  for (const row of activity) if (!activityByKey.has(`${row.usage_date}|${row.provider_model}`)) activityByKey.set(`${row.usage_date}|${row.provider_model}`, row.request_count)
  const costsByDate = new Map(octoberCosts.map((row) => [String(row.usage_date), Number(row.actual_cost_usd ?? 0)]))
  for (const row of cost) if (!costsByDate.has(row.usage_date)) costsByDate.set(row.usage_date, row.actual_cost_usd)
  const coveredDates = [...costsByDate.keys()].sort()
  const totalCost = roundUsd([...costsByDate.values()].reduce((sum, value) => sum + value, 0))
  const totalRequests = [...activityByKey.values()].reduce((sum, value) => sum + value, 0)
  const provisionalCharge = markupBasisPoints === null ? null : Math.round(totalCost * (1 + markupBasisPoints / 10_000) * 100) / 100
  const modelRequests = Object.fromEntries([...new Set(activity.map((row) => row.telemetry_model))].sort().map((model) => [model, activity.filter((row) => row.telemetry_model === model).reduce((sum, row) => sum + row.request_count, 0)]))
  const requestCount = activity.reduce((sum, row) => sum + row.request_count, 0)
  const imageRequestCount = activity.filter((row) => row.operation_type === 'image_generation').reduce((sum, row) => sum + row.request_count, 0)
  const completionRequestCount = requestCount - imageRequestCount

  return {
    readOnly: true,
    writesPerformed: false,
    passed: conflicts.length === 0,
    safeToApply: conflicts.length === 0,
    range: { id: window.id, label: window.label, startInclusive: `${window.start}T00:00:00.000Z`, endExclusive: `${window.endExclusive}T00:00:00.000Z`, timezone: 'UTC' },
    projectAttribution: { verified: true, projectId: HGI_OPENAI_PROJECT_ID },
    datesCovered: dates,
    zeroUsageDates: dates.filter((date) => !activity.some((row) => row.usage_date === date && row.request_count > 0)),
    provider: { requestCount, imageRequestCount, completionRequestCount, modelRequests, actualCostUsd: roundUsd(cost.reduce((sum, row) => sum + row.actual_cost_usd, 0)) },
    existingRows: { activity: existingActivity.length, costs: existingCosts.length },
    wouldInsert: { activity: activityPlan.inserts.length, costs: costPlan.inserts.length },
    exactDuplicates: { activity: activityPlan.exact, costs: costPlan.exact },
    conflicts,
    idempotent: conflicts.length === 0,
    octoberPreview: {
      coveredDates,
      uncoveredDatesThroughOct28: utcDates('2026-10-01', '2026-10-29').filter((date) => !costsByDate.has(date)),
      providerRequestCountThroughOct28: totalRequests,
      verifiedProviderCostUsdThroughOct28: totalCost,
      provisionalAiUsageChargesUsd: provisionalCharge,
    },
  }
}

export async function runProviderRecoveryDryRun(options: RecoveryOptions): Promise<ProviderRecoveryDryRunReport> {
  const window = allowedRecoveryWindow(options.start, options.endExclusive)
  if (!window) throw new Error('The requested recovery window is not allowed.')
  return runProviderWindowDryRun(options, window)
}

export async function runProviderSyncDryRun(
  options: RecoveryOptions & { now?: Date },
): Promise<ProviderRecoveryDryRunReport> {
  const now = options.now ?? new Date()
  const todayUtc = now.toISOString().slice(0, 10)
  const dates = utcDates(options.start, options.endExclusive)
  if (options.endExclusive !== todayUtc || dates.length !== 3) {
    throw new Error('Daily provider sync must inspect exactly the previous three completed UTC dates.')
  }
  const window: ProviderSyncWindow = {
    id: 'daily-three-day-lookback',
    start: options.start,
    endExclusive: options.endExclusive,
    label: `${options.start} through ${dates.at(-1)} UTC`,
  }
  return runProviderWindowDryRun(options, window)
}

const EXPECTED_RECOVERY = {
  'oct-01-04': { requests: 103, cost: 3.99489145, activityRows: 6, costRows: 4 },
  'oct-23-28': { requests: 50, cost: 4.20780675, activityRows: 6, costRows: 6 },
} as const

async function applyRowsWithRpc(
  activity: ActivityRow[],
  costs: CostRow[],
  start: string,
  endExclusive: string,
  supabaseUrl: string,
  publishableKey: string,
  accessToken: string,
  fetchImpl: typeof fetch,
): Promise<{ activity: number; costs: number }> {
  const response = await fetchImpl(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc/apply_verified_openai_provider_recovery`, {
    method: 'POST',
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_activity: activity, p_costs: costs, p_start: start, p_end: endExclusive }),
  })
  if (!response.ok) throw new Error(`Verified provider rows could not be imported transactionally (${response.status}).`)
  const rows = await response.json() as Array<{ inserted_activity?: number; inserted_costs?: number }>
  return { activity: Number(rows[0]?.inserted_activity ?? 0), costs: Number(rows[0]?.inserted_costs ?? 0) }
}

export async function applyProviderRecovery(options: {
  start: string
  endExclusive: string
  adminApiKey: string
  supabaseUrl: string
  supabasePublishableKey: string
  accessToken: string
  fetchImpl?: typeof fetch
}): Promise<ProviderRecoveryApplyReport> {
  const window = allowedRecoveryWindow(options.start, options.endExclusive)
  if (!window) throw new Error('The requested recovery window is not allowed.')
  const fetchImpl = options.fetchImpl ?? fetch
  let allActivity: ActivityRow[] = []
  let allCosts: CostRow[] = []
  const dryRun = await runProviderRecoveryDryRun({
    start: window.start,
    endExclusive: window.endExclusive,
    adminApiKey: options.adminApiKey,
    supabaseUrl: options.supabaseUrl,
    supabasePublishableKey: options.supabasePublishableKey,
    accessToken: options.accessToken,
    fetchImpl,
    onPrepared: (activity, costs) => {
      allActivity = activity
      allCosts = costs
    },
  })
  const expected = EXPECTED_RECOVERY[window.id]
  if (!dryRun.safeToApply || dryRun.conflicts.length) throw new Error('The recovery import was blocked by a reconciliation conflict.')
  if (dryRun.provider.requestCount !== expected.requests || Math.abs(dryRun.provider.actualCostUsd - expected.cost) > 0.000000001) {
    throw new Error('The provider totals changed from the approved recovery dry run; no rows were written.')
  }
  if (dryRun.wouldInsert.activity > expected.activityRows || dryRun.wouldInsert.costs > expected.costRows) {
    throw new Error('The recovery row count exceeded the approved import; no rows were written.')
  }

  const inserted = dryRun.wouldInsert.activity === 0 && dryRun.wouldInsert.costs === 0
    ? { activity: 0, costs: 0 }
    : await applyRowsWithRpc(allActivity, allCosts, window.start, window.endExclusive, options.supabaseUrl, options.supabasePublishableKey, options.accessToken, fetchImpl)
  const [postActivity, postCosts] = await Promise.all([
    supabaseRows('ai_provider_activity_daily', 'provider,provider_project_id,usage_date,provider_model,request_count', window.start, window.endExclusive, options.supabaseUrl, options.supabasePublishableKey, options.accessToken, fetchImpl),
    supabaseRows('ai_provider_cost_daily', 'provider,reconciled_project_id,usage_date,currency,actual_cost_usd', window.start, window.endExclusive, options.supabaseUrl, options.supabasePublishableKey, options.accessToken, fetchImpl),
  ])
  const verified = postActivity.length === expected.activityRows
    && postCosts.length === expected.costRows
    && postActivity.reduce((sum, row) => sum + Number(row.request_count ?? 0), 0) === expected.requests
    && Math.abs(postCosts.reduce((sum, row) => sum + Number(row.actual_cost_usd ?? 0), 0) - expected.cost) <= 0.000000001
  if (!verified) throw new Error('Post-import verification did not match the approved provider recovery totals.')

  return {
    ...dryRun,
    readOnly: false,
    writesPerformed: inserted.activity > 0 || inserted.costs > 0,
    inserted,
    postApply: { activityRows: postActivity.length, costRows: postCosts.length, verified },
  }
}
