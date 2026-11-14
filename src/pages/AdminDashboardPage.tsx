import { useId, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { PersistedAdminNotification } from '../hooks/useAdminNotifications'
import type { AdminDataState } from '../types/admin'
import type { AiAdminIssue } from '../types/aiAdminIssue'
import { formatPortalDateTime } from '../utils/dateTime'
import { LeadActivityChart } from './adminDashboard/LeadActivityChart'
import {
  DASHBOARD_RANGES,
  activityPanelState,
  attentionPanelState,
  buildActivityRows,
  buildAttentionItems,
  buildKpis,
  type AttentionItem,
  type DashboardRange,
  type KpiModel,
} from './adminDashboard/metrics'
import './AdminDashboardPage.css'

type AdminDashboardPageProps = AdminDataState & {
  notifications: PersistedAdminNotification[]
  notificationsLoading: boolean
  notificationError: string
  aiIssues: AiAdminIssue[]
  aiIssuesLoading: boolean
  onNotificationOpen: (notification: PersistedAdminNotification) => void
}

const rangeLabels: Record<DashboardRange, string> = {
  '7d': '7d',
  '30d': '30d',
  '90d': '90d',
  all: 'All',
}

function formatWhen(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return formatPortalDateTime(value)
}

export function AdminDashboardPage({
  dealers,
  leads,
  isLoading,
  error,
  notifications,
  notificationsLoading,
  notificationError,
  aiIssues,
  aiIssuesLoading,
  onNotificationOpen,
}: AdminDashboardPageProps) {
  const navigate = useNavigate()
  const rangeLabelId = useId()
  const [range, setRange] = useState<DashboardRange>('30d')
  const now = new Date()
  const kpis = buildKpis({ leads, dealers, range, now })
  const attention = buildAttentionItems(dealers, aiIssues)
  const requests = attention.filter((item) => item.kind === 'url_request')
  const issues = attention.filter((item) => item.kind === 'ai_issue')
  const attentionState = attentionPanelState({
    isLoading,
    requestCount: requests.length,
    issueCount: issues.length,
    issuesLoading: aiIssuesLoading,
  })
  const rows = buildActivityRows(notifications, leads, dealers)
  const activityState = activityPanelState({
    isLoading: isLoading || notificationsLoading,
    error: notificationError,
    count: rows.length,
  })
  const notificationById = new Map(notifications.map((notification) => [notification.id, notification]))

  function openNotification(notification: PersistedAdminNotification) {
    onNotificationOpen(notification)
    navigate(notification.path)
  }

  return (
    <div className="admin-dashboard-shell">
    <div className="admin-dashboard">
      <header className="dash-header">
        <div className="dash-header__copy">
          <h1>Dashboard</h1>
          <p>Overview of dealers, leads, and activity across the portal.</p>
        </div>
        <div className="dash-range-wrap">
          <div
            className="dash-range"
            role="radiogroup"
            aria-labelledby={rangeLabelId}
            aria-describedby="dashboard-range-hint"
          >
            <span id={rangeLabelId} className="dash-sr">Date range</span>
            {DASHBOARD_RANGES.map((option) => (
              <label key={option} className={range === option ? 'is-selected' : undefined}>
                <input
                  type="radio"
                  name="dashboard-range"
                  value={option}
                  checked={range === option}
                  onChange={() => setRange(option)}
                />
                <span>{rangeLabels[option]}</span>
              </label>
            ))}
          </div>
          <p className="dash-range__hint" id="dashboard-range-hint">Filters lead totals and the chart.</p>
        </div>
      </header>

      {error && <div className="dash-alert" role="alert">{error}</div>}
      {notificationError && <div className="dash-alert" role="alert">{notificationError}</div>}

      <section className="dash-kpis" aria-label="Summary" aria-busy={isLoading}>
        {kpis.map((kpi) => (
          <KpiCard key={kpi.id} kpi={kpi} isLoading={isLoading} />
        ))}
      </section>

      <div className="dash-insights">
        <LeadActivityChart leads={leads} range={range} now={now} isLoading={isLoading} error={error} />
        <NeedsAttention
          state={attentionState}
          requests={requests}
          issues={issues}
          issuesLoading={aiIssuesLoading}
          notificationError={notificationError}
        />
      </div>

      <section className="dash-panel dash-activity" aria-labelledby="recent-activity-title">
        <header className="dash-panel__header">
          <div>
            <h2 id="recent-activity-title">Recent activity</h2>
            <p>Unread notifications. Opening an item marks it read and follows its existing link. Not filtered by the date range.</p>
          </div>
        </header>

        {activityState === 'loading' && <p className="dash-status" role="status">Loading recent activity.</p>}
        {activityState === 'error' && (
          <div className="dash-status dash-status--error" role="alert">
            <strong>Recent activity could not be loaded.</strong>
            <p>{notificationError}</p>
          </div>
        )}
        {activityState === 'empty' && <p className="dash-status" role="status">No unread notifications.</p>}
        {activityState === 'ready' && (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th scope="col">Activity</th>
                  <th scope="col">Customer or dealer</th>
                  <th scope="col">When</th>
                  <th scope="col"><span className="dash-sr">Action</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td data-label="Activity"><span className="dash-cell">{row.typeLabel}</span></td>
                    <td data-label="Customer or dealer">
                      <span className="dash-cell">
                        <span className="dash-subject">{row.subject}</span>
                        {row.context && <span className="dash-context">{row.context}</span>}
                      </span>
                    </td>
                    <td data-label="When">
                      <span className="dash-cell">
                        {row.occurredAt
                          ? <time dateTime={row.occurredAt}>{formatWhen(row.occurredAt)}</time>
                          : <span>—</span>}
                      </span>
                    </td>
                    <td data-label="Action">
                      <span className="dash-cell">
                      <button
                        className="dash-action"
                        type="button"
                        onClick={() => {
                          const notification = notificationById.get(row.id)
                          if (notification) openNotification(notification)
                        }}
                      >
                        {row.actionLabel}
                      </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
    </div>
  )
}

function KpiCard({ kpi, isLoading }: { kpi: KpiModel; isLoading: boolean }) {
  const body = (
    <>
      <h2>{kpi.label}</h2>
      <p className="dash-kpi__value">{isLoading ? '—' : kpi.value.toLocaleString('en-US')}</p>
      <p className="dash-kpi__desc">{kpi.description}</p>
      <p className="dash-kpi__note">{kpi.note}</p>
    </>
  )

  if (isLoading || !kpi.href) return <article className="dash-kpi">{body}</article>
  if (kpi.href.startsWith('#')) {
    return <a className="dash-kpi dash-kpi--link" href={kpi.href}>{body}</a>
  }
  return <Link className="dash-kpi dash-kpi--link" to={kpi.href}>{body}</Link>
}

function NeedsAttention({
  state,
  requests,
  issues,
  issuesLoading,
  notificationError,
}: {
  state: 'loading' | 'empty' | 'ready'
  requests: AttentionItem[]
  issues: AttentionItem[]
  issuesLoading: boolean
  notificationError: string
}) {
  const showGroups = requests.length > 0 && (issues.length > 0 || issuesLoading)

  return (
    <section className="dash-panel dash-attention" id="needs-attention" aria-labelledby="needs-attention-title">
      <header className="dash-panel__header">
        <div>
          <h2 id="needs-attention-title">Needs attention</h2>
          <p>Outstanding Visualizer URL requests{issues.length > 0 || issuesLoading ? ' and unresolved AI issues' : ''}.</p>
        </div>
      </header>

      {state === 'loading' && <p className="dash-status" role="status">Loading attention items.</p>}
      {state === 'empty' && (
        notificationError
          ? <p className="dash-status" role="status">Needs attention could not be fully loaded.</p>
          : <p className="dash-status" role="status">No pending Visualizer URL requests or unresolved AI issues.</p>
      )}
      {state === 'ready' && (
        <div className="dash-attention__groups">
          {requests.length > 0 && (
            <AttentionGroup title={showGroups ? 'Visualizer URL requests' : undefined} items={requests} />
          )}
          {issuesLoading && <p className="dash-status dash-status--compact" role="status">Loading AI issues.</p>}
          {issues.length > 0 && (
            <AttentionGroup title={showGroups ? 'AI Visualizer' : undefined} items={issues} />
          )}
        </div>
      )}
    </section>
  )
}

function AttentionGroup({ title, items }: { title?: string; items: AttentionItem[] }) {
  return (
    <div className="dash-attention__group">
      {title && <h3>{title}</h3>}
      <ul>
        {items.map((item) => (
          <li className="dash-attention__item" key={item.id}>
            <div className="dash-attention__copy">
              <p className={`dash-pill dash-pill--${item.indicator}`}>{item.indicatorLabel}</p>
              <strong>{item.title}</strong>
              <span>{item.detail}</span>
              {item.meta && <span className="dash-context">{item.meta}</span>}
              {item.occurredAt && <time dateTime={item.occurredAt}>{formatWhen(item.occurredAt)}</time>}
            </div>
            <Link className="dash-action" to={item.href}>{item.actionLabel}</Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
