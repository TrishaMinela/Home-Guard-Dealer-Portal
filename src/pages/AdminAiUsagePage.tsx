import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { AiEntranceDetectionUsage, AiGenerationUsage, AiProviderActivityDaily, AiProviderCostDaily, AiUsagePeriod, AiVisualizationWorkflow } from '../types/aiUsage'
import type { AiAdminIssue } from '../types/aiAdminIssue'

const aiIssueFields = 'id, workflow_request_id, issue_type, severity, title, admin_summary, recommended_action, failure_stage, failure_category, environment, provider_request_id, occurred_at, first_seen_at, last_seen_at, occurrence_count, status, resolved_at, resolved_by'

const periods: Array<{ value: AiUsagePeriod; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: '7-days', label: 'Last 7 Days' },
  { value: '30-days', label: 'Last 30 Days' },
  { value: 'this-month', label: 'This Month' },
  { value: 'custom', label: 'Custom UTC Range' },
]

const hgiOpenAiProjectId = 'proj_haRRNxvf4CVwa2jHugJ762SM'

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg className={spinning ? 'is-spinning' : undefined} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 4v5h5" />
      <path d="M4 13a8.1 8.1 0 0 0 15.5 2M20 20v-5h-5" />
    </svg>
  )
}

type MetricIconName = 'visualizations' | 'successful' | 'failed' | 'usage' | 'cost' | 'time'

function MetricIcon({ name }: { name: MetricIconName }) {
  const paths: Record<MetricIconName, ReactNode> = {
    visualizations: <><rect x="3" y="5" width="18" height="14" rx="1" /><path d="m7 15 3-3 2.5 2.5L15 12l3 3" /><circle cx="8" cy="9" r="1" /></>,
    successful: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></>,
    failed: <><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6m0-6-6 6" /></>,
    usage: <><path d="M4 19V9m5 10V5m5 14v-7m5 7V3" /></>,
    cost: <><circle cx="12" cy="12" r="9" /><path d="M15 8.5c-.7-.7-1.7-1-3-1-1.7 0-3 .8-3 2s1.3 1.8 3 2 3 .8 3 2-1.3 2-3 2c-1.3 0-2.4-.4-3.2-1.2M12 5v14" /></>,
    time: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  }
  return <span className="ai-metric-icon" aria-hidden="true"><svg viewBox="0 0 24 24">{paths[name]}</svg></span>
}

function utcDateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function utcDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`)
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function periodBounds(period: AiUsagePeriod, customStart: string, customEnd: string) {
  const now = new Date()
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  let start = today
  let endInclusive = today
  if (period === 'custom') {
    start = utcDate(customStart)
    endInclusive = utcDate(customEnd)
  } else if (period === 'this-month') {
    start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  } else if (period === '7-days') {
    start = addUtcDays(today, -6)
  } else if (period === '30-days') {
    start = addUtcDays(today, -29)
  }
  if (Number.isNaN(start.getTime()) || Number.isNaN(endInclusive.getTime()) || start > endInclusive) return null
  return {
    start,
    endExclusive: addUtcDays(endInclusive, 1),
    startDate: utcDateKey(start),
    endDate: utcDateKey(endInclusive),
  }
}

function sumAvailable<T, K extends keyof T>(rows: T[], field: K) {
  const values: number[] = []
  for (const row of rows) if (typeof row[field] === 'number') values.push(row[field] as number)
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null
}

function canonicalTotal(row: AiGenerationUsage) {
  if (row.total_tokens !== null) return row.total_tokens
  if (row.input_tokens !== null && row.output_tokens !== null) return row.input_tokens + row.output_tokens
  if (row.text_input_tokens !== null && row.image_input_tokens !== null && row.image_output_tokens !== null) {
    return row.text_input_tokens + row.image_input_tokens + row.image_output_tokens
  }
  return null
}

function sumCanonicalTotals(rows: AiGenerationUsage[]) {
  const values = rows.map(canonicalTotal).filter((value): value is number => value !== null)
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null
}

function canonicalDetectionTotal(row: AiEntranceDetectionUsage) {
  if (row.total_tokens !== null) return row.total_tokens
  return row.input_tokens !== null && row.output_tokens !== null ? row.input_tokens + row.output_tokens : null
}

function sumDetectionTotals(rows: AiEntranceDetectionUsage[]) {
  const values = rows.map(canonicalDetectionTotal).filter((value): value is number => value !== null)
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null
}

function addKnown(...values: Array<number | null>) {
  const known = values.filter((value): value is number => value !== null)
  return known.length ? known.reduce((sum, value) => sum + value, 0) : null
}

function formatTokens(value: number | null) {
  return value === null ? '—' : `${new Intl.NumberFormat().format(value)} tokens`
}

function formatCost(value: number | null) {
  return value === null ? '—' : new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(value)
}

function formatProviderCost(value: number | null) {
  return value === null ? '—' : new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
}

function formatExactProviderCost(value: number | null) {
  return value === null ? '—' : `$${value.toFixed(10)}`
}

function requestBucket(dateTime: string, model: string, operation: AiProviderActivityDaily['operation_type']) {
  return `${dateTime.slice(0, 10)}|${model}|${operation}`
}

function formatDuration(value: number | null) {
  if (value === null) return '—'
  return value >= 1000 ? `${(value / 1000).toFixed(1)} sec` : `${value} ms`
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(value))
}

export function AdminAiUsagePage() {
  const [searchParams] = useSearchParams()
  const selectedIssueId = searchParams.get('issue')
  const [period, setPeriod] = useState<AiUsagePeriod>('this-month')
  const [customStart, setCustomStart] = useState('2026-10-05')
  const [customEnd, setCustomEnd] = useState('2026-10-22')
  const [generationRows, setGenerationRows] = useState<AiGenerationUsage[]>([])
  const [detectionRows, setDetectionRows] = useState<AiEntranceDetectionUsage[]>([])
  const [workflowRows, setWorkflowRows] = useState<AiVisualizationWorkflow[]>([])
  const [providerActivityRows, setProviderActivityRows] = useState<AiProviderActivityDaily[]>([])
  const [providerCostRows, setProviderCostRows] = useState<AiProviderCostDaily[]>([])
  const [trackingBegan, setTrackingBegan] = useState<{ generation: string | null; detection: string | null; workflow: string | null }>({ generation: null, detection: null, workflow: null })
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [refreshError, setRefreshError] = useState('')
  const [issues, setIssues] = useState<AiAdminIssue[]>([])
  const [issuesError, setIssuesError] = useState('')
  const [resolvingIssueId, setResolvingIssueId] = useState('')
  const [isVerifyingOpenAi, setIsVerifyingOpenAi] = useState(false)
  const [openAiVerificationReport, setOpenAiVerificationReport] = useState('')
  const [openAiVerificationError, setOpenAiVerificationError] = useState('')
  const [providerRecoveryRange, setProviderRecoveryRange] = useState('')
  const [providerImportRange, setProviderImportRange] = useState('')
  const [providerRecoveryReport, setProviderRecoveryReport] = useState('')
  const [providerRecoveryError, setProviderRecoveryError] = useState('')
  const requestSequence = useRef(0)
  const bounds = useMemo(() => periodBounds(period, customStart, customEnd), [period, customStart, customEnd])

  const loadIssues = useCallback(async () => {
    const { data, error: queryError } = await supabase
      .from('ai_admin_issues')
      .select(aiIssueFields)
      .order('last_seen_at', { ascending: false })
      .limit(100)
    if (queryError) {
      console.error('Failed to load AI admin issues.', queryError)
      setIssuesError('We could not load AI issue history right now.')
    } else {
      setIssues((data ?? []) as AiAdminIssue[])
      setIssuesError('')
    }
  }, [])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadIssues(), 0)
    return () => window.clearTimeout(timeoutId)
  }, [loadIssues])

  async function resolveIssue(issueId: string) {
    setResolvingIssueId(issueId)
    setIssuesError('')
    const { error: mutationError } = await supabase.rpc('resolve_ai_admin_issue', { p_issue_id: issueId })
    if (mutationError) {
      console.error('Failed to resolve AI admin issue.', mutationError)
      setIssuesError('We could not mark this issue resolved. Please try again.')
    } else {
      await loadIssues()
      window.dispatchEvent(new Event('ai-admin-issues-changed'))
    }
    setResolvingIssueId('')
  }

  async function verifyOpenAiAdminAccess() {
    setIsVerifyingOpenAi(true)
    setOpenAiVerificationError('')
    setOpenAiVerificationReport('')
    try {
      const { data, error: sessionError } = await supabase.auth.getSession()
      const accessToken = data.session?.access_token
      if (sessionError || !accessToken) throw new Error('Your admin session is unavailable. Sign in again and retry.')
      const response = await fetch('/api/openai-admin-verify', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const report: unknown = await response.json()
      setOpenAiVerificationReport(JSON.stringify(report, null, 2))
    } catch (verificationError) {
      setOpenAiVerificationError(verificationError instanceof Error ? verificationError.message : 'Verification could not be completed.')
    } finally {
      setIsVerifyingOpenAi(false)
    }
  }

  async function runProviderRecoveryDryRun(start: string, endExclusive: string) {
    const rangeKey = `${start}:${endExclusive}`
    setProviderRecoveryRange(rangeKey)
    setProviderRecoveryError('')
    setProviderRecoveryReport('')
    try {
      const { data, error: sessionError } = await supabase.auth.getSession()
      const accessToken = data.session?.access_token
      if (sessionError || !accessToken) throw new Error('Your admin session is unavailable. Sign in again and retry.')
      const response = await fetch('/api/openai-provider-recovery-dry-run', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ start, endExclusive }),
      })
      const report: unknown = await response.json()
      if (!response.ok) {
        const message = report && typeof report === 'object' && 'error' in report && typeof report.error === 'string'
          ? report.error
          : 'Provider recovery dry run could not be completed.'
        throw new Error(message)
      }
      setProviderRecoveryReport(JSON.stringify(report, null, 2))
    } catch (recoveryError) {
      setProviderRecoveryError(recoveryError instanceof Error ? recoveryError.message : 'Provider recovery dry run could not be completed.')
    } finally {
      setProviderRecoveryRange('')
    }
  }

  async function importProviderRecovery(start: string, endExclusive: string) {
    const rangeKey = `${start}:${endExclusive}`
    setProviderImportRange(rangeKey)
    setProviderRecoveryError('')
    setProviderRecoveryReport('')
    try {
      const { data, error: sessionError } = await supabase.auth.getSession()
      const accessToken = data.session?.access_token
      if (sessionError || !accessToken) throw new Error('Your admin session is unavailable. Sign in again and retry.')
      const response = await fetch('/api/openai-provider-recovery-import', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ start, endExclusive }),
      })
      const report: unknown = await response.json()
      if (!response.ok) {
        const message = report && typeof report === 'object' && 'error' in report && typeof report.error === 'string'
          ? report.error
          : 'Provider recovery import could not be completed.'
        throw new Error(message)
      }
      setProviderRecoveryReport(JSON.stringify(report, null, 2))
    } catch (importError) {
      setProviderRecoveryError(importError instanceof Error ? importError.message : 'Provider recovery import could not be completed.')
    } finally {
      setProviderImportRange('')
    }
  }

  const loadUsage = useCallback(async (background: boolean) => {
      const requestId = ++requestSequence.current
      if (!bounds) {
        setError('Choose a valid UTC date range. The end date must be on or after the start date.')
        setIsLoading(false)
        setIsRefreshing(false)
        return
      }
      if (background) {
        setIsRefreshing(true)
        setRefreshError('')
      } else {
        setIsRefreshing(false)
      setIsLoading(true)
      setError('')
      }
      const generationQuery = supabase
        .from('ai_generation_usage')
        .select('id, created_at, completed_at, status, model, quality, output_size, output_format, input_tokens, text_input_tokens, image_input_tokens, output_tokens, image_output_tokens, total_tokens, estimated_cost_usd, openai_generation_duration_ms, total_api_duration_ms, total_visualization_duration_ms, entrance_stage_duration_ms, environment, request_id, error_code')
        .gte('created_at', bounds.start.toISOString())
        .lt('created_at', bounds.endExclusive.toISOString())
        .order('created_at', { ascending: false })
      const detectionQuery = supabase
        .from('ai_entrance_detection_usage')
        .select('id, created_at, completed_at, status, environment, model, pass_type, input_tokens, cached_input_tokens, output_tokens, reasoning_tokens, total_tokens, estimated_cost_usd, detection_duration_ms, request_id, workflow_request_id, error_code')
        .gte('created_at', bounds.start.toISOString())
        .lt('created_at', bounds.endExclusive.toISOString())
        .order('created_at', { ascending: false })
      const workflowQuery = supabase
        .from('ai_visualization_workflows')
        .select('id, workflow_request_id, started_at, completed_at, environment, status, failure_stage, failure_category, analysis_request_id, analysis_provider_request_id, generation_request_id, generation_provider_request_id, estimated_total_cost_usd, duration_ms, created_at')
        .gte('started_at', bounds.start.toISOString())
        .lt('started_at', bounds.endExclusive.toISOString())
        .order('started_at', { ascending: false })
      const providerActivityQuery = supabase
        .from('ai_provider_activity_daily')
        .select('id, provider, provider_project_id, usage_date, period_start_at, period_end_at, provider_model, telemetry_model, operation_type, request_count, input_tokens, output_tokens, cached_input_tokens, text_input_tokens, text_output_tokens, image_input_tokens, image_output_tokens, calculated_estimated_cost_usd')
        .eq('provider_project_id', hgiOpenAiProjectId)
        .gte('usage_date', bounds.startDate)
        .lte('usage_date', bounds.endDate)
        .order('usage_date', { ascending: false })
      const providerCostQuery = supabase
        .from('ai_provider_cost_daily')
        .select('id, provider, reconciled_project_id, export_project_id, usage_date, actual_cost_usd, currency, scope_verification')
        .eq('reconciled_project_id', hgiOpenAiProjectId)
        .gte('usage_date', bounds.startDate)
        .lte('usage_date', bounds.endDate)
        .order('usage_date', { ascending: false })
      const [generationResult, detectionResult, workflowResult, providerActivityResult, providerCostResult] = await Promise.all([
        generationQuery, detectionQuery, workflowQuery, providerActivityQuery, providerCostQuery,
      ])

      if (requestId !== requestSequence.current) return
      if (generationResult.error || detectionResult.error || workflowResult.error || providerActivityResult.error || providerCostResult.error) {
        console.error('Failed to load AI usage.', {
          generationError: generationResult.error,
          detectionError: detectionResult.error,
          workflowError: workflowResult.error,
          providerActivityError: providerActivityResult.error,
          providerCostError: providerCostResult.error,
        })
        if (background) {
          setRefreshError('Could not refresh AI usage. Your previous data is still shown.')
        } else {
          setError('We could not load AI usage right now. Please try again later.')
          setGenerationRows([])
          setDetectionRows([])
          setWorkflowRows([])
          setProviderActivityRows([])
          setProviderCostRows([])
        }
      } else {
        setGenerationRows((generationResult.data ?? []) as AiGenerationUsage[])
        setDetectionRows((detectionResult.data ?? []) as AiEntranceDetectionUsage[])
        setWorkflowRows((workflowResult.data ?? []) as AiVisualizationWorkflow[])
        setProviderActivityRows((providerActivityResult.data ?? []) as AiProviderActivityDaily[])
        setProviderCostRows((providerCostResult.data ?? []) as AiProviderCostDaily[])
      }
      if (background) setIsRefreshing(false)
      else setIsLoading(false)
  }, [bounds])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadUsage(false), 0)
    return () => { window.clearTimeout(timeoutId); requestSequence.current += 1 }
  }, [loadUsage])

  useEffect(() => {
    let isCurrent = true
    void Promise.all([
      supabase.from('ai_generation_usage').select('created_at').order('created_at', { ascending: true }).limit(1).maybeSingle(),
      supabase.from('ai_entrance_detection_usage').select('created_at').order('created_at', { ascending: true }).limit(1).maybeSingle(),
      supabase.from('ai_visualization_workflows').select('started_at').order('started_at', { ascending: true }).limit(1).maybeSingle(),
    ]).then(([generationResult, detectionResult, workflowResult]) => {
        if (!isCurrent) return
        if (generationResult.error || detectionResult.error || workflowResult.error) console.error('Failed to load AI usage tracking start.', { generationError: generationResult.error, detectionError: detectionResult.error, workflowError: workflowResult.error })
        else setTrackingBegan({ generation: generationResult.data?.created_at ?? null, detection: detectionResult.data?.created_at ?? null, workflow: workflowResult.data?.started_at ?? null })
      })
    return () => { isCurrent = false }
  }, [])

  const metrics = useMemo(() => {
    const succeededGenerations = generationRows.filter((row) => row.status === 'succeeded')
    const successfulWorkflows = workflowRows.filter((row) => row.status === 'succeeded')
    const failedWorkflows = workflowRows.filter((row) => row.status === 'failed')
    const completedWorkflows = successfulWorkflows.length + failedWorkflows.length
    const totalDurations = successfulWorkflows
      .map((row) => row.duration_ms)
      .filter((value): value is number => value !== null)
    const entranceStageDurations = succeededGenerations
      .map((row) => row.entrance_stage_duration_ms)
      .filter((value): value is number => value !== null)
    const sunburstStageDurations = succeededGenerations
      .map((row) => row.total_visualization_duration_ms !== null && row.entrance_stage_duration_ms !== null
        ? Math.max(0, row.total_visualization_duration_ms - row.entrance_stage_duration_ms)
        : null)
      .filter((value): value is number => value !== null)
    const openAiDurations = succeededGenerations.map((row) => row.openai_generation_duration_ms).filter((value): value is number => value !== null)
    const successfulDetections = detectionRows.filter((row) => row.status === 'succeeded')
    const detectionDurations = successfulDetections.map((row) => row.detection_duration_ms).filter((value): value is number => value !== null)
    const generationTokens = sumCanonicalTotals(generationRows)
    const detectionTokens = sumDetectionTotals(detectionRows)
    const generationCost = sumAvailable(generationRows, 'estimated_cost_usd')
    const detectionCost = sumAvailable(detectionRows, 'estimated_cost_usd')
    const recordedBuckets = new Map<string, number>()
    for (const row of generationRows) {
      const key = requestBucket(row.created_at, row.model, 'image_generation')
      recordedBuckets.set(key, (recordedBuckets.get(key) ?? 0) + 1)
    }
    for (const row of detectionRows) {
      const key = requestBucket(row.created_at, row.model, 'entrance_analysis')
      recordedBuckets.set(key, (recordedBuckets.get(key) ?? 0) + 1)
    }
    const providerBuckets = new Map(providerActivityRows.map((row) => [
      requestBucket(row.usage_date, row.telemetry_model, row.operation_type),
      row.request_count,
    ]))
    let providerCoveredRecorded = 0
    let historicalAggregateRequests = 0
    let reconciledRequests = 0
    for (const row of providerActivityRows) {
      const recorded = recordedBuckets.get(requestBucket(row.usage_date, row.telemetry_model, row.operation_type)) ?? 0
      providerCoveredRecorded += Math.min(recorded, row.request_count)
      historicalAggregateRequests += Math.max(0, row.request_count - recorded)
      reconciledRequests += Math.max(recorded, row.request_count)
    }
    let trackedOutsideProviderCoverage = 0
    for (const [key, count] of recordedBuckets) {
      if (!providerBuckets.has(key)) {
        trackedOutsideProviderCoverage += count
        reconciledRequests += count
      }
    }
    const individuallyTrackedRequests = generationRows.length + detectionRows.length
    const providerRequests = providerActivityRows.reduce((sum, row) => sum + row.request_count, 0)
    const providerTokens = providerActivityRows.reduce((sum, row) => sum + row.input_tokens + row.output_tokens, 0)
    const actualProviderCost = providerCostRows.length
      ? providerCostRows.reduce((sum, row) => sum + row.actual_cost_usd, 0)
      : null
    const modelCounts = providerActivityRows.reduce<Record<string, number>>((counts, row) => {
      counts[row.telemetry_model] = (counts[row.telemetry_model] ?? 0) + row.request_count
      return counts
    }, {})
    const activityCoverageDates = providerActivityRows.map((row) => row.usage_date).sort()
    const coverageDates = providerCostRows.map((row) => row.usage_date).sort()
    return {
      attempts: workflowRows.length,
      succeeded: successfulWorkflows.length,
      failed: failedWorkflows.length,
      started: workflowRows.filter((row) => row.status === 'started').length,
      successRate: completedWorkflows ? successfulWorkflows.length / completedWorkflows * 100 : null,
      analysisFailures: failedWorkflows.filter((row) => row.failure_stage === 'entrance_analysis').length,
      generationFailures: failedWorkflows.filter((row) => row.failure_stage === 'image_generation').length,
      infrastructureFailures: failedWorkflows.filter((row) => row.failure_stage === 'application_infrastructure').length,
      generationCalls: generationRows.length,
      analysisCalls: detectionRows.length,
      totalTokens: addKnown(generationTokens, detectionTokens),
      cost: addKnown(generationCost, detectionCost),
      costIncomplete: generationRows.some((row) => row.estimated_cost_usd === null) || detectionRows.some((row) => row.estimated_cost_usd === null),
      totalUsageIncomplete: generationRows.some((row) => row.status === 'succeeded' && canonicalTotal(row) === null) || detectionRows.some((row) => canonicalDetectionTotal(row) === null),
      providerRequests,
      individuallyTrackedRequests,
      historicalAggregateRequests,
      trackedOutsideProviderCoverage,
      reconciledRequests,
      requestCoverage: providerRequests ? providerCoveredRecorded / providerRequests * 100 : null,
      providerTokens: providerActivityRows.length ? providerTokens : null,
      actualProviderCost,
      modelCounts,
      providerActivityStart: activityCoverageDates[0] ?? null,
      providerActivityEnd: activityCoverageDates.at(-1) ?? null,
      providerCostStart: coverageDates[0] ?? null,
      providerCostEnd: coverageDates.at(-1) ?? null,
      averageTotalDuration: totalDurations.length
        ? totalDurations.reduce((sum, value) => sum + value, 0) / totalDurations.length
        : null,
      averageEntranceStageDuration: entranceStageDurations.length
        ? entranceStageDurations.reduce((sum, value) => sum + value, 0) / entranceStageDurations.length
        : null,
      averageSunburstStageDuration: sunburstStageDurations.length
        ? sunburstStageDurations.reduce((sum, value) => sum + value, 0) / sunburstStageDurations.length
        : null,
      averageOpenAiDuration: openAiDurations.length ? openAiDurations.reduce((sum, value) => sum + value, 0) / openAiDurations.length : null,
      averageDetectionDuration: detectionDurations.length ? detectionDurations.reduce((sum, value) => sum + value, 0) / detectionDurations.length : null,
    }
  }, [generationRows, detectionRows, workflowRows, providerActivityRows, providerCostRows])

  return (
    <div className="page-content ai-usage-page">
      <header className="page-header page-header--with-action ai-usage-header">
        <div className="ai-usage-header__copy">
          <p className="eyebrow">Home Guard</p>
          <h1>AI Visualizer Usage</h1>
          <p>Monitor AI visualization volume, usage, cost, and generation performance.</p>
        </div>
        <div className="ai-usage-filters">
          <div className="filter-field ai-usage-period"><label htmlFor="ai-usage-period">Date range</label><select id="ai-usage-period" value={period} onChange={(event) => setPeriod(event.target.value as AiUsagePeriod)}>{periods.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
          {period === 'custom' && <div className="ai-usage-custom-range">
            <div className="filter-field"><label htmlFor="ai-usage-start">Start (UTC)</label><input id="ai-usage-start" type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} /></div>
            <div className="filter-field"><label htmlFor="ai-usage-end">End (UTC)</label><input id="ai-usage-end" type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} /></div>
          </div>}
          <div className="ai-usage-refresh">
            <button className="button button--secondary" type="button" disabled={isVerifyingOpenAi} onClick={() => void verifyOpenAiAdminAccess()}>
              {isVerifyingOpenAi ? 'Verifying...' : 'Verify OpenAI Access'}
            </button>
            <button className="button ai-usage-refresh__button" type="button" disabled={isLoading || isRefreshing} onClick={() => { void loadUsage(true); void loadIssues() }}>
              <RefreshIcon spinning={isRefreshing} />
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </button>
            <button className="button button--secondary" type="button" disabled={Boolean(providerRecoveryRange)} onClick={() => void runProviderRecoveryDryRun('2026-10-01', '2026-10-05')}>
              {providerRecoveryRange === '2026-10-01:2026-10-05' ? 'Checking Oct 1–4...' : 'Dry Run Oct 1–4'}
            </button>
            <button className="button button--secondary" type="button" disabled={Boolean(providerRecoveryRange)} onClick={() => void runProviderRecoveryDryRun('2026-10-23', '2026-10-29')}>
              {providerRecoveryRange === '2026-10-23:2026-10-29' ? 'Checking Oct 23–28...' : 'Dry Run Oct 23–28'}
            </button>
            <button className="button button--secondary" type="button" disabled={Boolean(providerImportRange)} onClick={() => void importProviderRecovery('2026-10-01', '2026-10-05')}>
              {providerImportRange === '2026-10-01:2026-10-05' ? 'Importing Oct 1–4...' : 'Import Oct 1–4'}
            </button>
            <button className="button button--secondary" type="button" disabled={Boolean(providerImportRange)} onClick={() => void importProviderRecovery('2026-10-23', '2026-10-29')}>
              {providerImportRange === '2026-10-23:2026-10-29' ? 'Importing Oct 23–28...' : 'Import Oct 23–28'}
            </button>
            {refreshError && <small className="ai-usage-refresh__error" role="alert">{refreshError}</small>}
          </div>
        </div>
      </header>
      {openAiVerificationError && <div className="notification-inline-error" role="alert">{openAiVerificationError}</div>}
      {openAiVerificationReport && <section className="content-card" aria-label="OpenAI Admin API verification report"><pre>{openAiVerificationReport}</pre></section>}
      {providerRecoveryError && <div className="notification-inline-error" role="alert">{providerRecoveryError}</div>}
      {providerRecoveryReport && <section className="content-card" aria-label="OpenAI provider recovery dry-run report"><div className="content-card__header"><p className="eyebrow">Read-only diagnostic</p><h2>Provider Recovery Dry Run</h2></div><pre>{providerRecoveryReport}</pre></section>}
      <p className="ai-usage-timezone-note">Reporting boundaries use UTC dates. Times in activity tables are displayed in your local browser time.</p>
      {(trackingBegan.generation || trackingBegan.detection || trackingBegan.workflow) && <p className="ai-usage-tracking-note">Workflow-level attempts and failures are available from {trackingBegan.workflow ? formatDateTime(trackingBegan.workflow) : 'the workflow-tracking rollout'}. Image-generation tracking began {trackingBegan.generation ? formatDateTime(trackingBegan.generation) : 'after this period'}. Entrance-analysis tracking began {trackingBegan.detection ? formatDateTime(trackingBegan.detection) : 'after this period'}. Earlier workflow attempts are not inferred or fabricated.</p>}

      <section className="content-card ai-issues-card" aria-labelledby="ai-issues-title">
        <div className="content-card__header"><p className="eyebrow">Admin diagnostics</p><h2 id="ai-issues-title">AI Visualizer Issues</h2></div>
        {issuesError && <div className="notification-inline-error" role="alert">{issuesError}</div>}
        {issues.length === 0 && !issuesError && <div className="data-state data-state--compact">No AI system issues have been recorded.</div>}
        {issues.length > 0 && <div className="ai-issue-list">
          {issues.map((issue) => (
            <article className={`ai-issue ${selectedIssueId === issue.id ? 'is-selected' : ''}`} id={`ai-issue-${issue.id}`} key={issue.id}>
              <div className="ai-issue__heading">
                <div><span className={`issue-severity issue-severity--${issue.severity}`}>{issue.severity}</span><span className={`status-badge status-badge--${issue.status === 'resolved' ? 'succeeded' : 'failed'}`}>{issue.status}</span><h3>{issue.title}</h3></div>
                {issue.status === 'unresolved' && <button className="button button--secondary" type="button" disabled={resolvingIssueId === issue.id} onClick={() => void resolveIssue(issue.id)}>{resolvingIssueId === issue.id ? 'Resolving...' : 'Mark Resolved'}</button>}
              </div>
              <p>{issue.admin_summary}</p>
              <dl className="ai-issue__details">
                <div><dt>Category</dt><dd><code>{issue.failure_category}</code></dd></div>
                <div><dt>Stage</dt><dd>{issue.failure_stage.replaceAll('_', ' ')}</dd></div>
                <div><dt>Environment</dt><dd>{issue.environment}</dd></div>
                <div><dt>Occurrences</dt><dd>{issue.occurrence_count}</dd></div>
                <div><dt>Last seen</dt><dd>{formatDateTime(issue.last_seen_at)}</dd></div>
                <div><dt>Workflow</dt><dd><code>{issue.workflow_request_id}</code></dd></div>
                {issue.provider_request_id && <div><dt>Provider request</dt><dd><code>{issue.provider_request_id}</code></dd></div>}
              </dl>
              <div className="ai-issue__action"><strong>Recommended action</strong><p>{issue.recommended_action}</p></div>
              {issue.resolved_at && <small>Resolved {formatDateTime(issue.resolved_at)}</small>}
            </article>
          ))}
        </div>}
      </section>

      {isLoading && <div className="data-state">Loading AI usage...</div>}
      {!isLoading && error && <div className="data-state data-state--error" role="alert">{error}</div>}
      {!isLoading && !error && generationRows.length === 0 && detectionRows.length === 0 && workflowRows.length === 0 && providerActivityRows.length === 0 && providerCostRows.length === 0 && (
        <section className="content-card empty-state ai-usage-empty">
          <div className="empty-state__icon" aria-hidden="true">AI</div>
          <strong>No AI usage has been recorded for this period yet.</strong>
          <p>Try another date range.</p>
        </section>
      )}

      {!isLoading && !error && (generationRows.length > 0 || detectionRows.length > 0 || workflowRows.length > 0 || providerActivityRows.length > 0 || providerCostRows.length > 0) && (
        <>
          <section className="metric-grid ai-usage-metrics" aria-label="AI usage summary">
            <article className="metric-card metric-card--admin ai-metric-card"><MetricIcon name="usage" /><p>Combined Known Requests</p><strong>{new Intl.NumberFormat().format(metrics.reconciledRequests)}</strong><small>Provider export plus non-overlapping tracked requests</small></article>
            <article className="metric-card metric-card--admin ai-metric-card"><MetricIcon name="usage" /><p>Provider Export Requests</p><strong>{new Intl.NumberFormat().format(metrics.providerRequests)}</strong><small>{metrics.providerActivityStart ? `${metrics.providerActivityStart}–${metrics.providerActivityEnd} UTC` : 'No provider export coverage'}</small></article>
            <article className="metric-card metric-card--admin ai-metric-card"><MetricIcon name="usage" /><p>Individually Tracked Requests</p><strong>{new Intl.NumberFormat().format(metrics.individuallyTrackedRequests)}</strong><small>Generation and entrance request rows</small></article>
            <article className="metric-card metric-card--admin ai-metric-card"><MetricIcon name="usage" /><p>Tracked Outside Provider Export</p><strong>{new Intl.NumberFormat().format(metrics.trackedOutsideProviderCoverage)}</strong><small>Included in combined known requests, not provider billing</small></article>
            <article className="metric-card metric-card--admin ai-metric-card"><MetricIcon name="usage" /><p>Historical Aggregate Gap</p><strong>{new Intl.NumberFormat().format(metrics.historicalAggregateRequests)}</strong><small>Recovered without fabricating request rows</small></article>
            <article className="metric-card metric-card--admin ai-metric-card"><MetricIcon name="cost" /><p>Actual Provider Cost</p><strong>{formatProviderCost(metrics.actualProviderCost)}</strong><small>{metrics.actualProviderCost === null ? 'No verified provider cost export for this period' : `Verified export total: ${formatExactProviderCost(metrics.actualProviderCost)}`}</small></article>
            <article className="metric-card metric-card--admin ai-metric-card"><MetricIcon name="cost" /><p>Internal Estimated Cost</p><strong>{formatCost(metrics.cost)}</strong><small>{metrics.costIncomplete ? 'Known request rows only' : 'Calculated from request telemetry'}</small></article>
            <article className="metric-card metric-card--admin ai-metric-card"><MetricIcon name="successful" /><p>Provider Export Request Coverage</p><strong>{metrics.requestCoverage === null ? '—' : `${metrics.requestCoverage.toFixed(2)}%`}</strong><small>{metrics.providerActivityStart ? `Matched request rows within ${metrics.providerActivityStart}–${metrics.providerActivityEnd} UTC` : 'No provider export coverage'}</small></article>
            <article className="metric-card metric-card--admin ai-metric-card"><MetricIcon name="visualizations" /><p>Visualization Attempts</p><strong>{metrics.attempts}</strong>{metrics.started > 0 && <small>{metrics.started} currently started</small>}</article>
            <article className="metric-card metric-card--admin ai-metric-card"><MetricIcon name="successful" /><p>Successful Visualizations</p><strong>{metrics.succeeded}</strong></article>
            <article className="metric-card metric-card--admin ai-metric-card"><MetricIcon name="failed" /><p>Failed Visualizations</p><strong>{metrics.failed}</strong></article>
            <article className="metric-card metric-card--admin ai-metric-card"><MetricIcon name="successful" /><p>Success Rate</p><strong>{metrics.successRate === null ? '—' : `${metrics.successRate.toFixed(1)}%`}</strong><small>Completed workflows</small></article>
            <article className="metric-card metric-card--admin ai-metric-card"><MetricIcon name="usage" /><p>Provider-Reported AI Usage</p><strong>{formatTokens(metrics.providerTokens)}</strong><small>{metrics.providerTokens === null ? 'No provider activity export for this period' : 'Imported aggregate token usage'}</small></article>
            <article className="metric-card metric-card--admin ai-metric-card"><MetricIcon name="time" /><p>Average Full Visualization Time</p><strong>{formatDuration(metrics.averageTotalDuration)}</strong><small>Successful workflows only</small></article>
          </section>

          <section className="content-card ai-usage-breakdown-card ai-provider-reconciliation">
            <div className="content-card__header"><p className="eyebrow">Provider reconciliation</p><h2>OpenAI Activity &amp; Cost</h2></div>
            <dl className="ai-combined-usage ai-combined-usage--provider">
              <div><dt>GPT-image 2.5</dt><dd>{new Intl.NumberFormat().format(metrics.modelCounts['gpt-image-2.5-sunburst'] ?? 0)}</dd><small>Image generation requests</small></div>
              <div><dt>GPT-5.4 mini</dt><dd>{new Intl.NumberFormat().format(metrics.modelCounts['gpt-5.4-mini'] ?? 0)}</dd><small>Entrance-analysis requests</small></div>
              <div><dt>GPT-4o mini</dt><dd>{new Intl.NumberFormat().format(metrics.modelCounts['gpt-4o-mini'] ?? 0)}</dd><small>Historical / unclassified</small></div>
            </dl>
            <div className="ai-provider-reconciliation__note">
              <strong>{metrics.providerRequests ? `${new Intl.NumberFormat().format(metrics.providerRequests)} provider requests reconciled` : 'No imported provider activity in this range'}</strong>
              <p>{metrics.actualProviderCost === null
                ? 'No verified provider cost export covers the selected period. Internal estimates remain estimates and are not presented as provider billing.'
                : `Actual provider cost is verified only for imported UTC dates ${metrics.providerCostStart} through ${metrics.providerCostEnd}. ${metrics.trackedOutsideProviderCoverage ? `${new Intl.NumberFormat().format(metrics.trackedOutsideProviderCoverage)} additional tracked requests fall outside that provider-export coverage and are excluded from actual provider cost.` : ''} Internal estimates are shown separately and are never substituted for provider charges.`}</p>
            </div>
          </section>

          <section className="content-card ai-usage-breakdown-card">
            <div className="content-card__header"><p className="eyebrow">Workflow outcomes</p><h2>Failure Breakdown</h2></div>
            <dl className="ai-combined-usage">
              <div><dt>Analysis Failures</dt><dd>{metrics.analysisFailures}</dd></div>
              <div><dt>Generation Failures</dt><dd>{metrics.generationFailures}</dd></div>
              <div><dt>Infrastructure Failures</dt><dd>{metrics.infrastructureFailures}</dd></div>
            </dl>
          </section>

          <section className="content-card ai-usage-breakdown-card">
            <div className="content-card__header"><p className="eyebrow">Request-level telemetry</p><h2>Individually Tracked Usage</h2></div>
            <dl className="ai-combined-usage">
              <div><dt>Entrance Analysis Requests</dt><dd>{new Intl.NumberFormat().format(metrics.analysisCalls)}</dd><small>Individual rows only</small></div>
              <div><dt>Image Generation Requests</dt><dd>{new Intl.NumberFormat().format(metrics.generationCalls)}</dd><small>Individual rows only</small></div>
              <div><dt>Tracked AI Usage</dt><dd>{formatTokens(metrics.totalTokens)}</dd>{metrics.totalUsageIncomplete && <small>Known request rows only</small>}</div>
              <div><dt>Internal Estimated Cost</dt><dd>{formatCost(metrics.cost)}</dd><small>{metrics.costIncomplete ? 'Known request rows only' : 'Calculated estimate, not provider billing'}</small></div>
            </dl>
          </section>

          <section className="content-card ai-usage-details">
            <div className="content-card__header"><p className="eyebrow">Performance Details</p><h2>Successful visualizations</h2></div>
            <dl className="ai-performance-details">
              <div className="ai-performance-details__primary"><dd>{formatDuration(metrics.averageTotalDuration)}</dd><dt>Average Full Visualization Time</dt></div>
              <div><dd>{formatDuration(metrics.averageEntranceStageDuration)}</dd><dt>Average Entrance Analysis Stage</dt>{metrics.averageEntranceStageDuration === null && <small>Recorded for new visualizations after deployment</small>}</div>
              <div><dd>{formatDuration(metrics.averageSunburstStageDuration)}</dd><dt>Average Sunburst Generation Time</dt>{metrics.averageSunburstStageDuration === null && <small>Recorded for new visualizations after deployment</small>}</div>
            </dl>
            <p className="ai-usage-technical-note">Technical diagnostic: Avg GPT-5.4-mini API Time {formatDuration(metrics.averageDetectionDuration)}</p>
          </section>

          <section className="content-card ai-usage-table-card">
            <div className="content-card__header"><p className="eyebrow">Activity</p><h2>Recent Generations</h2></div>
            <div className="table-scroll">
              <table className="leads-table admin-table ai-usage-table">
                <thead><tr><th>Date / Time</th><th>Status</th><th>Model</th><th>Total AI Usage</th><th>Estimated Cost</th><th>Total Time</th><th>Reference</th></tr></thead>
                <tbody>
                  {generationRows.slice(0, 50).map((row) => (
                    <tr key={row.id}>
                      <td data-label="Date / Time">{formatDateTime(row.created_at)}</td>
                      <td data-label="Status"><span className={`status-badge status-badge--${row.status}`}>{row.status === 'succeeded' ? 'Success' : 'Failed'}</span>{row.error_code && <small className="ai-usage-error-code">{row.error_code}</small>}</td>
                      <td data-label="Model">{row.model}</td>
                      <td data-label="Total AI Usage">{canonicalTotal(row) === null ? '—' : new Intl.NumberFormat().format(canonicalTotal(row)!)}</td>
                      <td data-label="Estimated Cost">{formatCost(row.estimated_cost_usd)}</td>
                      <td data-label="Total Time"><span>{formatDuration(row.total_visualization_duration_ms)}</span>{row.openai_generation_duration_ms !== null && <small>OpenAI: {formatDuration(row.openai_generation_duration_ms)}</small>}</td>
                      <td data-label="Reference"><code>{row.request_id}</code></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
