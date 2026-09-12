import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AdminLeadDetail } from '../components/AdminLeadDetail'
import type { AdminDataState, AdminLead } from '../types/admin'
import { dateStamp, exportCsv, type CsvColumn } from '../utils/csvExport'

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

function getLeadOwner(lead: AdminLead, dealerNames: Map<string, string>) {
  return lead.dealer_id === null ? 'HGI' : dealerNames.get(lead.dealer_id) ?? 'Unknown Dealer'
}

export function AdminLeadsPage({ dealers, leads, isLoading, error }: AdminDataState) {
  const navigate = useNavigate()
  const { leadId } = useParams()
  const [search, setSearch] = useState('')
  const [dealerId, setDealerId] = useState('all')
  const [status, setStatus] = useState('All')

  const dealerNames = useMemo(
    () => new Map(dealers.map((dealer) => [dealer.id, dealer.company_name])),
    [dealers],
  )
  const selectedLead = leadId ? leads.find((lead) => lead.id === leadId) ?? null : null

  function openLead(lead: AdminLead) {
    navigate(`/admin/leads/${lead.id}`)
  }

  function closeLead() {
    navigate('/admin/leads')
  }

  const filteredLeads = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    const normalizedFilter = normalizeStatus(status)

    return leads.filter((lead) => {
      const dealerName = getLeadOwner(lead, dealerNames)
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
      const matchesDealer =
        dealerId === 'all' ||
        (dealerId === 'hgi' ? lead.dealer_id === null : lead.dealer_id === dealerId)
      const matchesStatus =
        status === 'All' || normalizeStatus(lead.status) === normalizedFilter

      return matchesSearch && matchesDealer && matchesStatus
    })
  }, [dealerId, dealerNames, leads, search, status])

  const exportColumns: CsvColumn<AdminLead>[] = [
    { header: 'Lead Owner', value: (lead) => getLeadOwner(lead, dealerNames) },
    { header: 'First Name', value: (lead) => lead.first_name },
    { header: 'Last Name', value: (lead) => lead.last_name },
    { header: 'Email', value: (lead) => lead.email },
    { header: 'Phone', value: (lead) => lead.phone },
    { header: 'Address', value: (lead) => lead.address },
    { header: 'City', value: (lead) => lead.city },
    { header: 'State', value: (lead) => lead.state },
    { header: 'ZIP', value: (lead) => lead.zip },
    { header: 'Lead Date', value: (lead) => lead.created_at.slice(0, 10) },
    { header: 'Lead Status', value: (lead) => formatStatus(lead.status) },
    { header: 'Lead Source', value: (lead) => lead.source },
    { header: 'Visualizer URL', value: (lead) => lead.visualizer_url },
  ]

  return (
    <div className="page-content">
      <header className="page-header admin-page-header">
        <p className="eyebrow">Home Guard</p>
        <h1>All Leads</h1>
        <p>View customer inquiries submitted directly to HGI or through a dealer.</p>
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
              <option value="hgi">HGI</option>
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
          <div className="lead-filters__action">
            <button
              className="button button--outline"
              type="button"
              disabled={isLoading || Boolean(error) || filteredLeads.length === 0}
              onClick={() => exportCsv(`home-guard-leads-${dateStamp()}.csv`, filteredLeads, exportColumns)}
            >
              Export Leads
            </button>
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
                  <th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.map((lead) => (
                  <tr
                    className="lead-row"
                    key={lead.id}
                    tabIndex={0}
                    onClick={() => openLead(lead)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        openLead(lead)
                      }
                    }}
                  >
                    <td data-label="Name"><strong>{lead.first_name} {lead.last_name}</strong></td>
                    <td data-label="Dealer">{getLeadOwner(lead, dealerNames)}</td>
                    <td data-label="Email">{lead.email}</td>
                    <td data-label="Phone">{lead.phone || '—'}</td>
                    <td data-label="ZIP">{lead.zip || '—'}</td>
                    <td data-label="Date">{formatDate(lead.created_at)}</td>
                    <td data-label="Status">
                      <span className={`status-badge status-badge--${normalizeStatus(lead.status).replaceAll(' ', '-')}`}>
                        {formatStatus(lead.status)}
                      </span>
                    </td>
                    <td data-label="Action">
                      <button className="lead-view-button" type="button" onClick={(event) => {
                        event.stopPropagation()
                        openLead(lead)
                      }}>View</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {selectedLead && (
        <AdminLeadDetail
          lead={selectedLead}
          dealerName={getLeadOwner(selectedLead, dealerNames)}
          onClose={closeLead}
        />
      )}
    </div>
  )
}
