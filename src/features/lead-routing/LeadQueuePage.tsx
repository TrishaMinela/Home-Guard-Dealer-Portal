import { useState } from 'react'
import './lead-routing.css'
import { statusLabel, type QueueLead, type RoutingStatus } from './types'

const filters: Array<{ id: 'all' | RoutingStatus; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'awaiting_approval', label: 'Needs approval' },
  { id: 'unassigned', label: 'Unassigned' },
  { id: 'notification_failed', label: 'Failed' },
  { id: 'notified', label: 'Notified' },
]

function tone(status: RoutingStatus) {
  if (status === 'notified') return 'done'
  if (status === 'awaiting_approval' || status === 'notification_sending') return 'attention'
  return 'problem'
}

export function LeadQueuePage({
  leads,
  eyebrow,
  title,
  intro,
  onOpen,
}: {
  leads: QueueLead[]
  eyebrow: string
  title: string
  intro: string
  onOpen: (leadId: string) => void
}) {
  const [filter, setFilter] = useState<(typeof filters)[number]['id']>('all')
  const visible = leads.filter((lead) => filter === 'all' || lead.status === filter)
  return (
    <div className="lr-page lr-queue">
      <header>
        <p className="lr-kicker">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="lr-intro">{intro}</p>
      </header>
      <div className="lr-banner" role="note">
        <strong>No dealer is contacted at submission.</strong>
        <span>A salesperson must open the lead and click Send Notification. Forwarded links do not grant access.</span>
      </div>
      <div className="lr-filters" role="toolbar" aria-label="Filter leads">
        {filters.map((item) => (
          <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}</button>
        ))}
      </div>
      <div className="lr-table-wrap">
        <table className="lr-table">
          <caption className="lr-muted">Leads in this queue</caption>
          <thead>
            <tr><th>Homeowner</th><th>ZIP</th><th>Status</th><th>Proposed dealer</th><th>Received</th></tr>
          </thead>
          <tbody>
            {visible.map((lead) => (
              <tr key={lead.caseId}>
                <td><button className="linkish" type="button" onClick={() => onOpen(lead.leadId)}>{lead.name}</button></td>
                <td>{lead.zip}</td>
                <td><span className={`lr-status lr-status--${tone(lead.status)}`}>{statusLabel(lead.status)}</span></td>
                <td>{lead.dealerName}</td>
                <td>{lead.createdLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="lr-cards">
        {visible.map((lead) => (
          <button className="lr-queue-card" type="button" key={lead.caseId} onClick={() => onOpen(lead.leadId)}>
            <strong>{lead.name}</strong>
            <span>ZIP {lead.zip}</span>
            <span className={`lr-status lr-status--${tone(lead.status)}`}>{statusLabel(lead.status)}</span>
            <span>{lead.dealerName}</span>
            <span className="lr-muted">{lead.reason}</span>
          </button>
        ))}
      </div>
      {visible.length === 0 && <p className="lr-note">No leads match this filter.</p>}
    </div>
  )
}
