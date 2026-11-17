import { useState } from 'react'
import './lead-routing.css'
import type { CoverageRow, QueueLead, SalespersonRow, TerritoryRow } from './types'
import { LeadQueuePage } from './LeadQueuePage'

export function TerritoryAdminPage({
  territories,
  coverage,
  salespeople,
  unassigned,
  notice,
  onSaveTerritory,
  onSaveCoverage,
  onOpen,
}: {
  territories: TerritoryRow[]
  coverage: CoverageRow[]
  salespeople: SalespersonRow[]
  unassigned: QueueLead[]
  notice?: string
  onSaveTerritory?: (zip: string, salesperson: string) => void
  onSaveCoverage?: (zip: string, dealer: string) => void
  onOpen: (leadId: string) => void
}) {
  const [zip, setZip] = useState('46204')
  const [salesperson, setSalesperson] = useState(salespeople[0]?.name ?? '')
  const [coverageZip, setCoverageZip] = useState('46204')
  const [dealer, setDealer] = useState('')
  return (
    <div className="lr-page">
      <header>
        <p className="lr-kicker">Home Guard admin</p>
        <h1>ZIP territories</h1>
        <p className="lr-intro">Assign each ZIP to one salesperson and list the active dealers who cover it. Routing stays off until the environment flags are enabled, and enabling routing still does not email a dealer.</p>
      </header>
      {notice && <p className="lr-note" role="status">{notice}</p>}
      <section className="lr-card">
        <h2>ZIP to salesperson</h2>
        <form className="lr-form" onSubmit={(event) => { event.preventDefault(); onSaveTerritory?.(zip, salesperson) }}>
          <label>ZIP<input value={zip} inputMode="numeric" maxLength={10} onChange={(event) => setZip(event.target.value)} /></label>
          <label>Salesperson
            <select value={salesperson} onChange={(event) => setSalesperson(event.target.value)}>
              {salespeople.map((person) => <option key={person.email} value={person.name}>{person.name}</option>)}
            </select>
          </label>
          <button className="button button--primary" type="submit">Save territory</button>
        </form>
        <Table headers={['ZIP', 'Salesperson', 'Active']} rows={territories.map((row) => [row.zip, row.salesperson, row.active ? 'Active' : 'Inactive'])} />
      </section>
      <section className="lr-card">
        <h2>Dealer coverage</h2>
        <form className="lr-form" onSubmit={(event) => { event.preventDefault(); onSaveCoverage?.(coverageZip, dealer) }}>
          <label>ZIP<input value={coverageZip} inputMode="numeric" maxLength={10} onChange={(event) => setCoverageZip(event.target.value)} /></label>
          <label>Dealer<input value={dealer} onChange={(event) => setDealer(event.target.value)} placeholder="Dealer company" /></label>
          <button className="button button--outline" type="submit">Save coverage</button>
        </form>
        <Table headers={['ZIP', 'Dealer', 'Active']} rows={coverage.map((row) => [row.zip, row.dealer, row.active ? 'Active' : 'Inactive'])} />
      </section>
      <section className="lr-card">
        <h2>Salespeople</h2>
        <Table headers={['Name', 'Email', 'Active']} rows={salespeople.map((row) => [row.name, row.email, row.active ? 'Active' : 'Inactive'])} />
        <p className="lr-muted">An inactive salesperson’s open leads move to the unassigned queue. Notified history stays available to admins.</p>
      </section>
      <LeadQueuePage
        leads={unassigned}
        eyebrow="Admin queue"
        title="Unassigned ZIPs"
        intro="These main HGI leads have no active salesperson. They are flagged here and no dealer notification can be sent."
        onOpen={onOpen}
      />
    </div>
  )
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="lr-table-wrap">
      <table className="lr-table">
        <thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
        <tbody>{rows.map((row) => <tr key={row.join('|')}>{row.map((cell) => <td key={cell}>{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}
