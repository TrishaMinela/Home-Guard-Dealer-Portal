import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import type { AiEntranceDetectionUsage, AiGenerationUsage, AiUsagePeriod, AiVisualizationWorkflow } from '../types/aiUsage'

const periods: Array<{ value: AiUsagePeriod; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: '7-days', label: 'Last 7 Days' },
  { value: '30-days', label: 'Last 30 Days' },
  { value: 'this-month', label: 'This Month' },
]

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

function periodStart(period: AiUsagePeriod) {
  const now = new Date()
  if (period === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (period === 'this-month') return new Date(now.getFullYear(), now.getMonth(), 1)
  const start = new Date(now)
  start.setDate(start.getDate() - (period === '7-days' ? 7 : 30))
  return start
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
  const [period, setPeriod] = useState<AiUsagePeriod>('this-month')
  const [generationRows, setGenerationRows] = useState<AiGenerationUsage[]>([])
  const [detectionRows, setDetectionRows] = useState<AiEntranceDetectionUsage[]>([])
  const [workflowRows, setWorkflowRows] = useState<AiVisualizationWorkflow[]>([])
  const [trackingBegan, setTrackingBegan] = useState<{ generation: string | null; detection: string | null; workflow: string | null }>({ generation: null, detection: null, workflow: null })
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [refreshError, setRefreshError] = useState('')
  const requestSequence = useRef(0)

  const loadUsage = useCallback(async (background: boolean) => {
      const requestId = ++requestSequence.current
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
        .gte('created_at', periodStart(period).toISOString())
        .order('created_at', { ascending: false })
      const detectionQuery = supabase
        .from('ai_entrance_detection_usage')
        .select('id, created_at, completed_at, status, environment, model, pass_type, input_tokens, cached_input_tokens, output_tokens, reasoning_tokens, total_tokens, estimated_cost_usd, detection_duration_ms, request_id, workflow_request_id, error_code')
        .gte('created_at', periodStart(period).toISOString())
        .order('created_at', { ascending: false })
      const workflowQuery = supabase
        .from('ai_visualization_workflows')
        .select('id, workflow_request_id, started_at, completed_at, environment, status, failure_stage, failure_category, analysis_request_id, analysis_provider_request_id, generation_request_id, generation_provider_request_id, estimated_total_cost_usd, duration_ms, created_at')
        .gte('started_at', periodStart(period).toISOString())
        .order('started_at', { ascending: false })
      const [{ data: generationData, error: generationError }, { data: detectionData, error: detectionError }, { data: workflowData, error: workflowError }] = await Promise.all([generationQuery, detectionQuery, workflowQuery])

      if (requestId !== requestSequence.current) return
      if (generationError || detectionError || workflowError) {
        console.error('Failed to load AI usage.', { generationError, detectionError, workflowError })
        if (background) {
          setRefreshError('Could not refresh AI usage. Your previous data is still shown.')
        } else {
          setError('We could not load AI usage right now. Please try again later.')
          setGenerationRows([])
          setDetectionRows([])
          setWorkflowRows([])
        }
      } else {
        setGenerationRows((generationData ?? []) as AiGenerationUsage[])
        setDetectionRows((detectionData ?? []) as AiEntranceDetectionUsage[])
        setWorkflowRows((workflowData ?? []) as AiVisualizationWorkflow[])
      }
      if (background) setIsRefreshing(false)
      else setIsLoading(false)
  }, [period])

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
  }, [generationRows, detectionRows, workflowRows])

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
          <div className="ai-usage-refresh">
            <button className="button ai-usage-refresh__button" type="button" disabled={isLoading || isRefreshing} onClick={() => void loadUsage(true)}>
              <RefreshIcon spinning={isRefreshing} />
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </button>
            {refreshError && <small className="ai-usage-refresh__error" role="alert">{refreshError}</small>}
          </div>
        </div>
      </header>
      {(trackingBegan.generation || trackingBegan.detection || trackingBegan.workflow) && <p className="ai-usage-tracking-note">Workflow-level attempts and failures are available from {trackingBegan.workflow ? formatDateTime(trackingBegan.workflow) : 'the workflow-tracking rollout'}. Image-generation tracking began {trackingBegan.generation ? formatDateTime(trackingBegan.generation) : 'after this period'}. Entrance-analysis tracking began {trackingBegan.detection ? formatDateTime(trackingBegan.detection) : 'after this period'}. Earlier workflow attempts are not inferred or fabricated.</p>}

      {isLoading && <div className="data-state">Loading AI usage...</div>}
      {!isLoading && error && <div className="data-state data-state--error" role="alert">{error}</div>}
      {!isLoading && !error && generationRows.length === 0 && detectionRows.length === 0 && workflowRows.length === 0 && (
        <section className="content-card empty-state ai-usage-empty">
          <div className="empty-state__icon" aria-hidden="true">AI</div>
          <strong>No AI usage has been recorded for this period yet.</strong>
          <p>Try another date range.</p>
        </section>
      )}

      {!isLoading && !error && (generationRows.length > 0 || detectionRows.length > 0 || workflowRows.length > 0) && (
        <>
          <section className="metric-grid ai-usage-metrics" aria-label="AI usage summary">
            <article className="metric-card metric-card--admin ai-metric-card"><MetricIcon name="visualizations" /><p>Visualization Attempts</p><strong>{metrics.attempts}</strong>{metrics.started > 0 && <small>{metrics.started} currently started</small>}</article>
            <article className="metric-card metric-card--admin ai-metric-card"><MetricIcon name="successful" /><p>Successful Visualizations</p><strong>{metrics.succeeded}</strong></article>
            <article className="metric-card metric-card--admin ai-metric-card"><MetricIcon name="failed" /><p>Failed Visualizations</p><strong>{metrics.failed}</strong></article>
            <article className="metric-card metric-card--admin ai-metric-card"><MetricIcon name="successful" /><p>Success Rate</p><strong>{metrics.successRate === null ? '—' : `${metrics.successRate.toFixed(1)}%`}</strong><small>Completed workflows</small></article>
            <article className="metric-card metric-card--admin ai-metric-card"><MetricIcon name="usage" /><p>Total AI Usage</p><strong>{formatTokens(metrics.totalTokens)}</strong>{metrics.totalUsageIncomplete && <small>Known records only</small>}</article>
            <article className="metric-card metric-card--admin ai-metric-card"><MetricIcon name="cost" /><p>Estimated AI Cost</p><strong>{formatCost(metrics.cost)}</strong><small>{metrics.costIncomplete ? 'Known records only' : 'Calculated estimate'}</small></article>
            <article className="metric-card metric-card--admin ai-metric-card"><MetricIcon name="time" /><p>Average Full Visualization Time</p><strong>{formatDuration(metrics.averageTotalDuration)}</strong><small>Successful workflows only</small></article>
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
            <div className="content-card__header"><p className="eyebrow">Complete AI workflow</p><h2>AI Usage</h2></div>
            <dl className="ai-combined-usage">
              <div><dt>Entrance Analysis Calls</dt><dd>{new Intl.NumberFormat().format(metrics.analysisCalls)}</dd></div>
              <div><dt>Image Generation Calls</dt><dd>{new Intl.NumberFormat().format(metrics.generationCalls)}</dd></div>
              <div><dt>Total AI Usage</dt><dd>{formatTokens(metrics.totalTokens)}</dd>{metrics.totalUsageIncomplete && <small>Known records only</small>}</div>
              <div><dt>Estimated AI Cost</dt><dd>{formatCost(metrics.cost)}</dd><small>{metrics.costIncomplete ? 'Known records only' : 'Calculated estimate'}</small></div>
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
