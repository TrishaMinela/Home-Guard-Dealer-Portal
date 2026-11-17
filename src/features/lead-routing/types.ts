export type RoutingStatus =
  | 'awaiting_approval'
  | 'notification_sending'
  | 'notified'
  | 'notification_failed'
  | 'blocked_dealer_inactive'
  | 'unassigned'
  | 'no_eligible_dealer'

export type QueueLead = {
  caseId: string
  leadId: string
  name: string
  zip: string
  status: RoutingStatus
  reason: string
  dealerName: string
  createdLabel: string
}

export type HistoryEntry = { at: string; label: string; detail: string }

export type ReviewModel = {
  caseId: string
  leadId: string
  name: string
  email: string
  phone: string
  zip: string
  notes: string
  status: RoutingStatus
  salesperson: string
  dealerId: string
  dealerName: string
  dealerEmail: string
  dealerActive: boolean
  configuration: Array<[string, string]>
  history: HistoryEntry[]
}

export type TerritoryRow = { zip: string; salesperson: string; active: boolean }
export type CoverageRow = { zip: string; dealer: string; active: boolean }
export type SalespersonRow = { name: string; email: string; active: boolean }

export function statusLabel(status: RoutingStatus) {
  switch (status) {
    case 'awaiting_approval': return 'Needs approval'
    case 'notification_sending': return 'Sending'
    case 'notified': return 'Dealer notified'
    case 'notification_failed': return 'Delivery failed'
    case 'blocked_dealer_inactive': return 'Dealer inactive'
    case 'unassigned': return 'Unassigned ZIP'
    case 'no_eligible_dealer': return 'No eligible dealer'
  }
}
