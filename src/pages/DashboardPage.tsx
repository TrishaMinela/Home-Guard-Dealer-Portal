const metrics = [
  'New Leads',
  'Leads This Month',
  'Leads Last 30 Days',
  'Total Leads',
]

type DashboardPageProps = {
  dealerName: string
}

export function DashboardPage({ dealerName }: DashboardPageProps) {
  return (
    <div className="page-content">
      <header className="page-header">
        <p className="eyebrow">Dashboard</p>
        <h1>Welcome, {dealerName}</h1>
        <p>Here’s a quick look at your dealer activity.</p>
      </header>

      <section className="metric-grid" aria-label="Lead summary">
        {metrics.map((metric) => (
          <article className="metric-card" key={metric}>
            <p>{metric}</p>
            <strong>0</strong>
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
        <div className="empty-state">
          <span className="empty-state__icon" aria-hidden="true">
            HG
          </span>
          <p>No leads yet.</p>
        </div>
      </section>
    </div>
  )
}
