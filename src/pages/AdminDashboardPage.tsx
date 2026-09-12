import { Link } from 'react-router-dom'
import type { AdminDataState } from '../types/admin'

export function AdminDashboardPage({
  dealers,
  leads,
  isLoading,
  error,
}: AdminDataState) {
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
  const pendingRequests = dealers.filter(
    (dealer) => dealer.slug_request_status === 'pending' && dealer.requested_slug,
  )
  const newLeads = leads.filter(
    (lead) => lead.status.trim().toLowerCase() === 'new',
  )
  const hasNotifications = pendingRequests.length > 0 || newLeads.length > 0

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

        {isLoading && <div className="data-state data-state--compact">Loading notifications...</div>}
        {!isLoading && !hasNotifications && (
          <div className="data-state data-state--compact">No new notifications.</div>
        )}
        {!isLoading && hasNotifications && (
          <div className="notification-list">
            {pendingRequests.map((dealer) => (
              <article className="notification-item" key={`slug-${dealer.id}`}>
                <div className="notification-icon notification-icon--request" aria-hidden="true">URL</div>
                <div className="notification-copy">
                  <p>Visualizer URL request</p>
                  <strong>{dealer.company_name} requested /{dealer.requested_slug}</strong>
                </div>
                <Link className="button button--outline" to={`/admin/dealers/${dealer.id}`}>
                  View Request
                </Link>
              </article>
            ))}
            {newLeads.map((lead) => (
              <article className="notification-item" key={`lead-${lead.id}`}>
                <div className="notification-icon notification-icon--lead" aria-hidden="true">Lead</div>
                <div className="notification-copy">
                  <p>New Lead</p>
                  <strong>{lead.first_name} {lead.last_name} submitted a request</strong>
                </div>
                <Link className="button button--outline" to={`/admin/leads/${lead.id}`}>
                  View Lead
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
