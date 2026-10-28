import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  allowedRecoveryWindow,
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

test('the endpoint has no mutation mode and uses HGI admin authorization', async () => {
  const source = await readFile(new URL('../api/openai-provider-recovery-dry-run.ts', import.meta.url), 'utf8')
  assert.match(source, /authorizeHgiAdmin\(authorization\)/)
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
