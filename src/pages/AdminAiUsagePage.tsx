import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { AiEntranceDetectionUsage, AiGenerationUsage, AiUsageEnvironment, AiUsagePeriod } from '../types/aiUsage'

const periods: Array<{ value: AiUsagePeriod; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: '7-days', label: 'Last 7 Days' },
  { value: '30-days', label: 'Last 30 Days' },
  { value: 'this-month', label: 'This Month' },
]

const environments: Array<{ value: AiUsageEnvironment; label: string }> = [
  { value: 'all', label: 'All Environments' },
  { value: 'production', label: 'Production' },
  { value: 'preview', label: 'Preview' },
  { value: 'development', label: 'Development' },
]

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
  const [environment, setEnvironment] = useState<AiUsageEnvironment>('all')
  const [generationRows, setGenerationRows] = useState<AiGenerationUsage[]>([])
  const [detectionRows, setDetectionRows] = useState<AiEntranceDetectionUsage[]>([])
  const [trackingBegan, setTrackingBegan] = useState<{ generation: string | null; detection: string | null }>({ generation: null, detection: null })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let isCurrent = true
    async function loadUsage() {
      setIsLoading(true)
      setError('')
      let generationQuery = supabase
        .from('ai_generation_usage')
        .select('id, created_at, completed_at, status, model, quality, output_size, output_format, input_tokens, text_input_tokens, image_input_tokens, output_tokens, image_output_tokens, total_tokens, estimated_cost_usd, openai_generation_duration_ms, total_api_duration_ms, total_visualization_duration_ms, environment, request_id, error_code')
        .gte('created_at', periodStart(period).toISOString())
        .order('created_at', { ascending: false })
      let detectionQuery = supabase
        .from('ai_entrance_detection_usage')
        .select('id, created_at, completed_at, status, environment, model, pass_type, input_tokens, cached_input_tokens, output_tokens, reasoning_tokens, total_tokens, estimated_cost_usd, detection_duration_ms, request_id, workflow_request_id, error_code')
        .gte('created_at', periodStart(period).toISOString())
        .order('created_at', { ascending: false })
      if (environment !== 'all') {
        generationQuery = generationQuery.eq('environment', environment)
        detectionQuery = detectionQuery.eq('environment', environment)
      }
      const [{ data: generationData, error: generationError }, { data: detectionData, error: detectionError }] = await Promise.all([generationQuery, detectionQuery])

      if (!isCurrent) return
      if (generationError || detectionError) {
        console.error('Failed to load AI usage.', { generationError, detectionError })
        setError('We could not load AI usage right now. Please try again later.')
        setGenerationRows([])
        setDetectionRows([])
      } else {
        setGenerationRows((generationData ?? []) as AiGenerationUsage[])
        setDetectionRows((detectionData ?? []) as AiEntranceDetectionUsage[])
      }
      setIsLoading(false)
    }
    void loadUsage()
    return () => { isCurrent = false }
  }, [period, environment])

  useEffect(() => {
    let isCurrent = true
    void Promise.all([
      supabase.from('ai_generation_usage').select('created_at').order('created_at', { ascending: true }).limit(1).maybeSingle(),
      supabase.from('ai_entrance_detection_usage').select('created_at').order('created_at', { ascending: true }).limit(1).maybeSingle(),
    ]).then(([generationResult, detectionResult]) => {
        if (!isCurrent) return
        if (generationResult.error || detectionResult.error) console.error('Failed to load AI usage tracking start.', { generationError: generationResult.error, detectionError: detectionResult.error })
        else setTrackingBegan({ generation: generationResult.data?.created_at ?? null, detection: detectionResult.data?.created_at ?? null })
      })
    return () => { isCurrent = false }
  }, [])

  const metrics = useMemo(() => {
    const succeeded = generationRows.filter((row) => row.status === 'succeeded')
    const totalDurations = succeeded
      .map((row) => row.total_visualization_duration_ms)
      .filter((value): value is number => value !== null)
    const openAiDurations = succeeded.map((row) => row.openai_generation_duration_ms).filter((value): value is number => value !== null)
    const successfulDetections = detectionRows.filter((row) => row.status === 'succeeded')
    const detectionDurations = successfulDetections.map((row) => row.detection_duration_ms).filter((value): value is number => value !== null)
    const generationTokens = sumCanonicalTotals(generationRows)
    const detectionTokens = sumDetectionTotals(detectionRows)
    const generationCost = sumAvailable(generationRows, 'estimated_cost_usd')
    const detectionCost = sumAvailable(detectionRows, 'estimated_cost_usd')
    return {
      aiCalls: generationRows.length + detectionRows.length,
      succeeded: succeeded.length,
      failed: generationRows.filter((row) => row.status === 'failed').length,
      totalTokens: addKnown(generationTokens, detectionTokens),
      cost: addKnown(generationCost, detectionCost),
      costIncomplete: generationRows.some((row) => row.estimated_cost_usd === null) || detectionRows.some((row) => row.estimated_cost_usd === null),
      totalUsageIncomplete: generationRows.some((row) => row.status === 'succeeded' && canonicalTotal(row) === null) || detectionRows.some((row) => canonicalDetectionTotal(row) === null),
      averageTotalDuration: totalDurations.length
        ? totalDurations.reduce((sum, value) => sum + value, 0) / totalDurations.length
        : null,
      averageOpenAiDuration: openAiDurations.length ? openAiDurations.reduce((sum, value) => sum + value, 0) / openAiDurations.length : null,
      averageDetectionDuration: detectionDurations.length ? detectionDurations.reduce((sum, value) => sum + value, 0) / detectionDurations.length : null,
    }
  }, [generationRows, detectionRows])

  return (
    <div className="page-content ai-usage-page">
      <header className="page-header page-header--with-action">
        <div>
          <p className="eyebrow">Home Guard</p>
          <h1>AI Visualizer Usage</h1>
          <p>Monitor AI visualization volume, usage, cost, and generation performance.</p>
        </div>
        <div className="ai-usage-filters">
          <div className="filter-field ai-usage-period"><label htmlFor="ai-usage-period">Date range</label><select id="ai-usage-period" value={period} onChange={(event) => setPeriod(event.target.value as AiUsagePeriod)}>{periods.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
          <div className="filter-field ai-usage-period"><label htmlFor="ai-usage-environment">Environment</label><select id="ai-usage-environment" value={environment} onChange={(event) => setEnvironment(event.target.value as AiUsageEnvironment)}>{environments.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
        </div>
      </header>
      {(trackingBegan.generation || trackingBegan.detection) && <p className="ai-usage-tracking-note">Image-generation tracking began {trackingBegan.generation ? formatDateTime(trackingBegan.generation) : 'after this period'}. Entrance-analysis tracking began {trackingBegan.detection ? formatDateTime(trackingBegan.detection) : 'after this period'}. Earlier untracked activity is not included.</p>}

      {isLoading && <div className="data-state">Loading AI usage...</div>}
      {!isLoading && error && <div className="data-state data-state--error" role="alert">{error}</div>}
      {!isLoading && !error && generationRows.length === 0 && detectionRows.length === 0 && (
        <section className="content-card empty-state ai-usage-empty">
          <div className="empty-state__icon" aria-hidden="true">AI</div>
          <strong>No AI usage has been recorded for this period yet.</strong>
          <p>Try another date range or environment.</p>
        </section>
      )}

      {!isLoading && !error && (generationRows.length > 0 || detectionRows.length > 0) && (
        <>
          <section className="metric-grid ai-usage-metrics" aria-label="AI usage summary">
            <article className="metric-card metric-card--admin"><p>Visualizations Generated</p><strong>{generationRows.length}</strong></article>
            <article className="metric-card metric-card--admin"><p>Successful</p><strong>{metrics.succeeded}</strong></article>
            <article className="metric-card metric-card--admin"><p>Failed</p><strong>{metrics.failed}</strong></article>
            <article className="metric-card metric-card--admin"><p>Total AI Usage</p><strong>{formatTokens(metrics.totalTokens)}</strong>{metrics.totalUsageIncomplete && <small>Known records only</small>}</article>
            <article className="metric-card metric-card--admin"><p>Estimated AI Cost</p><strong>{formatCost(metrics.cost)}</strong><small>{metrics.costIncomplete ? 'Known records only' : 'Calculated estimate'}</small></article>
            <article className="metric-card metric-card--admin"><p>Average Full Visualization Time</p><strong>{formatDuration(metrics.averageTotalDuration)}</strong><small>Successful generations only</small></article>
          </section>

          <section className="content-card ai-usage-breakdown-card">
            <div className="content-card__header"><p className="eyebrow">Complete AI workflow</p><h2>AI Usage</h2></div>
            <dl className="ai-combined-usage">
              <div><dt>AI Calls</dt><dd>{new Intl.NumberFormat().format(metrics.aiCalls)}</dd></div>
              <div><dt>Total AI Usage</dt><dd>{formatTokens(metrics.totalTokens)}</dd>{metrics.totalUsageIncomplete && <small>Known records only</small>}</div>
              <div><dt>Estimated AI Cost</dt><dd>{formatCost(metrics.cost)}</dd><small>{metrics.costIncomplete ? 'Known records only' : 'Calculated estimate'}</small></div>
            </dl>
          </section>

          <section className="content-card ai-usage-details">
            <div className="content-card__header"><p className="eyebrow">Performance Details</p><h2>Successful visualizations</h2></div>
            <dl className="ai-performance-details">
              <div><dt>Avg Full Visualization Time</dt><dd>{formatDuration(metrics.averageTotalDuration)}</dd></div>
              <div><dt>Avg Entrance Analysis Time</dt><dd>{formatDuration(metrics.averageDetectionDuration)}</dd></div>
              <div><dt>Avg Sunburst Generation Time</dt><dd>{formatDuration(metrics.averageOpenAiDuration)}</dd></div>
            </dl>
          </section>

          <section className="content-card ai-usage-table-card">
            <div className="content-card__header"><p className="eyebrow">Activity</p><h2>Recent Generations</h2></div>
            <div className="table-scroll">
              <table className="leads-table admin-table ai-usage-table">
                <thead><tr><th>Date / Time</th><th>Environment</th><th>Status</th><th>Model</th><th>Total AI Usage</th><th>Estimated Cost</th><th>Total Time</th><th>Reference</th></tr></thead>
                <tbody>
                  {generationRows.slice(0, 50).map((row) => (
                    <tr key={row.id}>
                      <td data-label="Date / Time">{formatDateTime(row.created_at)}</td>
                      <td data-label="Environment"><span className="ai-environment-badge">{row.environment ? row.environment[0].toUpperCase() + row.environment.slice(1) : 'Unknown'}</span></td>
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
