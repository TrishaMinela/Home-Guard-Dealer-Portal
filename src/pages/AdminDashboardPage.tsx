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
  ]

  return (
    <div className="page-content">
      <header className="page-header admin-page-header">
        <p className="eyebrow">Home Guard</p>
        <h1>Home Guard Admin Dashboard</h1>
        <p>Overview of dealers and leads across the portal.</p>
      </header>

      {error && <div className="portal-alert" role="alert">{error}</div>}

      <section className="metric-grid" aria-label="Home Guard summary">
        {metrics.map((metric) => (
          <article className="metric-card metric-card--admin" key={metric.label}>
            <p>{metric.label}</p>
            <strong>{isLoading ? '—' : metric.value}</strong>
          </article>
        ))}
      </section>
    </div>
  )
}
