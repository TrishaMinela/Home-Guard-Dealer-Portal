const OPENAI_API_BASE_URL = 'https://api.openai.com/v1'

export const HGI_OPENAI_PROJECT_ID = 'proj_haRRNxvf4CVwa2jHugJ762SM'
export const VERIFICATION_START_ISO = '2026-10-05T00:00:00.000Z'
export const VERIFICATION_END_ISO = '2026-10-23T00:00:00.000Z'

export const HISTORICAL_BASELINE = {
  totalRequests: 300,
  imageRequests: 121,
  gpt54MiniRequests: 174,
  gpt4oMiniRequests: 5,
  actualProviderCostUsd: 16.41474045,
} as const

type FetchLike = typeof fetch

type UsageResult = {
  project_id?: string | null
  model?: string | null
  num_model_requests?: number | null
}

type CostResult = {
  project_id?: string | null
  amount?: {
    value?: number | null
    currency?: string | null
  } | null
}

type UsageBucket<T> = {
  start_time?: number
  end_time?: number
  results?: T[]
}

type PaginatedResponse<T> = {
  data?: Array<UsageBucket<T>>
  has_more?: boolean
  next_page?: string | null
}

type ProjectResponse = {
  id?: string
  name?: string
  status?: string
}

export type VerificationErrorCategory =
  | 'configuration_error'
  | 'authentication_failed'
  | 'project_access_denied'
  | 'rate_limited'
  | 'provider_unavailable'
  | 'invalid_provider_response'

export type SanitizedVerificationError = {
  endpoint: 'project' | 'images' | 'completions' | 'costs'
  httpStatus: number | null
  category: VerificationErrorCategory
  message: string
  retryable: boolean
}

export type OpenAiAdminVerificationReport = {
  verifiedAt: string
  readOnly: true
  window: {
    start: string
    endExclusive: string
    timezone: 'UTC'
  }
  authentication: {
    verified: boolean
  }
  checks: Record<SanitizedVerificationError['endpoint'], {
    passed: boolean
    httpStatus: number | null
  }>
  projectAccess: {
    verified: boolean
    projectId: string
    projectName: string | null
    projectStatus: string | null
  }
  results: {
    totalRequests: number | null
    imageRequests: number | null
    gpt54MiniRequests: number | null
    gpt4oMiniRequests: number | null
    otherRequests: number | null
    actualProviderCostUsd: number | null
    currency: 'usd' | null
    modelRequests: Record<string, number>
  }
  baseline: typeof HISTORICAL_BASELINE
  differences: {
    totalRequests: number | null
    imageRequests: number | null
    gpt54MiniRequests: number | null
    gpt4oMiniRequests: number | null
    actualProviderCostUsd: number | null
  }
  matchesHistoricalBaseline: boolean
  errors: SanitizedVerificationError[]
}

class OpenAiAdminApiError extends Error {
  readonly status: number
  readonly endpoint: SanitizedVerificationError['endpoint']

  constructor(status: number, endpoint: SanitizedVerificationError['endpoint']) {
    super(`OpenAI Admin API ${endpoint} request failed.`)
    this.status = status
    this.endpoint = endpoint
  }
}

function endpointError(
  error: unknown,
  endpoint: SanitizedVerificationError['endpoint'],
): SanitizedVerificationError {
  const status = error instanceof OpenAiAdminApiError ? error.status : 0
  if (status === 401) {
    return {
      endpoint,
      httpStatus: status,
      category: 'authentication_failed',
      message: 'The OpenAI Admin API credential was rejected or has expired.',
      retryable: false,
    }
  }
  if (status === 403 || status === 404) {
    return {
      endpoint,
      httpStatus: status,
      category: 'project_access_denied',
      message: 'The Admin API credential cannot access the configured HGI project or reporting endpoint.',
      retryable: false,
    }
  }
  if (status === 429) {
    return {
      endpoint,
      httpStatus: status,
      category: 'rate_limited',
      message: 'OpenAI reporting is temporarily rate limited.',
      retryable: true,
    }
  }
  if (status >= 500 || error instanceof TypeError) {
    return {
      endpoint,
      httpStatus: status || null,
      category: 'provider_unavailable',
      message: 'OpenAI reporting is temporarily unavailable.',
      retryable: true,
    }
  }
  return {
    endpoint,
    httpStatus: status || null,
    category: 'invalid_provider_response',
    message: 'OpenAI returned an incomplete or unexpected reporting response.',
    retryable: false,
  }
}

function requestHeaders(adminApiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${adminApiKey}`,
    Accept: 'application/json',
  }
}

async function readJson<T>(
  fetchImpl: FetchLike,
  url: URL,
  adminApiKey: string,
  endpoint: SanitizedVerificationError['endpoint'],
): Promise<T> {
  const response = await fetchImpl(url, {
    method: 'GET',
    headers: requestHeaders(adminApiKey),
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) {
    // Never read or log the provider response body: it may contain sensitive diagnostics.
    throw new OpenAiAdminApiError(response.status, endpoint)
  }
  return response.json() as Promise<T>
}

async function readAllPages<T>(
  fetchImpl: FetchLike,
  pathname: string,
  params: URLSearchParams,
  adminApiKey: string,
  endpoint: SanitizedVerificationError['endpoint'],
): Promise<Array<UsageBucket<T>>> {
  const buckets: Array<UsageBucket<T>> = []
  const seenCursors = new Set<string>()
  let page: string | null = null

  for (let requestNumber = 0; requestNumber < 100; requestNumber += 1) {
    const url = new URL(`${OPENAI_API_BASE_URL}${pathname}`)
    url.search = params.toString()
    if (page) url.searchParams.set('page', page)

    const response = await readJson<PaginatedResponse<T>>(
      fetchImpl,
      url,
      adminApiKey,
      endpoint,
    )
    if (!Array.isArray(response.data)) {
      throw new Error(`Invalid ${endpoint} response.`)
    }
    buckets.push(...response.data)

    if (!response.has_more) return buckets
    if (!response.next_page || seenCursors.has(response.next_page)) {
      throw new Error(`Invalid ${endpoint} pagination.`)
    }
    seenCursors.add(response.next_page)
    page = response.next_page
  }

  throw new Error(`${endpoint} pagination exceeded the safety limit.`)
}

function commonUsageParams(): URLSearchParams {
  const params = new URLSearchParams({
    start_time: String(Date.parse(VERIFICATION_START_ISO) / 1000),
    end_time: String(Date.parse(VERIFICATION_END_ISO) / 1000),
    bucket_width: '1d',
    limit: '31',
  })
  params.append('project_ids[]', HGI_OPENAI_PROJECT_ID)
  params.append('group_by[]', 'project_id')
  params.append('group_by[]', 'model')
  return params
}

function validateProjectScope(results: UsageResult[] | CostResult[]): void {
  for (const result of results) {
    if (result.project_id !== HGI_OPENAI_PROJECT_ID) {
      throw new Error('Provider response included an unexpected project scope.')
    }
  }
}

export function canonicalModel(model: string | null | undefined): string {
  const normalized = model?.trim().toLowerCase() ?? ''
  if (normalized.startsWith('gpt-image-2.5')) return 'gpt-image-2.5-sunburst'
  if (normalized.startsWith('gpt-5.4-mini')) return 'gpt-5.4-mini'
  if (normalized.startsWith('gpt-4o-mini')) return 'gpt-4o-mini'
  return normalized || 'unknown'
}

function flattenResults<T>(buckets: Array<UsageBucket<T>>): T[] {
  return buckets.flatMap((bucket) => bucket.results ?? [])
}

function sumModelRequests(
  results: UsageResult[],
  destination: Map<string, number>,
): void {
  validateProjectScope(results)
  for (const result of results) {
    const model = canonicalModel(result.model)
    const count = result.num_model_requests ?? 0
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error('Provider response contained an invalid request count.')
    }
    destination.set(model, (destination.get(model) ?? 0) + count)
  }
}

function emptyReport(): OpenAiAdminVerificationReport {
  return {
    verifiedAt: new Date().toISOString(),
    readOnly: true,
    window: {
      start: VERIFICATION_START_ISO,
      endExclusive: VERIFICATION_END_ISO,
      timezone: 'UTC',
    },
    authentication: { verified: false },
    checks: {
      project: { passed: false, httpStatus: null },
      images: { passed: false, httpStatus: null },
      completions: { passed: false, httpStatus: null },
      costs: { passed: false, httpStatus: null },
    },
    projectAccess: {
      verified: false,
      projectId: HGI_OPENAI_PROJECT_ID,
      projectName: null,
      projectStatus: null,
    },
    results: {
      totalRequests: null,
      imageRequests: null,
      gpt54MiniRequests: null,
      gpt4oMiniRequests: null,
      otherRequests: null,
      actualProviderCostUsd: null,
      currency: null,
      modelRequests: {},
    },
    baseline: HISTORICAL_BASELINE,
    differences: {
      totalRequests: null,
      imageRequests: null,
      gpt54MiniRequests: null,
      gpt4oMiniRequests: null,
      actualProviderCostUsd: null,
    },
    matchesHistoricalBaseline: false,
    errors: [],
  }
}

export async function verifyOpenAiAdminConnection(options: {
  adminApiKey: string
  fetchImpl?: FetchLike
}): Promise<OpenAiAdminVerificationReport> {
  const report = emptyReport()
  const fetchImpl = options.fetchImpl ?? fetch
  if (!options.adminApiKey) {
    report.errors.push({
      endpoint: 'project',
      httpStatus: null,
      category: 'configuration_error',
      message: 'The server-only OpenAI Admin API credential is not configured.',
      retryable: false,
    })
    return report
  }

  let project: ProjectResponse
  try {
    const projectUrl = new URL(
      `${OPENAI_API_BASE_URL}/organization/projects/${encodeURIComponent(HGI_OPENAI_PROJECT_ID)}`,
    )
    project = await readJson<ProjectResponse>(
      fetchImpl,
      projectUrl,
      options.adminApiKey,
      'project',
    )
    if (project.id !== HGI_OPENAI_PROJECT_ID) {
      throw new Error('Project identity did not match.')
    }
    report.authentication.verified = true
    report.checks.project = { passed: true, httpStatus: 200 }
    report.projectAccess = {
      verified: true,
      projectId: HGI_OPENAI_PROJECT_ID,
      projectName: project.name ?? null,
      projectStatus: project.status ?? null,
    }
  } catch (error) {
    const sanitized = endpointError(error, 'project')
    report.checks.project = { passed: false, httpStatus: sanitized.httpStatus }
    report.errors.push(sanitized)
    return report
  }

  const usageParams = commonUsageParams()
  const costParams = new URLSearchParams({
    start_time: usageParams.get('start_time') ?? '',
    end_time: usageParams.get('end_time') ?? '',
    bucket_width: '1d',
    limit: '31',
  })
  costParams.append('project_ids[]', HGI_OPENAI_PROJECT_ID)
  costParams.append('group_by[]', 'project_id')
  costParams.append('group_by[]', 'line_item')

  const [imagesResult, completionsResult, costsResult] = await Promise.allSettled([
    readAllPages<UsageResult>(
      fetchImpl,
      '/organization/usage/images',
      usageParams,
      options.adminApiKey,
      'images',
    ),
    readAllPages<UsageResult>(
      fetchImpl,
      '/organization/usage/completions',
      usageParams,
      options.adminApiKey,
      'completions',
    ),
    readAllPages<CostResult>(
      fetchImpl,
      '/organization/costs',
      costParams,
      options.adminApiKey,
      'costs',
    ),
  ])

  const settled = [
    ['images', imagesResult],
    ['completions', completionsResult],
    ['costs', costsResult],
  ] as const
  for (const [endpoint, result] of settled) {
    if (result.status === 'rejected') {
      const sanitized = endpointError(result.reason, endpoint)
      report.checks[endpoint] = { passed: false, httpStatus: sanitized.httpStatus }
      report.errors.push(sanitized)
    } else {
      report.checks[endpoint] = { passed: true, httpStatus: 200 }
    }
  }
  if (
    report.errors.length > 0 ||
    imagesResult.status !== 'fulfilled' ||
    completionsResult.status !== 'fulfilled' ||
    costsResult.status !== 'fulfilled'
  ) return report

  try {
    const modelRequests = new Map<string, number>()
    const imageResults = flattenResults(imagesResult.value)
    const completionResults = flattenResults(completionsResult.value)
    const costResults = flattenResults(costsResult.value)
    sumModelRequests(imageResults, modelRequests)
    sumModelRequests(completionResults, modelRequests)
    validateProjectScope(costResults)

    let actualProviderCostUsd = 0
    for (const result of costResults) {
      const amount = result.amount
      if (amount?.currency !== 'usd' || typeof amount.value !== 'number' || amount.value < 0) {
        throw new Error('Provider response contained an invalid cost amount.')
      }
      actualProviderCostUsd += amount.value
    }

    const imageRequests = modelRequests.get('gpt-image-2.5-sunburst') ?? 0
    const gpt54MiniRequests = modelRequests.get('gpt-5.4-mini') ?? 0
    const gpt4oMiniRequests = modelRequests.get('gpt-4o-mini') ?? 0
    const totalRequests = [...modelRequests.values()].reduce((sum, count) => sum + count, 0)
    const otherRequests = totalRequests - imageRequests - gpt54MiniRequests - gpt4oMiniRequests
    const differences = {
      totalRequests: totalRequests - HISTORICAL_BASELINE.totalRequests,
      imageRequests: imageRequests - HISTORICAL_BASELINE.imageRequests,
      gpt54MiniRequests: gpt54MiniRequests - HISTORICAL_BASELINE.gpt54MiniRequests,
      gpt4oMiniRequests: gpt4oMiniRequests - HISTORICAL_BASELINE.gpt4oMiniRequests,
      actualProviderCostUsd:
        actualProviderCostUsd - HISTORICAL_BASELINE.actualProviderCostUsd,
    }

    report.results = {
      totalRequests,
      imageRequests,
      gpt54MiniRequests,
      gpt4oMiniRequests,
      otherRequests,
      actualProviderCostUsd,
      currency: 'usd',
      modelRequests: Object.fromEntries([...modelRequests].sort(([a], [b]) => a.localeCompare(b))),
    }
    report.differences = differences
    report.matchesHistoricalBaseline =
      Object.entries(differences).every(([key, value]) =>
        key === 'actualProviderCostUsd'
          ? Math.abs(value) < 0.000000005
          : value === 0,
      )
  } catch (error) {
    report.errors.push(endpointError(error, 'costs'))
  }

  return report
}
