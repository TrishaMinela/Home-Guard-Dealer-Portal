import { useMemo, useState } from 'react'
import type { AdminDataState } from '../types/admin'

const statusOptions = [
  'All',
  'New',
  'Contacted',
  'Appointment Scheduled',
  'Quoted',
  'Sold',
  'Lost',
]

function normalizeStatus(status: string) {
  return status.trim().toLowerCase().replaceAll('_', ' ')
}

function formatStatus(status: string) {
  return normalizeStatus(status).replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date))
}

export function AdminLeadsPage({ dealers, leads, isLoading, error }: AdminDataState) {
  const [search, setSearch] = useState('')
  const [dealerId, setDealerId] = useState('all')
  const [status, setStatus] = useState('All')

  const dealerNames = useMemo(
    () => new Map(dealers.map((dealer) => [dealer.id, dealer.company_name])),
    [dealers],
  )

  const filteredLeads = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    const normalizedFilter = normalizeStatus(status)

    return leads.filter((lead) => {
      const dealerName = dealerNames.get(lead.dealer_id) ?? ''
      const matchesSearch =
        !normalizedSearch ||
        [
          lead.first_name,
          lead.last_name,
          dealerName,
          lead.email,
          lead.phone,
          lead.zip,
        ]
          .filter(Boolean)
          .some((value) => value?.toLowerCase().includes(normalizedSearch))
      const matchesDealer = dealerId === 'all' || lead.dealer_id === dealerId
      const matchesStatus =
        status === 'All' || normalizeStatus(lead.status) === normalizedFilter

      return matchesSearch && matchesDealer && matchesStatus
    })
  }, [dealerId, dealerNames, leads, search, status])

  return (
    <div className="page-content">
      <header className="page-header admin-page-header">
        <p className="eyebrow">Home Guard</p>
        <h1>All Leads</h1>
        <p>View customer inquiries across every authorized dealer.</p>
      </header>

      <section className="content-card leads-card">
        <div className="lead-filters lead-filters--admin">
          <div className="filter-field filter-field--search">
            <label htmlFor="admin-lead-search">Search leads</label>
            <input
              id="admin-lead-search"
              type="search"
              placeholder="Name, dealer, email, phone, or ZIP"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="filter-field">
            <label htmlFor="admin-lead-dealer">Dealer</label>
            <select
              id="admin-lead-dealer"
              value={dealerId}
              onChange={(event) => setDealerId(event.target.value)}
            >
              <option value="all">All Dealers</option>
              {dealers.map((dealer) => (
                <option key={dealer.id} value={dealer.id}>{dealer.company_name}</option>
              ))}
            </select>
          </div>
          <div className="filter-field">
            <label htmlFor="admin-lead-status">Status</label>
            <select
              id="admin-lead-status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              {statusOptions.map((option) => <option key={option}>{option}</option>)}
            </select>
          </div>
        </div>

        {isLoading && <div className="data-state">Loading all leads...</div>}
        {!isLoading && error && <div className="data-state data-state--error" role="alert">{error}</div>}
        {!isLoading && !error && filteredLeads.length === 0 && (
          <div className="data-state">
            {leads.length === 0 ? 'No leads yet.' : 'No leads match your filters.'}
          </div>
        )}
        {!isLoading && !error && filteredLeads.length > 0 && (
          <div className="table-scroll">
            <table className="leads-table admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Dealer</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>ZIP</th>
                  <th>Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.map((lead) => (
                  <tr key={lead.id}>
                    <td data-label="Name"><strong>{lead.first_name} {lead.last_name}</strong></td>
                    <td data-label="Dealer">{dealerNames.get(lead.dealer_id) ?? 'Unknown Dealer'}</td>
                    <td data-label="Email">{lead.email}</td>
                    <td data-label="Phone">{lead.phone || '—'}</td>
                    <td data-label="ZIP">{lead.zip || '—'}</td>
                    <td data-label="Date">{formatDate(lead.created_at)}</td>
                    <td data-label="Status">
                      <span className={`status-badge status-badge--${normalizeStatus(lead.status).replaceAll(' ', '-')}`}>
                        {formatStatus(lead.status)}
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
