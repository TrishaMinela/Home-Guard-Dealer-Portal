import {
  runProviderSyncDryRun,
  type ActivityRow,
  type CostRow,
  type ProviderRecoveryDryRunReport,
} from './openaiProviderRecovery.ts'

type JsonRecord = Record<string, unknown>

type SyncContext = {
  activity_window: JsonRecord[]
  cost_window: JsonRecord[]
  october_activity: JsonRecord[]
  october_cost: JsonRecord[]
  markup_basis_points: number | null
}

export type DailyProviderSyncReport = {
  status: 'succeeded' | 'conflict'
  runId: string
  range: { start: string; endExclusive: string; dates: string[] }
  provider: ProviderRecoveryDryRunReport['provider']
  inserted: { activity: number; costs: number }
  noops: { activity: number; costs: number }
  conflicts: string[]
  latestVerifiedCoverageDate: string | null
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function addUtcDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

export function completedLookback(now = new Date()): { start: string; endExclusive: string; dates: string[] } {
  const today = new Date(`${isoDate(now)}T00:00:00.000Z`)
  const start = addUtcDays(today, -3)
  return {
    start: isoDate(start),
    endExclusive: isoDate(today),
    dates: [isoDate(start), isoDate(addUtcDays(start, 1)), isoDate(addUtcDays(start, 2))],
  }
}

function headers(publishableKey: string) {
  return { apikey: publishableKey, Authorization: `Bearer ${publishableKey}`, 'Content-Type': 'application/json' }
}

async function rpc<T>(
  name: string,
  body: JsonRecord,
  supabaseUrl: string,
  publishableKey: string,
  fetchImpl: typeof fetch,
): Promise<T> {
  const response = await fetchImpl(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: headers(publishableKey), body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`Provider sync database operation failed (${response.status}).`)
  return response.json() as Promise<T>
}

function contextFetch(context: SyncContext, supabaseUrl: string, fetchImpl: typeof fetch): typeof fetch {
  const host = new URL(supabaseUrl).host
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString())
    if (url.host !== host) return fetchImpl(input, init)
    if (url.pathname.endsWith('/ai_provider_activity_daily')) {
      const preview = url.searchParams.getAll('usage_date').includes('lt.2026-10-29')
      return Response.json(preview ? context.october_activity : context.activity_window)
    }
    if (url.pathname.endsWith('/ai_provider_cost_daily')) {
      const preview = url.searchParams.getAll('usage_date').includes('lt.2026-10-29')
      return Response.json(preview ? context.october_cost : context.cost_window)
    }
    if (url.pathname.endsWith('/billing_pricing_versions')) {
      return Response.json(context.markup_basis_points === null ? [] : [{
        markup_basis_points: context.markup_basis_points,
        effective_from: '2026-10-01',
        effective_until: null,
      }])
    }
    return fetchImpl(input, init)
  }
}

function safeErrorCategory(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  if (/401|authentication|expired/i.test(message)) return 'openai_authentication_failed'
  if (/403|permission/i.test(message)) return 'openai_permission_denied'
  if (/429/i.test(message)) return 'openai_rate_limited'
  if (/conflict/i.test(message)) return 'provider_reconciliation_conflict'
  return 'provider_sync_failed'
}

async function recordFailure(
  secret: string,
  range: ReturnType<typeof completedLookback>,
  error: unknown,
  supabaseUrl: string,
  publishableKey: string,
  fetchImpl: typeof fetch,
): Promise<void> {
  const message = error instanceof Error ? error.message : 'Provider synchronization failed.'
  try {
    await rpc('record_openai_provider_sync_failure', {
      p_secret: secret,
      p_start: range.start,
      p_end: range.endExclusive,
      p_category: safeErrorCategory(error),
      p_message: message.slice(0, 300),
    }, supabaseUrl, publishableKey, fetchImpl)
  } catch {
    // The original failure remains authoritative. Never leak credentials while reporting it.
  }
}

export async function runDailyProviderSync(options: {
  adminApiKey: string
  cronSecret: string
  supabaseUrl: string
  supabasePublishableKey: string
  now?: Date
  fetchImpl?: typeof fetch
}): Promise<DailyProviderSyncReport> {
  const fetchImpl = options.fetchImpl ?? fetch
  const range = completedLookback(options.now)
  if (!options.adminApiKey || !options.cronSecret) throw new Error('Provider sync server credentials are not configured.')
  if (new URL(options.supabaseUrl).hostname.split('.')[0] !== 'udbcnpjtwhmjzpjjhoph') {
    throw new Error('The server is connected to the wrong Supabase project.')
  }

  try {
    const context = await rpc<SyncContext>('get_openai_provider_sync_context', {
      p_secret: options.cronSecret, p_start: range.start, p_end: range.endExclusive,
    }, options.supabaseUrl, options.supabasePublishableKey, fetchImpl)
    let activity: ActivityRow[] = []
    let costs: CostRow[] = []
    const dryRun = await runProviderSyncDryRun({
      start: range.start,
      endExclusive: range.endExclusive,
      now: options.now,
      adminApiKey: options.adminApiKey,
      supabaseUrl: options.supabaseUrl,
      supabasePublishableKey: options.supabasePublishableKey,
      accessToken: options.supabasePublishableKey,
      fetchImpl: contextFetch(context, options.supabaseUrl, fetchImpl),
      onPrepared: (preparedActivity, preparedCosts) => {
        activity = preparedActivity
        costs = preparedCosts
      },
    })

    const applied = await rpc<Array<{
      run_id: string
      run_status: 'succeeded' | 'conflict'
      inserted_activity: number
      inserted_costs: number
      noop_activity: number
      noop_costs: number
      conflict_count: number
    }>>('apply_daily_openai_provider_sync', {
      p_secret: options.cronSecret,
      p_activity: activity,
      p_costs: costs,
      p_start: range.start,
      p_end: range.endExclusive,
      p_provider_request_count: dryRun.provider.requestCount,
      p_provider_cost_usd: dryRun.provider.actualCostUsd,
    }, options.supabaseUrl, options.supabasePublishableKey, fetchImpl)
    const result = applied[0]
    if (!result) throw new Error('Provider sync database operation returned no result.')
    return {
      status: result.run_status,
      runId: result.run_id,
      range,
      provider: dryRun.provider,
      inserted: { activity: result.inserted_activity, costs: result.inserted_costs },
      noops: { activity: result.noop_activity, costs: result.noop_costs },
      conflicts: result.conflict_count ? dryRun.conflicts : [],
      latestVerifiedCoverageDate: range.dates.at(-1) ?? null,
    }
  } catch (error) {
    await recordFailure(options.cronSecret, range, error, options.supabaseUrl, options.supabasePublishableKey, fetchImpl)
    throw error
  }
}
