import type { LeadDataState } from '../types/lead'

type DashboardPageProps = LeadDataState & {
  dealerName: string
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date))
}

function formatStatus(status: string) {
  return status
    .trim()
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function DashboardPage({
  dealerName,
  leads,
  isLoading,
  error,
}: DashboardPageProps) {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const metrics = [
    {
      label: 'New Leads',
      value: leads.filter((lead) => lead.status.toLowerCase() === 'new').length,
    },
    {
      label: 'Leads This Month',
      value: leads.filter((lead) => new Date(lead.created_at) >= monthStart).length,
    },
    {
      label: 'Leads Last 30 Days',
      value: leads.filter((lead) => new Date(lead.created_at) >= thirtyDaysAgo).length,
    },
    { label: 'Total Leads', value: leads.length },
  ]

  const recentLeads = leads.slice(0, 5)

  return (
    <div className="page-content">
      <header className="page-header">
        <p className="eyebrow">Dashboard</p>
        <h1>Welcome, {dealerName}</h1>
        <p>Here’s a quick look at your dealer activity.</p>
      </header>

      {error && (
        <div className="portal-alert" role="alert">
          {error}
        </div>
      )}

      <section className="metric-grid" aria-label="Lead summary">
        {metrics.map((metric) => (
          <article className="metric-card" key={metric.label}>
            <p>{metric.label}</p>
            <strong>{isLoading ? '—' : metric.value}</strong>
          </article>
        ))}
      </section>

      <section className="content-card recent-leads">
        <div className="content-card__header">
          <div>
            <p className="eyebrow">Activity</p>
            <h2>Recent Leads</h2>
          </div>
        </div>

        {isLoading && <div className="data-state">Loading recent leads...</div>}
        {!isLoading && !error && recentLeads.length === 0 && (
          <div className="empty-state">
            <span className="empty-state__icon" aria-hidden="true">HG</span>
            <p>No leads yet.</p>
          </div>
        )}
        {!isLoading && !error && recentLeads.length > 0 && (
          <div className="recent-lead-list">
            {recentLeads.map((lead) => (
              <article className="recent-lead" key={lead.id}>
                <div className="lead-avatar" aria-hidden="true">
                  {lead.first_name.charAt(0)}{lead.last_name.charAt(0)}
                </div>
                <div className="recent-lead__customer">
                  <strong>{lead.first_name} {lead.last_name}</strong>
                  <span>{lead.email}</span>
                </div>
                <span className="recent-lead__zip">{lead.zip || 'No ZIP'}</span>
                <span className="status-badge">{formatStatus(lead.status)}</span>
                <time dateTime={lead.created_at}>{formatDate(lead.created_at)}</time>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
