import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { completedLookback, runDailyProviderSync } from '../api/_lib/openaiProviderDailySync.ts'

const PROJECT = 'proj_haRRNxvf4CVwa2jHugJ762SM'
const SUPABASE = 'https://udbcnpjtwhmjzpjjhoph.supabase.co'

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status })
}

function bucket(date: string, results: unknown[]) {
  const start = Date.parse(`${date}T00:00:00.000Z`) / 1000
  return { start_time: start, end_time: start + 86400, results }
}

function syncFetch(options: { wrongProject?: boolean; rateLimitOnce?: boolean; conflict?: boolean; noops?: boolean; providerStatus?: number } = {}) {
  let imageAttempts = 0
  let appliedBody: Record<string, unknown> | null = null
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString())
    if (url.pathname.endsWith('/rpc/get_openai_provider_sync_context')) {
      return json({ activity_window: [], cost_window: [], october_activity: [], october_cost: [], markup_basis_points: 1500 })
    }
    if (url.pathname.includes('/organization/projects/')) return json({ id: options.wrongProject ? 'proj_wrong' : PROJECT })
    if (url.pathname.endsWith('/usage/images')) {
      imageAttempts += 1
      if (options.rateLimitOnce && imageAttempts === 1) return json({ error: 'rate limited' }, 429)
      if (options.providerStatus) return json({ error: 'provider access denied' }, options.providerStatus)
      return json({ data: [bucket('2026-10-26', [{ project_id: PROJECT, model: 'gpt-image-2.5-sunburst', num_model_requests: 2 }])], has_more: false })
    }
    if (url.pathname.endsWith('/usage/completions')) {
      return json({ data: [bucket('2026-10-27', [{ project_id: PROJECT, model: 'gpt-5.4-mini', num_model_requests: 3 }])], has_more: false })
    }
    if (url.pathname.endsWith('/organization/costs')) {
      return json({ data: [
        bucket('2026-10-26', [{ project_id: PROJECT, amount: { currency: 'usd', value: 0.5 } }]),
        bucket('2026-10-27', [{ project_id: PROJECT, amount: { currency: 'usd', value: 0.4 } }]),
        bucket('2026-10-28', []),
      ], has_more: false })
    }
    if (url.pathname.endsWith('/rpc/apply_daily_openai_provider_sync')) {
      appliedBody = JSON.parse(String(init?.body)) as Record<string, unknown>
      return json([{
        run_id: '11111111-1111-4111-8111-111111111111',
        run_status: options.conflict ? 'conflict' : 'succeeded',
        inserted_activity: options.conflict || options.noops ? 0 : 2,
        inserted_costs: options.conflict || options.noops ? 0 : 3,
        noop_activity: options.noops ? 2 : 0,
        noop_costs: options.noops ? 3 : 0,
        conflict_count: options.conflict ? 1 : 0,
      }])
    }
    if (url.pathname.endsWith('/rpc/record_openai_provider_sync_failure')) return json('22222222-2222-4222-8222-222222222222')
    return json({}, 404)
  }
  return { fetchImpl, imageAttempts: () => imageAttempts, appliedBody: () => appliedBody }
}

test('uses only the previous three completed UTC dates', () => {
  assert.deepEqual(completedLookback(new Date('2026-10-29T14:30:00Z')), {
    start: '2026-10-26', endExclusive: '2026-10-29', dates: ['2026-10-26', '2026-10-27', '2026-10-28'],
  })
})

test('syncs missing rows and represents a verified zero-use completed date', async () => {
  const mock = syncFetch()
  const report = await runDailyProviderSync({
    adminApiKey: 'admin-test-key', cronSecret: 'x'.repeat(64), supabaseUrl: SUPABASE,
    supabasePublishableKey: 'publishable-test-key', now: new Date('2026-10-29T14:30:00Z'), fetchImpl: mock.fetchImpl,
  })
  assert.equal(report.status, 'succeeded')
  assert.deepEqual(report.inserted, { activity: 2, costs: 3 })
  assert.deepEqual(report.range.dates, ['2026-10-26', '2026-10-27', '2026-10-28'])
  const payload = mock.appliedBody()
  assert.equal(Array.isArray(payload?.p_costs) && payload.p_costs.length, 3)
  assert.equal(JSON.stringify(report).includes('admin-test-key'), false)
  assert.equal(JSON.stringify(report).includes('publishable-test-key'), false)
})

test('retries a provider 429 with bounded backoff', async () => {
  const mock = syncFetch({ rateLimitOnce: true })
  await runDailyProviderSync({
    adminApiKey: 'admin-test-key', cronSecret: 'x'.repeat(64), supabaseUrl: SUPABASE,
    supabasePublishableKey: 'publishable-test-key', now: new Date('2026-10-29T14:30:00Z'), fetchImpl: mock.fetchImpl,
  })
  assert.equal(mock.imageAttempts(), 2)
})

test('refuses a wrong OpenAI project before any provider write', async () => {
  const mock = syncFetch({ wrongProject: true })
  await assert.rejects(() => runDailyProviderSync({
    adminApiKey: 'admin-test-key', cronSecret: 'x'.repeat(64), supabaseUrl: SUPABASE,
    supabasePublishableKey: 'publishable-test-key', now: new Date('2026-10-29T14:30:00Z'), fetchImpl: mock.fetchImpl,
  }), /unexpected OpenAI project/)
  assert.equal(mock.appliedBody(), null)
})

test('records conflicts without inserting provider rows', async () => {
  const mock = syncFetch({ conflict: true })
  const report = await runDailyProviderSync({
    adminApiKey: 'admin-test-key', cronSecret: 'x'.repeat(64), supabaseUrl: SUPABASE,
    supabasePublishableKey: 'publishable-test-key', now: new Date('2026-10-29T14:30:00Z'), fetchImpl: mock.fetchImpl,
  })
  assert.equal(report.status, 'conflict')
  assert.deepEqual(report.inserted, { activity: 0, costs: 0 })
})

test('an exact rerun is a no-op with no duplicate inserts', async () => {
  const mock = syncFetch({ noops: true })
  const report = await runDailyProviderSync({
    adminApiKey: 'admin-test-key', cronSecret: 'x'.repeat(64), supabaseUrl: SUPABASE,
    supabasePublishableKey: 'publishable-test-key', now: new Date('2026-10-29T14:30:00Z'), fetchImpl: mock.fetchImpl,
  })
  assert.deepEqual(report.inserted, { activity: 0, costs: 0 })
  assert.deepEqual(report.noops, { activity: 2, costs: 3 })
})

test('provider authorization failure records diagnostics and never applies rows', async () => {
  const mock = syncFetch({ providerStatus: 401 })
  await assert.rejects(() => runDailyProviderSync({
    adminApiKey: 'admin-test-key', cronSecret: 'x'.repeat(64), supabaseUrl: SUPABASE,
    supabasePublishableKey: 'publishable-test-key', now: new Date('2026-10-29T14:30:00Z'), fetchImpl: mock.fetchImpl,
  }), /authentication failed/)
  assert.equal(mock.appliedBody(), null)
})

test('cron and manual endpoints require server or internal-billing-admin authentication', async () => {
  const cron = await readFile(new URL('../api/cron-openai-provider-sync.ts', import.meta.url), 'utf8')
  const manual = await readFile(new URL('../api/openai-provider-sync-run.ts', import.meta.url), 'utf8')
  const config = await readFile(new URL('../vercel.json', import.meta.url), 'utf8')
  assert.match(cron, /timingSafeEqual/)
  assert.match(cron, /process\.env\.CRON_SECRET/)
  assert.match(manual, /authorizeInternalBillingAdmin\(authorization\)/)
  assert.match(config, /"schedule": "0 3 \* \* \*"/)
  assert.doesNotMatch(`${cron}\n${manual}`, /console\.(?:log|warn|error)/)
})

test('database migration limits writes and keeps billing records out of scope', async () => {
  const migration = await readFile(new URL('../supabase/migrations/20261029000000_add_daily_openai_provider_sync.sql', import.meta.url), 'utf8')
  assert.match(migration, /p_start <> p_end - 3/)
  assert.match(migration, /ai_provider_activity_daily/)
  assert.match(migration, /ai_provider_cost_daily/)
  assert.match(migration, /ai_provider_sync_runs/)
  assert.doesNotMatch(migration, /insert into public\.(?:billing_periods|billing_invoices|billing_payments|billing_charge)/i)
})
