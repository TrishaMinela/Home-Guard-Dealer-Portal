import { useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { LeadQueuePage } from './LeadQueuePage'
import { LeadReviewPage } from './LeadReviewPage'
import { RoutingShell } from './RoutingShell'
import { TerritoryAdminPage } from './TerritoryAdminPage'
import type { QueueLead, ReviewModel } from './types'

const queue: QueueLead[] = [
  { caseId: 'case-1', leadId: 'lead-1', name: 'Avery Stone', zip: '46204', status: 'awaiting_approval', reason: 'Northwind Exteriors is next for this ZIP.', dealerName: 'Northwind Exteriors', createdLabel: 'Today, 9:14 AM' },
  { caseId: 'case-2', leadId: 'lead-2', name: 'Quinn Harper', zip: '00501', status: 'unassigned', reason: 'No active salesperson covers this ZIP.', dealerName: 'Not proposed', createdLabel: 'Today, 8:02 AM' },
  { caseId: 'case-3', leadId: 'lead-3', name: 'Morgan Ellis', zip: '46204', status: 'notification_failed', reason: 'Delivery failed. Retry uses the same dealer.', dealerName: 'Lakeshore Home Improvements', createdLabel: 'Yesterday' },
  { caseId: 'case-4', leadId: 'lead-4', name: 'Riley Chen', zip: '46204', status: 'notified', reason: 'Dealer notification succeeded.', dealerName: 'Northwind Exteriors', createdLabel: 'Monday' },
]

const initialReview: ReviewModel = {
  caseId: 'case-1',
  leadId: 'lead-1',
  name: 'Avery Stone',
  email: 'avery.stone@example.com',
  phone: '555-010-0142',
  zip: '46204',
  notes: 'Synthetic homeowner. Not a real customer.',
  status: 'awaiting_approval',
  salesperson: 'Jordan Hale',
  dealerId: 'dealer-northwind',
  dealerName: 'Northwind Exteriors',
  dealerEmail: 'northwind@example.com',
  dealerActive: true,
  configuration: [
    ['Door line', 'Smooth-Star'],
    ['Style', 'Craftsman'],
    ['Finish', 'Black'],
    ['Glass', 'Clear'],
    ['Sidelites', 'Both'],
    ['Swing', 'Left hand inswing'],
  ],
  history: [
    { at: 'Today, 9:14 AM', label: 'Routed to Jordan Hale', detail: 'Main HGI Door Builder lead for ZIP 46204. No dealer was contacted.' },
    { at: 'Today, 9:14 AM', label: 'Dealer proposed', detail: 'Northwind Exteriors is the next active dealer in the ZIP rotation.' },
  ],
}

const links = [
  { to: '/dev/lead-routing/queue', label: 'My queue', end: true },
  { to: '/dev/lead-routing/review', label: 'Lead review' },
  { to: '/dev/lead-routing/territories', label: 'ZIP territories' },
]

function PreviewRoutes() {
  const navigate = useNavigate()
  const [review, setReview] = useState(initialReview)
  const [notice, setNotice] = useState('')
  const [territoryNotice, setTerritoryNotice] = useState('')
  const [territories, setTerritories] = useState([
    { zip: '46204', salesperson: 'Jordan Hale', active: true },
    { zip: '00501', salesperson: 'Unassigned', active: false },
  ])
  const [coverage, setCoverage] = useState([
    { zip: '46204', dealer: 'Northwind Exteriors', active: true },
    { zip: '46204', dealer: 'Lakeshore Home Improvements', active: true },
  ])
  return (
    <Routes>
      <Route path="/dev/lead-routing/queue" element={<RoutingShell email="jordan.hale@example.com" role="Salesperson" links={links}><LeadQueuePage leads={queue} eyebrow="Salesperson" title="My lead queue" intro="Only leads assigned to you appear here. Home Guard admins can see every ZIP." onOpen={() => navigate('/dev/lead-routing/review')} /></RoutingShell>} />
      <Route path="/dev/lead-routing/review" element={<RoutingShell email="jordan.hale@example.com" role="Salesperson" links={links}><LeadReviewPage review={review} notice={notice} onSend={() => { setReview((current) => ({ ...current, status: 'notified', history: [...current.history, { at: 'Just now', label: 'Dealer notified', detail: 'One notification was recorded for Northwind Exteriors. A second click does not send again.' }] })); setNotice('Notification recorded for Northwind Exteriors. This preview did not contact a dealer or an external service.') }} onRepropose={() => setNotice('The proposed dealer is still eligible, so the proposal was left unchanged.')} /></RoutingShell>} />
      <Route path="/dev/lead-routing/territories" element={<RoutingShell email="admin@example.com" role="Home Guard admin" links={links}><TerritoryAdminPage territories={territories} coverage={coverage} salespeople={[{ name: 'Jordan Hale', email: 'jordan.hale@example.com', active: true }, { name: 'Riley Chen', email: 'riley.chen@example.com', active: false }]} unassigned={queue.filter((lead) => lead.status === 'unassigned')} notice={territoryNotice} onOpen={() => navigate('/dev/lead-routing/review')} onSaveTerritory={(zip, salesperson) => { setTerritories((current) => [{ zip, salesperson, active: true }, ...current.filter((row) => row.zip !== zip)]); setTerritoryNotice(`Saved synthetic territory ${zip}. This preview does not write to the database.`) }} onSaveCoverage={(zip, dealer) => { if (!dealer.trim()) return; setCoverage((current) => [...current, { zip, dealer, active: true }]); setTerritoryNotice(`Saved synthetic coverage for ${dealer}.`) }} /></RoutingShell>} />
      <Route path="*" element={<Navigate to="/dev/lead-routing/queue" replace />} />
    </Routes>
  )
}

export function LeadRoutingPreviewApp() {
  return <BrowserRouter><PreviewRoutes /></BrowserRouter>
}
