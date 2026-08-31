import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { AdminDataState } from '../types/admin'

type AdminDealersPageProps = AdminDataState & {
  successMessage: string
  onClearSuccess: () => void
}

export function AdminDealersPage({
  dealers,
  isLoading,
  error,
  successMessage,
  onClearSuccess,
}: AdminDealersPageProps) {
  const [statusFilter, setStatusFilter] = useState('all')
  const navigate = useNavigate()
  const filteredDealers = dealers.filter((dealer) => {
    if (statusFilter === 'active') return dealer.is_active
    if (statusFilter === 'disabled') return !dealer.is_active
    return true
  })

  return (
    <div className="page-content">
      <header className="page-header admin-page-header page-header--with-action">
        <div>
          <p className="eyebrow">Home Guard</p>
          <h1>Dealers</h1>
          <p>View every dealership with access to the dealer portal.</p>
        </div>
        <Link
          className="button button--primary"
          to="/admin/dealers/new"
          onClick={onClearSuccess}
        >
          Add Dealer
        </Link>
      </header>

      {successMessage && (
        <div className="portal-alert portal-alert--success" role="status">
          {successMessage}
        </div>
      )}

      <section className="content-card leads-card">
        <div className="dealer-list-toolbar">
          <div className="filter-field">
            <label htmlFor="dealer-status-filter">Status</label>
            <select
              id="dealer-status-filter"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>
        </div>
        {isLoading && <div className="data-state">Loading dealers...</div>}
        {!isLoading && error && <div className="data-state data-state--error" role="alert">{error}</div>}
        {!isLoading && !error && dealers.length === 0 && <div className="data-state">No dealers yet.</div>}
        {!isLoading && !error && dealers.length > 0 && filteredDealers.length === 0 && (
          <div className="data-state">No dealers match this status.</div>
        )}
        {!isLoading && !error && filteredDealers.length > 0 && (
          <div className="table-scroll">
            <table className="leads-table admin-table">
              <thead>
                <tr>
                  <th>Company Name</th>
                  <th>Slug</th>
                  <th>Primary Contact</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredDealers.map((dealer) => (
                  <tr
                    className={`dealer-row ${dealer.is_active ? '' : 'dealer-row--disabled'}`}
                    key={dealer.id}
                    role="link"
                    tabIndex={0}
                    onClick={() => navigate(`/admin/dealers/${dealer.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        navigate(`/admin/dealers/${dealer.id}`)
                      }
                    }}
                  >
                    <td data-label="Company Name">
                      <div className="dealer-company-cell">
                        <strong>{dealer.company_name}</strong>
                        {dealer.slug_request_status === 'pending' && (
                          <span className="status-badge status-badge--pending-url">
                            URL Request Pending
                          </span>
                        )}
                      </div>
                    </td>
                    <td data-label="Slug">{dealer.slug}</td>
                    <td data-label="Primary Contact">{dealer.primary_contact_name || '—'}</td>
                    <td data-label="Email">{dealer.email || '—'}</td>
                    <td data-label="Phone">{dealer.phone || '—'}</td>
                    <td data-label="Status">
                      <span className={`status-badge ${dealer.is_active ? 'status-badge--active' : 'status-badge--inactive'}`}>
                        {dealer.is_active ? 'Active' : 'Inactive'}
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
  )
}
