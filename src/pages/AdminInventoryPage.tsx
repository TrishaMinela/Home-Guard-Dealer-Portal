import { Link } from 'react-router-dom'
import { useInventoryDashboard } from '../hooks/useInventoryDashboard'

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

export function AdminInventoryPage() {
  const { revision, categories, isLoading, error, refresh } = useInventoryDashboard()

  return (
    <div className="page-content inventory-page">
      <header className="page-header admin-page-header">
        <p className="eyebrow">Home Guard</p>
        <h1>Inventory</h1>
        <p>Review the current Door Builder catalog and open each inventory category.</p>
      </header>

      {isLoading && <div className="data-state">Loading inventory...</div>}

      {!isLoading && error && (
        <section className="content-card inventory-error" role="alert">
          <strong>Inventory is temporarily unavailable.</strong>
          <p>{error}</p>
          <button className="button button--outline" type="button" onClick={() => void refresh()}>
            Try Again
          </button>
        </section>
      )}

      {!isLoading && !error && !revision && (
        <section className="content-card empty-state inventory-empty">
          <div className="empty-state__icon" aria-hidden="true">INV</div>
          <strong>No catalog revision exists yet.</strong>
          <p>Import a draft catalog before managing inventory.</p>
        </section>
      )}

      {!isLoading && !error && revision && (
        <>
          <section className="content-card catalog-status" aria-labelledby="catalog-status-title">
            <div>
              <p className="eyebrow">Current catalog</p>
              <h2 id="catalog-status-title">Catalog revision</h2>
            </div>
            <span className={`catalog-status__badge catalog-status__badge--${revision.status}`}>
              {revision.status}
            </span>
            <dl className="catalog-status__details">
              <div>
                <dt>Revision ID</dt>
                <dd>{revision.id}</dd>
              </div>
              <div>
                <dt>Source commit</dt>
                <dd>{revision.source_commit || 'Not recorded'}</dd>
              </div>
              <div>
                <dt>Last updated</dt>
                <dd>{formatDate(revision.updated_at)}</dd>
              </div>
            </dl>
          </section>

          <section className="inventory-grid" aria-label="Inventory categories">
            {categories.map((category) => (
              <article className="content-card inventory-card" key={category.key}>
                <div>
                  <p className="eyebrow">Catalog category</p>
                  <h2>{category.label}</h2>
                  <strong className="inventory-card__count">{category.countLabel}</strong>
                  <p>{category.description}</p>
                </div>
                <Link className="button button--outline" to={`/admin/inventory/${category.key}`}>
                  Manage
                </Link>
              </article>
            ))}
          </section>
        </>
      )}
    </div>
  )
}
