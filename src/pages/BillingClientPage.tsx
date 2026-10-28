import { useState } from 'react'
import { useClientBilling } from '../hooks/useClientBilling'
import type { BillingInvoiceStatus, ClientBillingDashboard, ClientChargeSummary } from '../types/billing'

type View = 'overview' | 'usage' | 'history'
type Props = { accounts: Array<{ id: string; name: string }>; view: View }

function money(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return '—'
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(cents / 100)
}
function date(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`))
}
function inclusiveEndDate(exclusiveEnd: string) {
  const value = new Date(`${exclusiveEnd.slice(0, 10)}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() - 1)
  return date(value.toISOString().slice(0, 10))
}
function currentPeriodLabel() {
  const now = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10)
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10)
  return `${date(start)} – ${date(end)}`
}
function statusLabel(status: BillingInvoiceStatus | ClientChargeSummary['status']) {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function AccountPicker({ accounts, accountId, onChange }: { accounts: Props['accounts']; accountId: string | null; onChange: (id: string) => void }) {
  if (accounts.length < 2) return null
  return <label>Billing account<select value={accountId ?? ''} onChange={(event) => onChange(event.target.value)}>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
}

function EmptyState({ title, children }: { title: string; children: string }) {
  return <div className="billing-client-empty"><div className="billing-client-empty__icon" aria-hidden="true">$</div><h2>{title}</h2><p>{children}</p></div>
}

function Overview({ data }: { data: ClientBillingDashboard }) {
  const recent = data.chargeSummaries[0] ?? null
  return <>
    <div className="billing-client-summary-grid">
      <article className="billing-client-metric billing-client-metric--primary"><p>Current AI Usage Charges</p><strong>{money(data.currentMonth?.ai_usage_charge_cents)}</strong><small>{data.currentMonth?.status === 'finalized' ? 'Finalized' : 'Not finalized yet'}</small></article>
      <article className="billing-client-metric"><p>Approved AI Usage</p><strong>{data.currentMonth?.image_generation_count?.toLocaleString() ?? '—'}</strong><small>{data.currentMonth ? 'Visualizations in this billing period' : 'Available after the billing period is finalized'}</small></article>
      <article className="billing-client-metric"><p>Outstanding Balance</p><strong>{money(data.outstandingBalanceCents)}</strong><small>{data.outstandingBalanceCents > 0 ? 'Open balance' : 'No balance due'}</small></article>
      <article className="billing-client-metric"><p>Next Billing Date</p><strong>{date(data.account.next_billing_date)}</strong><small>{data.account.next_billing_date ? 'UTC calendar date' : 'Not scheduled'}</small></article>
    </div>
    <article className="content-card billing-client-period">
      <div><span className="eyebrow">Current billing period</span><h2>{currentPeriodLabel()} <small>UTC</small></h2></div>
      <span className={`billing-status ${data.currentMonth?.status === 'finalized' ? 'billing-status--paid' : ''}`}>{data.currentMonth ? statusLabel(data.currentMonth.status) : 'In progress'}</span>
      <p>{data.currentMonth ? 'Approved charges for this period are available.' : 'Charges will appear after the billing period has been reviewed and finalized.'}</p>
    </article>
    <article className="content-card billing-client-recent">
      <div className="billing-section-heading"><div><span className="eyebrow">Recent activity</span><h2>Billing history summary</h2></div></div>
      {recent ? <div className="billing-client-history-row"><div><strong>{date(recent.billing_period_start)} – {inclusiveEndDate(recent.billing_period_end)}</strong><span>{statusLabel(recent.status)}</span></div><strong>{money(recent.ai_usage_charge_cents)}</strong></div> : <p className="billing-empty-inline">No billing history yet.</p>}
    </article>
  </>
}

function UsageCharges({ data }: { data: ClientBillingDashboard }) {
  return <article className="content-card billing-client-usage">
    <div className="billing-section-heading"><div><span className="eyebrow">Approved usage</span><h2>AI Usage Charges</h2></div></div>
    {data.currentMonth ? <div className="billing-client-charge-detail">
      <dl><div><dt>Billing period</dt><dd>{date(data.currentMonth.billing_period_start)} – {inclusiveEndDate(data.currentMonth.billing_period_end)}</dd></div><div><dt>Approved AI usage</dt><dd>{data.currentMonth.image_generation_count?.toLocaleString() ?? '—'}</dd></div><div><dt>AI Usage Charges</dt><dd>{money(data.currentMonth.ai_usage_charge_cents)}</dd></div><div><dt>Status</dt><dd><span className="billing-status billing-status--paid">{statusLabel(data.currentMonth.status)}</span></dd></div></dl>
    </div> : <EmptyState title="No finalized billing period is available yet.">AI Usage Charges will appear here after the current billing period has been reviewed and finalized.</EmptyState>}
  </article>
}

function BillingHistory({ data }: { data: ClientBillingDashboard }) {
  return <article className="content-card billing-invoices billing-client-history">
    <div className="billing-section-heading"><div><span className="eyebrow">Account history</span><h2>Billing History</h2></div></div>
    {data.chargeSummaries.length ? <div className="billing-client-history-list">{data.chargeSummaries.map((summary) => {
      const invoice = data.invoices.find((item) => item.billing_period_start === summary.billing_period_start)
      return <div className="billing-client-history-card" key={summary.id}><div><span>Billing period</span><strong>{date(summary.billing_period_start)} – {inclusiveEndDate(summary.billing_period_end)}</strong></div><div><span>Approved usage</span><strong>{summary.image_generation_count?.toLocaleString() ?? '—'}</strong></div><div><span>AI Usage Charges</span><strong>{money(summary.ai_usage_charge_cents)}</strong></div><div><span>Status</span><strong>{invoice ? statusLabel(invoice.status) : statusLabel(summary.status)}</strong></div>{invoice && <><div><span>Invoice</span><strong>{invoice.invoice_number}</strong></div><div><span>Issue date</span><strong>{date(invoice.issued_at)}</strong></div><div><span>Due date</span><strong>{date(invoice.due_at)}</strong></div><div><span>Total</span><strong>{money(invoice.total_due_cents)}</strong></div><div><span>Amount due</span><strong>{money(invoice.amount_remaining_cents)}</strong></div></>}</div>
    })}</div> : <EmptyState title="No billing history yet.">Finalized billing periods and future invoices will appear here.</EmptyState>}
  </article>
}

const pageCopy: Record<View, { eyebrow: string; title: string; description: string }> = {
  overview: { eyebrow: 'Home Guard Industries', title: 'Billing Overview', description: 'Review your current AI Usage Charges, account balance, and recent billing activity.' },
  usage: { eyebrow: 'AI usage', title: 'AI Usage Charges', description: 'Review approved usage and charges for the current UTC billing period.' },
  history: { eyebrow: 'Account history', title: 'Billing History', description: 'Review finalized billing periods and invoice details when available.' },
}

export function BillingClientPage({ accounts, view }: Props) {
  const [accountId, setAccountId] = useState<string | null>(accounts[0]?.id ?? null)
  const { data, isLoading, error, refresh } = useClientBilling(accountId)
  const copy = pageCopy[view]
  if (isLoading) return <div className="app-status">Loading billing information...</div>
  return <section className="billing-page billing-client-page">
    <header className="page-header page-header--with-action"><div><span className="eyebrow">{copy.eyebrow}</span><h1>{copy.title}</h1><p>{copy.description}</p></div><div className="billing-header-actions"><AccountPicker accounts={accounts} accountId={accountId} onChange={setAccountId} /><button className="button button--secondary" type="button" onClick={() => void refresh()}>Refresh</button></div></header>
    {error && <p className="message message--error" role="alert">{error}</p>}
    {!error && !data && <EmptyState title="Billing access is not configured.">Ask an authorized administrator to verify your billing account membership.</EmptyState>}
    {data && view === 'overview' && <Overview data={data} />}
    {data && view === 'usage' && <UsageCharges data={data} />}
    {data && view === 'history' && <BillingHistory data={data} />}
  </section>
}
