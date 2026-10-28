import { useEffect, useMemo, useState } from 'react'
import { useClientBilling } from '../hooks/useClientBilling'
import { InternalBillingPanel } from '../components/InternalBillingPanel'
import { supabase } from '../lib/supabase'
import type { BillingInvoiceStatus } from '../types/billing'

function money(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return '—'
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(cents / 100)
}

function date(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`))
}

function statusLabel(status: BillingInvoiceStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

type BillingPageProps = { accounts?: Array<{ id: string; name: string }>; showInternalDetails?: boolean }

export function AdminBillingPage({ accounts = [], showInternalDetails = false }: BillingPageProps) {
  const [availableAccounts, setAvailableAccounts] = useState(accounts)
  const [accountId, setAccountId] = useState<string | null>(accounts[0]?.id ?? null)
  const { data, isLoading, error, refresh } = useClientBilling(accountId)
  const [range, setRange] = useState<'current' | 'history'>('current')
  const maxDailyCharge = useMemo(() => Math.max(1, ...(data?.usageDays.map((row) => row.ai_usage_charge_cents) ?? [])), [data])

  useEffect(() => {
    if (accounts.length) return
    void supabase.from('billing_accounts').select('id, name').order('name').then(({ data: rows, error: accountError }) => {
      if (accountError) return
      const authorized = rows ?? []
      setAvailableAccounts(authorized)
      setAccountId((current) => current ?? authorized[0]?.id ?? null)
    })
  }, [accounts])

  if (isLoading) return <div className="app-status">Loading AI usage and billing...</div>

  return (
    <section className="billing-page">
      <header className="page-header page-header--with-action">
        <div>
          <span className="eyebrow">Home Guard Industries</span>
          <h1>AI Usage &amp; Billing</h1>
          <p>Review AI Usage Charges and invoice history. All reporting periods use UTC boundaries.</p>
        </div>
        <div className="billing-header-actions">
          {availableAccounts.length > 1 && <label>Billing account<select value={accountId ?? ''} onChange={(event) => setAccountId(event.target.value)}>{availableAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>}
          <button className="button button--secondary" type="button" onClick={() => void refresh()}>Refresh</button>
        </div>
      </header>

      {error && <p className="message message--error" role="alert">{error}</p>}
      {!error && !data && (
        <article className="content-card empty-state">
          <div className="empty-state__icon" aria-hidden="true">$</div>
          <h2>Billing access is not configured</h2>
          <p>An authorized administrator must add this account to an HGI billing account before charges can be displayed.</p>
        </article>
      )}

      {data && (
        <>
          {showInternalDetails && <InternalBillingPanel accountId={data.account.id} />}
          <div className="billing-summary-grid">
            <article className="metric-card metric-card--admin billing-metric"><p>Current Month AI Usage Charges</p><strong>{money(data.currentMonth?.ai_usage_charge_cents)}</strong><small>{data.currentMonth?.status === 'finalized' ? 'Finalized' : 'Provisional · subject to provider reconciliation'}</small></article>
            <article className="metric-card metric-card--admin billing-metric"><p>Outstanding Balance</p><strong>{money(data.outstandingBalanceCents)}</strong><small>Open and overdue invoices</small></article>
            <article className="metric-card metric-card--admin billing-metric"><p>Most Recent Invoice</p><strong>{data.mostRecentInvoice?.invoice_number ?? '—'}</strong><small>{data.mostRecentInvoice ? `${money(data.mostRecentInvoice.total_due_cents)} · ${statusLabel(data.mostRecentInvoice.status)}` : 'No invoice issued yet'}</small></article>
            <article className="metric-card metric-card--admin billing-metric"><p>Next Billing Date</p><strong>{date(data.account.next_billing_date)}</strong><small>{data.lastUpdatedAt ? `Last updated ${new Date(data.lastUpdatedAt).toLocaleString()}` : 'No usage update recorded'}</small></article>
          </div>

          <article className="content-card billing-overview">
            <div className="billing-section-heading">
              <div><span className="eyebrow">Usage overview</span><h2>Daily AI Usage Charges</h2></div>
              <div className="billing-range-toggle" aria-label="Usage range"><button className={range === 'current' ? 'is-active' : ''} type="button" onClick={() => setRange('current')}>Current month</button><button className={range === 'history' ? 'is-active' : ''} type="button" onClick={() => setRange('history')}>Monthly history</button></div>
            </div>
            {range === 'current' && data.usageDays.length > 0 ? (
              <div className="billing-chart" aria-label="Daily AI Usage Charges chart">
                {data.usageDays.map((day) => <div className="billing-chart__column" key={day.usage_date} title={`${date(day.usage_date)}: ${money(day.ai_usage_charge_cents)}`}><span className="billing-chart__value">{money(day.ai_usage_charge_cents)}</span><span className="billing-chart__bar" style={{ height: `${Math.max(6, (day.ai_usage_charge_cents / maxDailyCharge) * 100)}%` }} /><span className="billing-chart__date">{new Date(`${day.usage_date}T00:00:00Z`).getUTCDate()}</span></div>)}
              </div>
            ) : <div className="billing-empty-inline">{range === 'history' ? 'Monthly history will appear after finalized billing periods are available.' : 'No verified usage charges are available for this month yet.'}</div>}
            <p className="billing-note">Current-month charges are provisional until provider reporting is complete and the billing period is finalized.</p>
          </article>

          <article className="content-card billing-invoices">
            <div className="billing-section-heading"><div><span className="eyebrow">Billing history</span><h2>Invoices</h2></div></div>
            {data.invoices.length ? (
              <div className="table-scroll"><table className="data-table"><thead><tr><th>Invoice</th><th>Billing period</th><th>Issue date</th><th>Due date</th><th>AI Usage Charges</th><th>Total due</th><th>Status</th></tr></thead><tbody>{data.invoices.map((invoice) => <tr key={invoice.id}><td><strong>{invoice.invoice_number}</strong></td><td>{date(invoice.billing_period_start)} – {date(invoice.billing_period_end)}</td><td>{date(invoice.issued_at)}</td><td>{date(invoice.due_at)}</td><td>{money(invoice.ai_usage_charge_cents)}</td><td>{money(invoice.total_due_cents)}</td><td><span className={`billing-status billing-status--${invoice.status}`}>{statusLabel(invoice.status)}</span></td></tr>)}</tbody></table></div>
            ) : <div className="billing-empty-inline">No invoices have been issued.</div>}
          </article>
        </>
      )}
    </section>
  )
}
