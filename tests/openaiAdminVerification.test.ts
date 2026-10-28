import assert from 'node:assert/strict'
import test from 'node:test'
import {
  HGI_OPENAI_PROJECT_ID,
  canonicalModel,
  verifyOpenAiAdminConnection,
} from '../api/_lib/openaiAdminVerification.ts'

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function requestUrl(input: string | URL | Request): URL {
  if (input instanceof URL) return input
  return new URL(typeof input === 'string' ? input : input.url)
}

function successfulFetch(): typeof fetch {
  return async (input) => {
    const url = requestUrl(input)
    if (url.pathname.endsWith(`/projects/${HGI_OPENAI_PROJECT_ID}`)) {
      return jsonResponse({ id: HGI_OPENAI_PROJECT_ID, name: 'HGI', status: 'active' })
    }
    if (url.pathname.endsWith('/usage/images')) {
      return jsonResponse({
        data: [{ results: [{ project_id: HGI_OPENAI_PROJECT_ID, model: 'gpt-image-2.5-sunburst', num_model_requests: 121 }] }],
        has_more: false,
        next_page: null,
      })
    }
    if (url.pathname.endsWith('/usage/completions')) {
      return jsonResponse({
        data: [{ results: [
          { project_id: HGI_OPENAI_PROJECT_ID, model: 'gpt-5.4-mini-2026-03-17', num_model_requests: 174 },
          { project_id: HGI_OPENAI_PROJECT_ID, model: 'gpt-4o-mini-2024-07-18', num_model_requests: 5 },
        ] }],
        has_more: false,
        next_page: null,
      })
    }
    if (url.pathname.endsWith('/organization/costs')) {
      return jsonResponse({
        data: [{ results: [{ project_id: HGI_OPENAI_PROJECT_ID, amount: { currency: 'usd', value: 16.41474045 } }] }],
        has_more: false,
        next_page: null,
      })
    }
    return jsonResponse({}, 404)
  }
}

test('normalizes dated HGI model names', () => {
  assert.equal(canonicalModel('gpt-5.4-mini-2026-03-17'), 'gpt-5.4-mini')
  assert.equal(canonicalModel('gpt-4o-mini-2024-07-18'), 'gpt-4o-mini')
})

test('matches the approved historical baseline', async () => {
  const report = await verifyOpenAiAdminConnection({
    adminApiKey: 'test-key-not-a-secret',
    fetchImpl: successfulFetch(),
  })
  assert.equal(report.authentication.verified, true)
  assert.equal(report.projectAccess.verified, true)
  assert.deepEqual(report.checks, {
    project: { passed: true, httpStatus: 200 },
    images: { passed: true, httpStatus: 200 },
    completions: { passed: true, httpStatus: 200 },
    costs: { passed: true, httpStatus: 200 },
  })
  assert.equal(report.results.totalRequests, 300)
  assert.equal(report.results.imageRequests, 121)
  assert.equal(report.results.gpt54MiniRequests, 174)
  assert.equal(report.results.gpt4oMiniRequests, 5)
  assert.equal(report.results.actualProviderCostUsd, 16.41474045)
  assert.equal(report.matchesHistoricalBaseline, true)
  assert.deepEqual(report.errors, [])
})

test('follows pagination without duplicating buckets', async () => {
  const calls: string[] = []
  const fetchImpl: typeof fetch = async (input) => {
    const url = requestUrl(input)
    calls.push(url.toString())
    if (url.pathname.includes('/projects/')) {
      return jsonResponse({ id: HGI_OPENAI_PROJECT_ID })
    }
    if (url.pathname.endsWith('/usage/images')) {
      if (!url.searchParams.has('page')) {
        return jsonResponse({ data: [], has_more: true, next_page: 'next-image-page' })
      }
      return jsonResponse({ data: [{ results: [{ project_id: HGI_OPENAI_PROJECT_ID, model: 'gpt-image-2.5-sunburst', num_model_requests: 121 }] }], has_more: false })
    }
    if (url.pathname.endsWith('/usage/completions')) {
      return jsonResponse({ data: [{ results: [
        { project_id: HGI_OPENAI_PROJECT_ID, model: 'gpt-5.4-mini', num_model_requests: 174 },
        { project_id: HGI_OPENAI_PROJECT_ID, model: 'gpt-4o-mini', num_model_requests: 5 },
      ] }], has_more: false })
    }
    return jsonResponse({ data: [{ results: [{ project_id: HGI_OPENAI_PROJECT_ID, amount: { currency: 'usd', value: 16.41474045 } }] }], has_more: false })
  }

  const report = await verifyOpenAiAdminConnection({ adminApiKey: 'test', fetchImpl })
  assert.equal(report.matchesHistoricalBaseline, true)
  assert.equal(calls.some((url) => url.includes('page=next-image-page')), true)
})

test('returns a sanitized authentication failure', async () => {
  const report = await verifyOpenAiAdminConnection({
    adminApiKey: 'expired-test-key',
    fetchImpl: async () => new Response('raw provider secret diagnostic', { status: 401 }),
  })
  assert.equal(report.authentication.verified, false)
  assert.equal(report.errors[0]?.category, 'authentication_failed')
  assert.equal(report.errors[0]?.httpStatus, 401)
  assert.deepEqual(report.checks.project, { passed: false, httpStatus: 401 })
  assert.equal(JSON.stringify(report).includes('raw provider secret diagnostic'), false)
  assert.equal(JSON.stringify(report).includes('expired-test-key'), false)
})

test('rejects data attributed to another project', async () => {
  const baseFetch = successfulFetch()
  const report = await verifyOpenAiAdminConnection({
    adminApiKey: 'test',
    fetchImpl: async (input, init) => {
      const url = requestUrl(input)
      if (url.pathname.endsWith('/usage/images')) {
        return jsonResponse({ data: [{ results: [{ project_id: 'proj_other', model: 'gpt-image-2.5-sunburst', num_model_requests: 121 }] }], has_more: false })
      }
      return baseFetch(input, init)
    },
  })
  assert.equal(report.matchesHistoricalBaseline, false)
  assert.equal(report.errors[0]?.category, 'invalid_provider_response')
})
