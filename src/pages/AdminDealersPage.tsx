import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { AdminDataState, AdminDealer } from '../types/admin'
import { dateStamp, exportCsv, type CsvColumn } from '../utils/csvExport'

const dealerExportColumns: CsvColumn<AdminDealer>[] = [
  { header: 'Company Name', value: (dealer) => dealer.company_name },
  { header: 'Slug', value: (dealer) => dealer.slug },
  { header: 'Primary Contact', value: (dealer) => dealer.primary_contact_name },
  { header: 'Email', value: (dealer) => dealer.email },
  { header: 'Phone', value: (dealer) => dealer.phone },
  { header: 'Website', value: (dealer) => dealer.website },
  { header: 'Address', value: (dealer) => dealer.address },
  { header: 'City', value: (dealer) => dealer.city },
  { header: 'State', value: (dealer) => dealer.state },
  { header: 'ZIP', value: (dealer) => dealer.zip },
  { header: 'Primary Brand Color', value: (dealer) => dealer.primary_color },
  { header: 'Secondary Brand Color', value: (dealer) => dealer.secondary_color },
  { header: 'Primary Logo URL', value: (dealer) => dealer.logo_url },
  { header: 'Light Logo URL', value: (dealer) => dealer.logo_light_url },
  { header: 'Status', value: (dealer) => dealer.is_active ? 'Active' : 'Disabled' },
  { header: 'Requested Slug', value: (dealer) => dealer.requested_slug },
  { header: 'Slug Request Status', value: (dealer) => dealer.slug_request_status },
  { header: 'Created Date', value: (dealer) => dealer.created_at.slice(0, 10) },
]

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
          <button
            className="button button--outline"
            type="button"
            disabled={isLoading || Boolean(error) || filteredDealers.length === 0}
            onClick={() => exportCsv(`home-guard-dealers-${dateStamp()}.csv`, filteredDealers, dealerExportColumns)}
          >
            Export Dealers
          </button>
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
