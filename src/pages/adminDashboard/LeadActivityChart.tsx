import { useEffect, useId, useRef, useState } from 'react'
import {
  LEAD_SERIES_LIMITATION,
  axisLabelIndexes,
  buildLeadActivity,
  leadChartState,
  yAxisTicks,
  type ActivityBucket,
  type DashboardRange,
  type LeadActivity,
  type LeadTimestamp,
} from './metrics'

type LeadActivityChartProps = {
  leads: LeadTimestamp[]
  range: DashboardRange
  now: Date
  isLoading: boolean
  error: string
}

export function LeadActivityChart({ leads, range, now, isLoading, error }: LeadActivityChartProps) {
  const titleId = useId()
  const summaryId = useId()
  const plotRef = useRef<HTMLDivElement>(null)
  const [plotWidth, setPlotWidth] = useState(640)
  const activity = buildLeadActivity(leads, range, now)
  const state = leadChartState({ isLoading, error, totalInRange: activity.total })

  useEffect(() => {
    const element = plotRef.current
    if (!element) return
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0
      if (width >= 200) setPlotWidth(Math.round(width))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <section className="dash-panel dash-chart" aria-labelledby={titleId}>
      <header className="dash-panel__header">
        <div>
          <h2 id={titleId}>Lead activity</h2>
          <p>{activity.grain === 'month' && state === 'ready' ? 'Submissions by month' : 'Submissions by day'}</p>
        </div>
      </header>
      <div className="dash-chart__body" ref={plotRef}>
        {state === 'loading' && (
          <div className="dash-chart__state" role="status">
            <div className="dash-skeleton" aria-hidden="true" />
            <p>Loading lead activity.</p>
          </div>
        )}
        {state === 'error' && (
          <div className="dash-chart__state dash-chart__state--error" role="alert">
            <strong>Lead activity could not be loaded.</strong>
            <p>{error}</p>
          </div>
        )}
        {state === 'empty' && (
          <div className="dash-chart__state" role="status">
            <strong>No lead submissions in this range.</strong>
            <p>
              {range === 'all'
                ? 'Loaded leads do not include a usable submission time.'
                : 'Try a wider date range to see older submissions.'}
            </p>
          </div>
        )}
        {state === 'ready' && (
          <ChartFigure activity={activity} width={plotWidth} summaryId={summaryId} />
        )}
      </div>
      <p className="dash-caption">{LEAD_SERIES_LIMITATION}</p>
    </section>
  )
}

function ChartFigure({
  activity,
  width,
  summaryId,
}: {
  activity: LeadActivity
  width: number
  summaryId: string
}) {
  const height = 228
  const padding = { top: 18, right: width < 520 ? 64 : 18, bottom: 32, left: 36 }
  const plotWidth = Math.max(10, width - padding.left - padding.right)
  const plotHeight = height - padding.top - padding.bottom
  const maxCount = activity.buckets.reduce((max, bucket) => Math.max(max, bucket.count), 0)
  const ticks = yAxisTicks(maxCount)
  const yMax = ticks[ticks.length - 1] || 1
  const maxLabels = width < 420 ? 4 : width < 680 ? 5 : activity.buckets.length <= 7 ? activity.buckets.length : 6
  const labelIndexes = new Set(axisLabelIndexes(activity.buckets.length, maxLabels))
  const points = activity.buckets.map((bucket, index) => {
    const x = activity.buckets.length === 1
      ? padding.left + plotWidth / 2
      : padding.left + (index / (activity.buckets.length - 1)) * plotWidth
    const y = padding.top + plotHeight - (bucket.count / yMax) * plotHeight
    return { x, y, bucket }
  })
  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ')
  const baseline = padding.top + plotHeight
  const area = points.length > 1
    ? `${line} L ${points[points.length - 1].x.toFixed(1)} ${baseline.toFixed(1)} L ${points[0].x.toFixed(1)} ${baseline.toFixed(1)} Z`
    : ''

  return (
    <figure className="dash-chart__figure">
      <p className="dash-chart__summary" id={summaryId}>{activity.summary}</p>
      <svg
        role="img"
        aria-labelledby={summaryId}
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
      >
        {ticks.map((tick) => {
          const y = padding.top + plotHeight - (tick / yMax) * plotHeight
          return (
            <g key={tick}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
                stroke="#e4ebe9"
                strokeWidth="1"
              />
              <text
                x={padding.left - 8}
                y={y}
                fill="#687276"
                fontSize="11"
                fontFamily="Montserrat, Arial, sans-serif"
                textAnchor="end"
                dominantBaseline="middle"
              >
                {tick}
              </text>
            </g>
          )
        })}
        {area && <path d={area} fill="rgba(13,102,108,0.12)" stroke="none" />}
        {points.length > 1 && (
          <path
            d={line}
            fill="none"
            stroke="#0d666c"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {points.length <= 45 && points.map((point) => (
          <Point key={point.bucket.key} point={point} single={points.length === 1} />
        ))}
        {points.map((point, index) => (
          labelIndexes.has(index) ? (
            <text
              key={`${point.bucket.key}-label`}
              x={point.x}
              y={height - 8}
              fill="#687276"
              fontSize="11"
              fontFamily="Montserrat, Arial, sans-serif"
              textAnchor={points.length === 1 ? 'middle' : index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}
            >
              {point.bucket.label}
            </text>
          ) : null
        ))}
      </svg>
      <div className="dash-sr">
      <table>
        <caption>Lead submissions over time. {activity.summary}</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            <th scope="col">Submissions</th>
          </tr>
        </thead>
        <tbody>
          {activity.buckets.map((bucket) => (
            <tr key={bucket.key}>
              <td>{bucket.label}</td>
              <td>{bucket.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </figure>
  )
}

function Point({ point, single }: { point: { x: number; y: number; bucket: ActivityBucket }; single: boolean }) {
  return (
    <circle cx={point.x} cy={point.y} r={single ? 4.5 : 3.25} fill="#0d666c" stroke="#ffffff" strokeWidth="1.5">
      <title>{`${point.bucket.label}: ${point.bucket.count} ${point.bucket.count === 1 ? 'submission' : 'submissions'}`}</title>
    </circle>
  )
}
