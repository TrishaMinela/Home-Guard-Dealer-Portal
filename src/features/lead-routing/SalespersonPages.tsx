import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { postLeadRouting } from './api'
import { LeadQueuePage } from './LeadQueuePage'
import { LeadReviewPage } from './LeadReviewPage'
import { RoutingShell } from './RoutingShell'
import { statusLabel, type QueueLead, type ReviewModel, type RoutingStatus } from './types'

function missingRelation(error: { code?: string; message?: string } | null) {
  if (!error) return false
  return error.code === 'PGRST205' || error.code === '42P01' || /schema cache|does not exist/i.test(error.message ?? '')
}

export function SalesQueuePage({ reviewPath = '/sales/leads' }: { reviewPath?: string }) {
  const navigate = useNavigate()
  const [leads, setLeads] = useState<QueueLead[]>([])
  const [message, setMessage] = useState('')
  useEffect(() => {
    let current = true
    void supabase.from('lead_routing_cases').select('id, lead_id, normalized_zip, status, unassigned_reason, created_at, leads(first_name, last_name), dealers:proposed_dealer_id(company_name)').order('created_at', { ascending: false }).then(({ data, error }) => {
      if (!current) return
      if (error) {
        setMessage(missingRelation(error) ? 'ZIP routing is not installed in this database yet.' : 'Unable to load the lead queue.')
        return
      }
      setLeads((data ?? []).map((row) => mapQueue(row)))
    })
    return () => { current = false }
  }, [])
  return (
    <div>
      {message && <p className="lr-note">{message}</p>}
      <LeadQueuePage leads={leads} eyebrow="Salesperson" title="My lead queue" intro="You only see main HGI leads assigned to you. Opening another person’s link does not show their customer details." onOpen={(leadId) => navigate(`${reviewPath}/${leadId}`)} />
    </div>
  )
}

export function SalesLeadReviewPage() {
  const { leadId = '' } = useParams()
  const [review, setReview] = useState<ReviewModel | null>(null)
  const [denied, setDenied] = useState(false)
  const [notice, setNotice] = useState('')
  const [sending, setSending] = useState(false)
  useEffect(() => {
    let current = true
    void supabase.from('lead_routing_cases').select('id, lead_id, normalized_zip, status, proposed_dealer_id, leads(first_name, last_name, email, phone, comments, door_configuration), salespeople:salesperson_id(display_name), dealers:proposed_dealer_id(company_name, email, is_active), lead_routing_audit_log(action, result, created_at)').eq('lead_id', leadId).maybeSingle().then(({ data, error }) => {
      if (!current) return
      if (error || !data) {
        setDenied(true)
        return
      }
      setReview(mapReview(data))
    })
    return () => { current = false }
  }, [leadId])

  async function send() {
    if (!review) return
    setSending(true)
    const result = await postLeadRouting({ action: 'send_dealer_notification', caseId: review.caseId, dealerId: review.dealerId })
    setSending(false)
    if (!result.ok) {
      setNotice(result.payload.error === 'lead_routing_disabled' ? 'Lead routing is disabled in this environment, so no dealer was contacted.' : 'The notification was not sent.')
      return
    }
    setNotice(result.payload.result === 'succeeded' ? 'The dealer notification was sent once.' : `Notification result: ${result.payload.result ?? 'recorded'}.`)
    setReview((current) => current && result.payload.result === 'succeeded' ? { ...current, status: 'notified' } : current)
  }

  async function repropose() {
    if (!review) return
    const result = await postLeadRouting({ action: 'repropose_dealer', caseId: review.caseId })
    setNotice(result.ok ? 'The proposal was refreshed. No dealer was contacted.' : 'The proposal was not changed.')
  }

  return <LeadReviewPage review={review} accessDenied={denied} notice={notice} sending={sending} onSend={() => void send()} onRepropose={() => void repropose()} />
}

export function SalespersonLayout({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  return (
    <RoutingShell email={email} role="Salesperson" onSignOut={onSignOut} links={[{ to: '/sales', label: 'My queue', end: true }]}>
      <Routes>
        <Route path="/sales" element={<SalesQueuePage />} />
        <Route path="/sales/leads/:leadId" element={<SalesLeadReviewPage />} />
        <Route path="*" element={<Navigate to="/sales" replace />} />
      </Routes>
    </RoutingShell>
  )
}

function mapQueue(row: Record<string, unknown>): QueueLead {
  const lead = one(row.leads)
  const dealer = one(row.dealers)
  const status = String(row.status ?? 'unassigned') as RoutingStatus
  return {
    caseId: String(row.id),
    leadId: String(row.lead_id),
    name: `${text(lead?.first_name)} ${text(lead?.last_name)}`.trim() || 'Homeowner',
    zip: text(row.normalized_zip) || 'Unknown',
    status,
    reason: text(row.unassigned_reason) || statusLabel(status),
    dealerName: text(dealer?.company_name) || 'Not proposed',
    createdLabel: text(row.created_at)?.slice(0, 16).replace('T', ' ') || '',
  }
}

function mapReview(row: Record<string, unknown>): ReviewModel {
  const lead = one(row.leads)
  const dealer = one(row.dealers)
  const salesperson = one(row.salespeople)
  const configuration = configurationRows(lead?.door_configuration)
  const history = Array.isArray(row.lead_routing_audit_log) ? row.lead_routing_audit_log.map((entry) => {
    const item = entry as Record<string, unknown>
    return { at: text(item.created_at) ?? '', label: text(item.action) ?? 'Event', detail: text(item.result) ?? '' }
  }) : []
  return {
    caseId: String(row.id),
    leadId: String(row.lead_id),
    name: `${text(lead?.first_name)} ${text(lead?.last_name)}`.trim(),
    email: text(lead?.email) ?? '',
    phone: text(lead?.phone) ?? '',
    zip: text(row.normalized_zip) ?? '',
    notes: text(lead?.comments) ?? '',
    status: String(row.status) as RoutingStatus,
    salesperson: text(salesperson?.display_name) ?? 'Unassigned',
    dealerId: text(row.proposed_dealer_id) ?? '',
    dealerName: text(dealer?.company_name) ?? '',
    dealerEmail: text(dealer?.email) ?? '',
    dealerActive: dealer?.is_active !== false && Boolean(row.proposed_dealer_id),
    configuration,
    history,
  }
}

function configurationRows(value: unknown): Array<[string, string]> {
  const record = value && typeof value === 'object' ? value as { configuration?: Record<string, unknown> } : {}
  const configuration = record.configuration ?? {}
  const rows: Array<[string, string]> = []
  const add = (label: string, entry: unknown) => {
    const display = typeof entry === 'string' ? entry : entry && typeof entry === 'object' && 'name' in entry ? String((entry as { name?: unknown }).name ?? '') : ''
    if (display) rows.push([label, display])
  }
  add('Door line', configuration.doorLine)
  add('Style', configuration.style)
  add('Finish', configuration.finish)
  add('Glass', configuration.mainDoorGlass ?? configuration.glass)
  add('Sidelites', configuration.sidelitePlacement)
  add('Swing', configuration.doorSwing)
  return rows.length ? rows : [['Configuration', 'Stored with this lead']]
}

function one(value: unknown) {
  const row = Array.isArray(value) ? value[0] : value
  return row && typeof row === 'object' ? row as Record<string, unknown> : null
}

function text(value: unknown) {
  return typeof value === 'string' ? value : ''
}
