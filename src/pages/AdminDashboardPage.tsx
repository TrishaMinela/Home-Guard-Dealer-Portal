import { Link, useNavigate } from 'react-router-dom'
import type { PersistedAdminNotification } from '../hooks/useAdminNotifications'
import type { AdminDataState } from '../types/admin'
import type { AiAdminIssue } from '../types/aiAdminIssue'
import { formatPortalDateTime } from '../utils/dateTime'

type AdminDashboardPageProps = AdminDataState & {
  notifications: PersistedAdminNotification[]
  notificationsLoading: boolean
  notificationError: string
  aiIssues: AiAdminIssue[]
  aiIssuesLoading: boolean
  onNotificationOpen: (notification: PersistedAdminNotification) => void
}

function activityTime(notification: PersistedAdminNotification, dealers: AdminDataState['dealers'], leads: AdminDataState['leads']) {
  if (notification.occurredAt) return notification.occurredAt
  if (notification.type === 'lead') {
    return leads.find((lead) => notification.id === `lead-${lead.id}`)?.created_at
  }
  if (notification.type === 'request') {
    return dealers.find((dealer) => notification.id === `slug-${dealer.id}`)?.slug_requested_at
  }
  return undefined
}

function activityLabel(type: PersistedAdminNotification['type']) {
  if (type === 'request') return 'URL request'
  if (type === 'ai_issue') return 'AI issue'
  return 'New lead'
}

export function AdminDashboardPage({
  dealers,
  leads,
  isLoading,
  error,
  refresh,
  notifications,
  notificationsLoading,
  notificationError,
  aiIssues,
  aiIssuesLoading,
  onNotificationOpen,
}: AdminDashboardPageProps) {
  const navigate = useNavigate()
  const activeDealers = dealers.filter((dealer) => dealer.is_active).length
  const newLeads = leads.filter((lead) => lead.status.trim().toLowerCase() === 'new').length
  const pendingRequests = dealers.filter((dealer) => dealer.slug_request_status === 'pending').length
  const metrics = [
    {
      label: 'Total Dealers',
      value: dealers.length,
      hint: 'Dealer records',
      to: '/admin/dealers',
    },
    {
      label: 'Active Dealers',
      value: activeDealers,
      hint: isLoading ? 'Currently enabled' : `${dealers.length - activeDealers} disabled`,
      to: '/admin/dealers',
    },
    {
      label: 'Total Leads',
      value: leads.length,
      hint: 'Submitted inquiries',
      to: '/admin/leads',
    },
    {
      label: 'New Leads',
      value: newLeads,
      hint: isLoading ? 'Status is New' : `${leads.length - newLeads} in other statuses`,
      to: '/admin/leads',
    },
    {
      label: 'Pending URL Requests',
      value: pendingRequests,
      hint: 'Awaiting review',
      to: '/admin/dealers',
      attention: !isLoading && pendingRequests > 0,
    },
  ]
  const hasNotifications = notifications.length > 0
  const activityLoading = isLoading || notificationsLoading
  const criticalIssues = aiIssues.filter((issue) => issue.severity === 'critical')
  const summary = isLoading
    ? 'Loading dealers and leads.'
    : error && dealers.length === 0 && leads.length === 0
      ? 'Dealer and lead totals are unavailable right now.'
      : `${dealers.length} ${dealers.length === 1 ? 'dealer' : 'dealers'} and ${leads.length} ${leads.length === 1 ? 'lead' : 'leads'} across the portal.`

  function openNotification(notification: PersistedAdminNotification) {
    onNotificationOpen(notification)
    navigate(notification.path)
  }

  return (
    <div className="page-content admin-dashboard">
      <header className="admin-dashboard__header">
        <div className="admin-dashboard__intro">
          <p className="eyebrow">Home Guard Admin</p>
          <h1>Dashboard</h1>
          <p>{summary}</p>
        </div>
        <div className="admin-dashboard__actions">
          <button className="button button--outline" type="button" onClick={refresh} disabled={isLoading}>
            Refresh
          </button>
          <Link className="button button--outline" to="/admin/dealers">Dealers</Link>
          <Link className="button button--primary" to="/admin/leads">All leads</Link>
        </div>
      </header>

      {error && <div className="portal-alert" role="alert">{error}</div>}

      {!aiIssuesLoading && criticalIssues.length > 0 && (
        <section className="ai-critical-alert" role="alert">
          <div>
            <strong>AI Visualizer needs attention</strong>
            <span>{criticalIssues.length} unresolved critical {criticalIssues.length === 1 ? 'issue' : 'issues'}</span>
          </div>
          <button className="button button--outline" type="button" onClick={() => navigate(`/admin/ai-usage?issue=${criticalIssues[0].id}`)}>View issue</button>
        </section>
      )}

      <section className="metric-grid metric-grid--admin" aria-label="Home Guard summary" aria-busy={isLoading}>
        {metrics.map((metric) => (
          <Link
            className={`metric-card metric-card--admin admin-dashboard__metric${'attention' in metric && metric.attention ? ' admin-dashboard__metric--attention' : ''}`}
            key={metric.label}
            to={metric.to}
          >
            <p>{metric.label}</p>
            {isLoading ? <span className="admin-dashboard__skeleton" aria-label="Loading" /> : <strong>{metric.value}</strong>}
            <small>{metric.hint}</small>
          </Link>
        ))}
      </section>

      <section className="content-card admin-notifications" aria-labelledby="notifications-title" aria-busy={activityLoading}>
        <div className="content-card__header admin-dashboard__section-heading">
          <div>
            <p className="eyebrow">Activity</p>
            <h2 id="notifications-title">Notifications</h2>
          </div>
          {!activityLoading && <span className="admin-dashboard__count">{notifications.length}</span>}
        </div>

        {notificationError && <div className="notification-inline-error" role="alert">{notificationError}</div>}
        {activityLoading && <div className="admin-dashboard__state" role="status">Loading notifications...</div>}
        {!activityLoading && !hasNotifications && (
          <div className="admin-dashboard__state">
            <p>No new notifications.</p>
            <span>New leads, visualizer URL requests, and AI issues will appear here.</span>
          </div>
        )}
        {!activityLoading && hasNotifications && (
          <div className="admin-dashboard__table-wrap">
            <table className="admin-dashboard__table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Activity</th>
                  <th>When</th>
                  <th><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody>
                {notifications.map((notification) => {
                  const timestamp = activityTime(notification, dealers, leads)
                  return (
                    <tr
                      key={notification.id}
                      tabIndex={0}
                      onClick={() => openNotification(notification)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          openNotification(notification)
                        }
                      }}
                    >
                      <td data-label="Type">
                        <div className="admin-dashboard__type">
                          <span className={`status-badge admin-dashboard__badge admin-dashboard__badge--${notification.type}`}>
                            {activityLabel(notification.type)}
                          </span>
                          {notification.severity && (
                            <span className={`issue-severity issue-severity--${notification.severity}`}>{notification.severity}</span>
                          )}
                        </div>
                      </td>
                      <td data-label="Activity">
                        <strong>{notification.title}</strong>
                        <span>{notification.message}</span>
                        {notification.occurrenceCount && notification.occurrenceCount > 1 && (
                          <small>Seen {notification.occurrenceCount} times</small>
                        )}
                      </td>
                      <td data-label="When">
                        {timestamp ? <time dateTime={timestamp}>{formatPortalDateTime(timestamp)}</time> : '—'}
                      </td>
                      <td data-label="Action">
                        <button
                          className="button button--outline admin-dashboard__row-action"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            openNotification(notification)
                          }}
                          onKeyDown={(event) => event.stopPropagation()}
                        >
                          {notification.actionLabel}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
