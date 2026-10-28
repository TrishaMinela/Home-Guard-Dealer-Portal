import { useMemo, useState } from 'react'
import { AdminLeadDetail } from '../components/AdminLeadDetail'
import type { Lead, LeadDataState } from '../types/lead'
import { dateStamp, exportCsv, type CsvColumn } from '../utils/csvExport'
import { formatCsvTimestamp, formatPortalDateTime } from '../utils/dateTime'

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

const dealerExportColumns: CsvColumn<Lead>[] = [
  { header: 'First Name', value: (lead) => lead.first_name },
  { header: 'Last Name', value: (lead) => lead.last_name },
  { header: 'Email', value: (lead) => lead.email },
  { header: 'Phone', value: (lead) => lead.phone },
  { header: 'Address', value: (lead) => lead.address },
  { header: 'City', value: (lead) => lead.city },
  { header: 'State', value: (lead) => lead.state },
  { header: 'ZIP', value: (lead) => lead.zip },
  { header: 'Lead Date', value: (lead) => lead.created_at.slice(0, 10) },
  { header: 'Date Entered', value: (lead) => formatCsvTimestamp(lead.created_at) },
  { header: 'Lead Status', value: (lead) => formatStatus(lead.status) },
  { header: 'Lead Source', value: (lead) => lead.source },
  { header: 'Visualizer URL', value: (lead) => lead.visualizer_url },
]

type LeadsPageProps = LeadDataState & { dealerSlug: string; dealerName: string }

export function LeadsPage({ leads, isLoading, error, dealerSlug, dealerName }: LeadsPageProps) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('All')
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)

  const filteredLeads = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    const normalizedFilter = normalizeStatus(status)

    return leads.filter((lead) => {
      const matchesSearch =
        !normalizedSearch ||
        [lead.first_name, lead.last_name, lead.email, lead.phone, lead.zip]
          .filter(Boolean)
          .some((value) => value?.toLowerCase().includes(normalizedSearch))
      const matchesStatus =
        status === 'All' || normalizeStatus(lead.status) === normalizedFilter

      return matchesSearch && matchesStatus
    })
  }, [leads, search, status])

  return (
    <div className="page-content">
      <header className="page-header">
        <p className="eyebrow">Customers</p>
        <h1>Leads</h1>
        <p>View customer inquiries connected to your dealership.</p>
      </header>

      <section className="content-card leads-card">
        <div className="lead-filters">
          <div className="filter-field filter-field--search">
            <label htmlFor="lead-search">Search leads</label>
            <input
              id="lead-search"
              type="search"
              placeholder="Name, email, phone, or ZIP"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="filter-field">
            <label htmlFor="lead-status">Status</label>
            <select
              id="lead-status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              {statusOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </div>
          <div className="lead-filters__action">
            <button
              className="button button--outline"
              type="button"
              disabled={isLoading || Boolean(error) || filteredLeads.length === 0}
              onClick={() => exportCsv(`${dealerSlug}-leads-${dateStamp()}.csv`, filteredLeads, dealerExportColumns)}
            >
              Export Leads
            </button>
          </div>
        </div>

        {isLoading && <div className="data-state">Loading leads...</div>}
        {!isLoading && error && (
          <div className="data-state data-state--error" role="alert">
            {error}
          </div>
        )}
        {!isLoading && !error && filteredLeads.length === 0 && (
          <div className="data-state">
            {leads.length === 0 ? 'No leads yet.' : 'No leads match your filters.'}
          </div>
        )}
        {!isLoading && !error && filteredLeads.length > 0 && (
          <div className="table-scroll">
            <table className="leads-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>ZIP</th>
                  <th>Date Entered</th>
                  <th>Status</th>
                  <th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.map((lead) => (
                  <tr className="lead-row" key={lead.id} tabIndex={0} onClick={() => setSelectedLead(lead)} onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setSelectedLead(lead)
                    }
                  }}>
                    <td data-label="Name">
                      <strong>{lead.first_name} {lead.last_name}</strong>
                    </td>
                    <td data-label="Email">{lead.email}</td>
                    <td data-label="Phone">{lead.phone || '—'}</td>
                    <td data-label="ZIP">{lead.zip || '—'}</td>
                    <td data-label="Date Entered"><time dateTime={lead.created_at}>{formatPortalDateTime(lead.created_at)}</time></td>
                    <td data-label="Status">
                      <span className={`status-badge status-badge--${normalizeStatus(lead.status).replaceAll(' ', '-')}`}>
                        {formatStatus(lead.status)}
                      </span>
                    </td>
                    <td data-label="Action"><button className="lead-view-button" type="button" onClick={(event) => {
                      event.stopPropagation()
                      setSelectedLead(lead)
                    }}>View</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {selectedLead && <AdminLeadDetail lead={selectedLead} dealerName={dealerName} onClose={() => setSelectedLead(null)} />}
    </div>
  )
}
