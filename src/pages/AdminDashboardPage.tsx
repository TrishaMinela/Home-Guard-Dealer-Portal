import { useNavigate } from 'react-router-dom'
import type { PersistedAdminNotification } from '../hooks/useAdminNotifications'
import type { AdminDataState } from '../types/admin'

type AdminDashboardPageProps = AdminDataState & {
  notifications: PersistedAdminNotification[]
  notificationsLoading: boolean
  notificationError: string
  onNotificationOpen: (notification: PersistedAdminNotification) => void
}

export function AdminDashboardPage({
  dealers,
  leads,
  isLoading,
  error,
  notifications,
  notificationsLoading,
  notificationError,
  onNotificationOpen,
}: AdminDashboardPageProps) {
  const navigate = useNavigate()
  const metrics = [
    { label: 'Total Dealers', value: dealers.length },
    {
      label: 'Active Dealers',
      value: dealers.filter((dealer) => dealer.is_active).length,
    },
    { label: 'Total Leads', value: leads.length },
    {
      label: 'New Leads',
      value: leads.filter((lead) => lead.status.trim().toLowerCase() === 'new').length,
    },
    {
      label: 'Pending URL Requests',
      value: dealers.filter((dealer) => dealer.slug_request_status === 'pending').length,
    },
  ]
  const hasNotifications = notifications.length > 0

  function openNotification(notification: PersistedAdminNotification) {
    onNotificationOpen(notification)
    navigate(notification.path)
  }

  return (
    <div className="page-content">
      <header className="page-header admin-page-header">
        <p className="eyebrow">Home Guard</p>
        <h1>Home Guard Admin Dashboard</h1>
        <p>Overview of dealers and leads across the portal.</p>
      </header>

      {error && <div className="portal-alert" role="alert">{error}</div>}

      <section className="metric-grid metric-grid--admin" aria-label="Home Guard summary">
        {metrics.map((metric) => (
          <article className="metric-card metric-card--admin" key={metric.label}>
            <p>{metric.label}</p>
            <strong>{isLoading ? '—' : metric.value}</strong>
          </article>
        ))}
      </section>

      <section className="content-card admin-notifications" aria-labelledby="notifications-title">
        <div className="content-card__header">
          <p className="eyebrow">Activity</p>
          <h2 id="notifications-title">Notifications</h2>
        </div>

        {notificationError && <div className="notification-inline-error" role="alert">{notificationError}</div>}
        {(isLoading || notificationsLoading) && <div className="data-state data-state--compact">Loading notifications...</div>}
        {!isLoading && !notificationsLoading && !hasNotifications && (
          <div className="data-state data-state--compact">No new notifications.</div>
        )}
        {!isLoading && !notificationsLoading && hasNotifications && (
          <div className="notification-list">
            {notifications.map((notification) => (
              <article
                className="notification-item notification-item--clickable"
                key={notification.id}
                role="link"
                tabIndex={0}
                onClick={() => openNotification(notification)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    openNotification(notification)
                  }
                }}
              >
                <div className={`notification-icon notification-icon--${notification.type}`} aria-hidden="true">
                  {notification.type === 'request' ? 'URL' : 'Lead'}
                </div>
                <div className="notification-copy">
                  <p>{notification.title}</p>
                  <strong>{notification.message}</strong>
                </div>
                <button className="button button--outline" type="button" onClick={(event) => {
                  event.stopPropagation()
                  openNotification(notification)
                }}>
                  {notification.actionLabel}
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
