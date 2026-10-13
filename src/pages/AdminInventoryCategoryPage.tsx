import { Link, useParams } from 'react-router-dom'

const categoryLabels: Record<string, string> = {
  'materials-series': 'Door Materials / Series',
  finishes: 'Finishes',
  glass: 'Glass',
  sidelites: 'Sidelites',
  hardware: 'Hardware',
  grids: 'Grids',
}

export function AdminInventoryCategoryPage() {
  const { category } = useParams()
  const label = categoryLabels[category ?? '']

  if (!label) {
    return (
      <div className="page-content">
        <section className="content-card empty-state">
          <strong>Inventory category not found.</strong>
          <Link className="button button--outline" to="/admin/inventory">Back to Inventory</Link>
        </section>
      </div>
    )
  }

  return (
    <div className="page-content">
      <header className="page-header admin-page-header">
        <p className="eyebrow">Inventory</p>
        <h1>{label}</h1>
        <p>Category management will be added in a later Inventory Admin phase.</p>
      </header>
      <section className="content-card empty-state inventory-empty">
        <div className="empty-state__icon" aria-hidden="true">INV</div>
        <strong>{label} management is coming soon.</strong>
        <p>The current phase is read-only and does not change catalog records.</p>
        <Link className="button button--outline" to="/admin/inventory">Back to Inventory</Link>
      </section>
    </div>
  )
}
