export type BillingInvoiceStatus = 'draft' | 'open' | 'paid' | 'overdue' | 'void'

export type BillingAccount = {
  id: string
  name: string
  currency: 'usd'
  next_billing_date: string | null
}

export type ClientUsageDay = {
  usage_date: string
  ai_usage_charge_cents: number
  image_generation_count: number | null
  is_provisional: boolean
  updated_at: string
}

export type ClientChargeSummary = {
  id: string
  billing_period_start: string
  billing_period_end: string
  ai_usage_charge_cents: number
  image_generation_count: number | null
  status: 'provisional' | 'finalized'
  data_complete_through: string | null
  updated_at: string
}

export type ClientInvoice = {
  id: string
  invoice_number: string
  billing_period_start: string
  billing_period_end: string
  issued_at: string | null
  due_at: string | null
  ai_usage_charge_cents: number
  total_due_cents: number
  amount_remaining_cents: number
  status: BillingInvoiceStatus
}

export type ClientBillingDashboard = {
  account: BillingAccount
  currentMonth: ClientChargeSummary | null
  usageDays: ClientUsageDay[]
  invoices: ClientInvoice[]
  outstandingBalanceCents: number
  mostRecentInvoice: ClientInvoice | null
  lastUpdatedAt: string | null
}
