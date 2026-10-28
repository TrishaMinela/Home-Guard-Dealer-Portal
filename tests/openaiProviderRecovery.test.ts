import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  allowedRecoveryWindow,
  applyProviderRecovery,
  runProviderRecoveryDryRun,
} from '../api/_lib/openaiProviderRecovery.ts'

const HGI_PROJECT = 'proj_haRRNxvf4CVwa2jHugJ762SM'

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
}

function bucket(date: string, results: unknown[]) {
  const start = Date.parse(`${date}T00:00:00.000Z`) / 1000
  return { start_time: start, end_time: start + 86400, results }
}

function recoveryFetch(): typeof fetch {
  return async (input) => {
    const url = new URL(input instanceof Request ? input.url : input.toString())
    if (url.hostname === 'api.openai.com' && url.pathname.includes('/organization/projects/')) {
      return json({ id: HGI_PROJECT })
    }
    if (url.pathname.endsWith('/usage/images')) {
      return json({ data: [bucket('2026-10-01', [{ project_id: HGI_PROJECT, model: 'gpt-image-2.5-sunburst', num_model_requests: 2 }])], has_more: false })
    }
    if (url.pathname.endsWith('/usage/completions')) {
      return json({ data: [bucket('2026-10-02', [{ project_id: HGI_PROJECT, model: 'gpt-5.4-mini', num_model_requests: 3 }])], has_more: false })
    }
    if (url.pathname.endsWith('/organization/costs')) {
      return json({ data: [
        bucket('2026-10-01', [{ project_id: HGI_PROJECT, amount: { currency: 'usd', value: 0.6 } }]),
        bucket('2026-10-02', [{ project_id: HGI_PROJECT, amount: { currency: 'usd', value: 0.4 } }]),
        bucket('2026-10-03', []),
        bucket('2026-10-04', []),
      ], has_more: false })
    }
    if (url.pathname.endsWith('/billing_pricing_versions')) {
      return json([{ markup_basis_points: 1500, effective_from: '2026-10-01', effective_until: null }])
    }
    if (url.pathname.endsWith('/ai_provider_activity_daily')) {
      const isOctoberPreview = url.searchParams.getAll('usage_date').includes('gte.2026-10-01')
        && url.searchParams.getAll('usage_date').includes('lt.2026-10-29')
      return json(isOctoberPreview ? [{ provider: 'openai', provider_project_id: HGI_PROJECT, usage_date: '2026-10-05', provider_model: 'gpt-image-2.5-sunburst', request_count: 300 }] : [])
    }
    if (url.pathname.endsWith('/ai_provider_cost_daily')) {
      const isOctoberPreview = url.searchParams.getAll('usage_date').includes('gte.2026-10-01')
        && url.searchParams.getAll('usage_date').includes('lt.2026-10-29')
      return json(isOctoberPreview ? [{ provider: 'openai', reconciled_project_id: HGI_PROJECT, usage_date: '2026-10-05', currency: 'usd', actual_cost_usd: 16.41474045 }] : [])
    }
    return json({}, 404)
  }
}

test('accepts only the two approved recovery windows', () => {
  assert.equal(allowedRecoveryWindow('2026-10-01', '2026-10-05')?.id, 'oct-01-04')
  assert.equal(allowedRecoveryWindow('2026-10-23', '2026-10-29')?.id, 'oct-23-28')
  assert.equal(allowedRecoveryWindow('2026-10-01', '2026-10-06'), null)
  assert.equal(allowedRecoveryWindow('2026-10-05', '2026-10-23'), null)
})

test('returns a read-only, project-attributed recovery plan with zero-use dates', async () => {
  const report = await runProviderRecoveryDryRun({
    start: '2026-10-01',
    endExclusive: '2026-10-05',
    adminApiKey: 'server-test-key',
    supabaseUrl: 'https://udbcnpjtwhmjzpjjhoph.supabase.co',
    supabasePublishableKey: 'publishable-test-key',
    accessToken: 'admin-session-test-token',
    fetchImpl: recoveryFetch(),
  })
  assert.equal(report.readOnly, true)
  assert.equal(report.writesPerformed, false)
  assert.equal(report.projectAttribution.verified, true)
  assert.equal(report.provider.requestCount, 5)
  assert.equal(report.provider.imageRequestCount, 2)
  assert.equal(report.provider.completionRequestCount, 3)
  assert.equal(report.provider.actualCostUsd, 1)
  assert.deepEqual(report.zeroUsageDates, ['2026-10-03', '2026-10-04'])
  assert.deepEqual(report.wouldInsert, { activity: 2, costs: 4 })
  assert.deepEqual(report.conflicts, [])
  assert.equal(report.octoberPreview.providerRequestCountThroughOct28, 305)
  assert.equal(report.octoberPreview.verifiedProviderCostUsdThroughOct28, 17.41474045)
  assert.equal(report.octoberPreview.provisionalAiUsageChargesUsd, 20.03)
})

test('rejects a wrong Supabase project before provider access', async () => {
  await assert.rejects(() => runProviderRecoveryDryRun({
    start: '2026-10-01',
    endExclusive: '2026-10-05',
    adminApiKey: 'server-test-key',
    supabaseUrl: 'https://wrong-project.supabase.co',
    supabasePublishableKey: 'publishable-test-key',
    accessToken: 'admin-session-test-token',
    fetchImpl: recoveryFetch(),
  }), /wrong Supabase project/)
})

test('the endpoint has no mutation mode and uses internal billing authorization', async () => {
  const source = await readFile(new URL('../api/openai-provider-recovery-dry-run.ts', import.meta.url), 'utf8')
  assert.match(source, /authorizeInternalBillingAdmin\(authorization\)/)
  assert.match(source, /allowedRecoveryWindow/)
  assert.doesNotMatch(source, /--apply|apply\s*=|method:\s*['"](?:POST|PATCH|PUT|DELETE)['"].*rest\/v1/s)
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.doesNotMatch(source, /console\.(?:log|error|warn)/)
})

test('sanitized reports do not contain credentials', async () => {
  const report = await runProviderRecoveryDryRun({
    start: '2026-10-01',
    endExclusive: '2026-10-05',
    adminApiKey: 'server-test-key',
    supabaseUrl: 'https://udbcnpjtwhmjzpjjhoph.supabase.co',
    supabasePublishableKey: 'publishable-test-key',
    accessToken: 'admin-session-test-token',
    fetchImpl: recoveryFetch(),
  })
  const serialized = JSON.stringify(report)
  assert.equal(serialized.includes('server-test-key'), false)
  assert.equal(serialized.includes('admin-session-test-token'), false)
  assert.equal(serialized.includes('publishable-test-key'), false)
})

test('imports approved rows once and is idempotent on the second run', async () => {
  let storedActivity: Array<Record<string, unknown>> = []
  let storedCosts: Array<Record<string, unknown>> = []
  let rpcCalls = 0
  const base = recoveryFetch()
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString())
    if (url.pathname.endsWith('/usage/images')) {
      return json({ data: [
        bucket('2026-10-01', [{ project_id: HGI_PROJECT, model: 'gpt-image-2.5-sunburst', num_model_requests: 10 }]),
        bucket('2026-10-02', [{ project_id: HGI_PROJECT, model: 'gpt-image-2.5-sunburst', num_model_requests: 10 }]),
        bucket('2026-10-04', [{ project_id: HGI_PROJECT, model: 'gpt-image-2.5-sunburst', num_model_requests: 13 }]),
      ], has_more: false })
    }
    if (url.pathname.endsWith('/usage/completions')) {
      return json({ data: [
        bucket('2026-10-01', [{ project_id: HGI_PROJECT, model: 'gpt-5.4-mini', num_model_requests: 20 }]),
        bucket('2026-10-02', [{ project_id: HGI_PROJECT, model: 'gpt-5.4-mini', num_model_requests: 20 }]),
        bucket('2026-10-04', [{ project_id: HGI_PROJECT, model: 'gpt-5.4-mini', num_model_requests: 30 }]),
      ], has_more: false })
    }
    if (url.pathname.endsWith('/organization/costs')) {
      return json({ data: [
        bucket('2026-10-01', [{ project_id: HGI_PROJECT, amount: { currency: 'usd', value: 0.9 } }]),
        bucket('2026-10-02', [{ project_id: HGI_PROJECT, amount: { currency: 'usd', value: 1 } }]),
        bucket('2026-10-03', []),
        bucket('2026-10-04', [{ project_id: HGI_PROJECT, amount: { currency: 'usd', value: 2.09489145 } }]),
      ], has_more: false })
    }
    if (url.pathname.endsWith('/rpc/apply_verified_openai_provider_recovery') && init?.method === 'POST') {
      rpcCalls += 1
      const payload = JSON.parse(String(init.body)) as { p_activity: Array<Record<string, unknown>>; p_costs: Array<Record<string, unknown>> }
      const newActivity = payload.p_activity.filter((candidate) => !storedActivity.some((current) => current.usage_date === candidate.usage_date && current.provider_model === candidate.provider_model))
      const newCosts = payload.p_costs.filter((candidate) => !storedCosts.some((current) => current.usage_date === candidate.usage_date))
      storedActivity.push(...newActivity)
      storedCosts.push(...newCosts)
      return json([{ inserted_activity: newActivity.length, inserted_costs: newCosts.length }])
    }
    if (url.pathname.endsWith('/ai_provider_activity_daily')) {
      const isPreview = url.searchParams.getAll('usage_date').includes('lt.2026-10-29')
      return json(isPreview
        ? [{ provider: 'openai', provider_project_id: HGI_PROJECT, usage_date: '2026-10-05', provider_model: 'gpt-image-2.5-sunburst', request_count: 300 }, ...storedActivity]
        : storedActivity)
    }
    if (url.pathname.endsWith('/ai_provider_cost_daily')) {
      const isPreview = url.searchParams.getAll('usage_date').includes('lt.2026-10-29')
      return json(isPreview
        ? [{ provider: 'openai', reconciled_project_id: HGI_PROJECT, usage_date: '2026-10-05', currency: 'usd', actual_cost_usd: 16.41474045 }, ...storedCosts]
        : storedCosts)
    }
    return base(input, init)
  }

  const options = {
    start: '2026-10-01',
    endExclusive: '2026-10-05',
    adminApiKey: 'server-test-key',
    supabaseUrl: 'https://udbcnpjtwhmjzpjjhoph.supabase.co',
    supabasePublishableKey: 'publishable-test-key',
    accessToken: 'admin-session-test-token',
    fetchImpl,
  }
  const first = await applyProviderRecovery(options)
  assert.deepEqual(first.inserted, { activity: 6, costs: 4 })
  assert.equal(first.postApply.verified, true)
  const second = await applyProviderRecovery(options)
  assert.deepEqual(second.inserted, { activity: 0, costs: 0 })
  assert.equal(second.writesPerformed, false)
  assert.equal(storedActivity.length, 6)
  assert.equal(storedCosts.length, 4)
  assert.equal(rpcCalls, 1)
})

test('the import endpoint is allowlisted and requires internal billing authorization', async () => {
  const source = await readFile(new URL('../api/openai-provider-recovery-import.ts', import.meta.url), 'utf8')
  assert.match(source, /authorizeInternalBillingAdmin\(authorization\)/)
  assert.match(source, /allowedRecoveryWindow/)
  assert.match(source, /applyProviderRecovery/)
  assert.doesNotMatch(source, /console\.(?:log|error|warn)/)
})
