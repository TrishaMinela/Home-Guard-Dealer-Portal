import { useCallback, useEffect, useState } from 'react'
import { ConfirmationModal } from './ConfirmationModal'
import { supabase } from '../lib/supabase'

type PricingVersion = { id: string; markup_basis_points: number; effective_from: string; effective_until: string | null; currency: string }
type MonthEndReadiness = {
  billingAccountId: string; periodStart: string; periodEndExclusive: string
  status: 'incomplete' | 'ready' | 'finalized'; ready: boolean; blockers: string[]; missingDates: string[]
  providerCoverageThrough: string | null; unresolvedConflictCount: number; providerRequestCount: number
  imageGenerationCount: number; providerCostUsd: number; providerCostMicros: number
  pricingVersionId: string | null; markupBasisPoints: number | null; aiUsageChargeCents: number
  existingBillingPeriodId: string | null
}
type InternalState = { pricing: PricingVersion | null; periodCount: number; auditCount: number; error: string }
type InvoiceReadiness = { ready: boolean; blockers: string[]; existingInvoiceId: string | null; aiUsageChargeCents: number }

function currentUtcMonth() {
  const now = new Date()
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}
function displayDate(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`))
}
function moneyFromUsd(value: number) { return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(value) }
function moneyFromCents(value: number) { return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(value / 100) }
function statusLabel(status: MonthEndReadiness['status']) {
  if (status === 'ready') return 'Ready to Finalize'
  if (status === 'finalized') return 'Finalized'
  return 'Incomplete'
}

export function InternalBillingPanel({ accountId }: { accountId: string }) {
  const [state, setState] = useState<InternalState>({ pricing: null, periodCount: 0, auditCount: 0, error: '' })
  const [month, setMonth] = useState(currentUtcMonth)
  const [readiness, setReadiness] = useState<MonthEndReadiness | null>(null)
  const [readinessError, setReadinessError] = useState('')
  const [isChecking, setIsChecking] = useState(false)
  const [isFinalizing, setIsFinalizing] = useState(false)
  const [finalizeMessage, setFinalizeMessage] = useState('')
  const [invoiceReadiness, setInvoiceReadiness] = useState<InvoiceReadiness | null>(null)
  const [isIssuingInvoice, setIsIssuingInvoice] = useState(false)
  const [pendingAction, setPendingAction] = useState<'finalize' | 'invoice' | null>(null)
  const [confirmationError, setConfirmationError] = useState('')

  const loadConfiguration = useCallback(async () => {
    const [pricingResult, periodResult, auditResult] = await Promise.all([
      supabase.from('billing_pricing_versions').select('id, markup_basis_points, effective_from, effective_until, currency').eq('billing_account_id', accountId).order('effective_from', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('billing_periods').select('id', { count: 'exact', head: true }).eq('billing_account_id', accountId),
      supabase.from('billing_audit_log').select('id', { count: 'exact', head: true }).eq('billing_account_id', accountId),
    ])
    const queryError = pricingResult.error || periodResult.error || auditResult.error
    setState({ pricing: (pricingResult.data as PricingVersion | null) ?? null, periodCount: periodResult.count ?? 0, auditCount: auditResult.count ?? 0, error: queryError ? 'Internal billing configuration could not be loaded.' : '' })
  }, [accountId])

  const loadReadiness = useCallback(async () => {
    setIsChecking(true); setReadinessError(''); setFinalizeMessage('')
    const { data, error } = await supabase.rpc('billing_month_end_readiness', { p_billing_account_id: accountId, p_period_start: `${month}-01` })
    setIsChecking(false)
    if (error || !data) {
      setReadiness(null); setReadinessError('Month-end readiness could not be checked. No billing records were changed.'); return
    }
    setReadiness(data as MonthEndReadiness)
    const value = data as MonthEndReadiness
    if (value.status === 'finalized' && value.existingBillingPeriodId) {
      const invoiceResult = await supabase.rpc('billing_invoice_readiness', { p_billing_period_id: value.existingBillingPeriodId })
      setInvoiceReadiness(invoiceResult.error ? null : invoiceResult.data as InvoiceReadiness)
    } else setInvoiceReadiness(null)
  }, [accountId, month])

  useEffect(() => { void loadConfiguration() }, [loadConfiguration])
  useEffect(() => { void loadReadiness() }, [loadReadiness])

  async function finalizeMonth() {
    if (!readiness?.ready || readiness.status !== 'ready') return
    setIsFinalizing(true); setReadinessError(''); setFinalizeMessage('')
    const { error } = await supabase.rpc('finalize_month_end_billing', { p_billing_account_id: accountId, p_period_start: readiness.periodStart })
    setIsFinalizing(false)
    if (error) {
      const message = 'Finalization was refused. Readiness may have changed; refresh and review the month before trying again.'
      setReadinessError(message); setConfirmationError(message)
      await loadReadiness(); return
    }
    setPendingAction(null); setConfirmationError('')
    setFinalizeMessage('Month finalized. No invoice or payment was created.')
    await Promise.all([loadConfiguration(), loadReadiness()])
  }

  async function issueInvoice() {
    if (!readiness?.existingBillingPeriodId || !invoiceReadiness?.ready) return
    setIsIssuingInvoice(true); setReadinessError(''); setFinalizeMessage('')
    const { data, error } = await supabase.rpc('issue_billing_invoice', { p_billing_period_id: readiness.existingBillingPeriodId })
    setIsIssuingInvoice(false)
    if (error) {
      const message = 'Invoice issuance was refused. Refresh readiness and review the finalized billing period.'
      setReadinessError(message); setConfirmationError(message); return
    }
    setPendingAction(null); setConfirmationError('')
    const result = data as { invoiceNumber?: string }
    setFinalizeMessage(`Invoice ${result.invoiceNumber ?? ''} issued with Net 15 terms.`)
    await Promise.all([loadConfiguration(), loadReadiness()])
  }

  return <>
    <article className="content-card billing-overview" aria-label="Internal billing configuration">
      <div className="billing-section-heading"><div><span className="eyebrow">Internal billing administration</span><h2>Pricing &amp; period status</h2></div></div>
      {state.error && <p className="message message--error" role="alert">{state.error}</p>}
      {!state.error && <dl className="ai-combined-usage">
        <div><dt>Current pricing</dt><dd>{state.pricing ? `${(state.pricing.markup_basis_points / 100).toFixed(2)}%` : 'Not configured'}</dd><small>Internal only</small></div>
        <div><dt>Effective date</dt><dd>{state.pricing?.effective_from ?? '—'}</dd><small>UTC calendar date</small></div>
        <div><dt>Billing periods</dt><dd>{state.periodCount}</dd><small>No period is created automatically</small></div>
        <div><dt>Audit entries</dt><dd>{state.auditCount}</dd><small>Internal audit history</small></div>
      </dl>}
    </article>

    <article className="content-card billing-overview month-end-billing" aria-label="Month-End Billing">
      <div className="billing-section-heading">
        <div><span className="eyebrow">Internal billing administration</span><h2>Month-End Billing</h2></div>
        <div className="month-end-billing__controls"><label htmlFor="billing-month">UTC month</label><input id="billing-month" type="month" value={month} onChange={(event) => setMonth(event.target.value)} /><button className="button button--secondary button--compact" type="button" disabled={isChecking} onClick={() => void loadReadiness()}>{isChecking ? 'Checking…' : 'Refresh'}</button></div>
      </div>
      {readinessError && <p className="message message--error" role="alert">{readinessError}</p>}
      {finalizeMessage && <p className="message message--success" role="status">{finalizeMessage}</p>}
      {isChecking && !readiness && <div className="billing-empty-inline">Checking provider coverage and billing safeguards…</div>}
      {readiness && <>
        <div className="month-end-billing__status-row"><span className={`billing-status billing-status--month-${readiness.status}`}>{statusLabel(readiness.status)}</span><span>{displayDate(readiness.periodStart)} – {displayDate(readiness.periodEndExclusive)} (exclusive end)</span></div>
        <dl className="month-end-billing__metrics">
          <div><dt>Provider coverage through</dt><dd>{displayDate(readiness.providerCoverageThrough)}</dd></div>
          <div><dt>Unresolved conflicts</dt><dd>{readiness.unresolvedConflictCount}</dd></div>
          <div><dt>Verified provider requests</dt><dd>{readiness.providerRequestCount.toLocaleString()}</dd></div>
          <div><dt>Internal provider cost</dt><dd>{moneyFromUsd(readiness.providerCostUsd)}</dd></div>
          <div><dt>Pricing adjustment</dt><dd>{readiness.markupBasisPoints === null ? '—' : `${(readiness.markupBasisPoints / 100).toFixed(2)}%`}</dd></div>
          <div><dt>Final AI Usage Charges</dt><dd>{moneyFromCents(readiness.aiUsageChargeCents)}</dd></div>
        </dl>
        {readiness.missingDates.length > 0 && <div className="month-end-billing__pending" role="status"><strong>Provider coverage still pending</strong><p>{readiness.missingDates.map(displayDate).join(', ')}</p></div>}
        {readiness.blockers.length > 0 && <p className="month-end-billing__blockers">Readiness safeguards: {readiness.blockers.join(', ').replaceAll('_', ' ')}</p>}
        <div className="month-end-billing__actions"><p>Finalization is atomic and immutable. Invoice issuance is a separate Net 15 action and never creates a payment or Stripe record.</p><button className="button button--primary" type="button" disabled={!readiness.ready || readiness.status !== 'ready' || isFinalizing} onClick={() => { setConfirmationError(''); setPendingAction('finalize') }}>{isFinalizing ? 'Finalizing…' : readiness.status === 'finalized' ? 'Finalized' : 'Finalize Month'}</button>{readiness.status === 'finalized' && <button className="button button--primary" type="button" disabled={!invoiceReadiness?.ready || isIssuingInvoice} onClick={() => { setConfirmationError(''); setPendingAction('invoice') }}>{isIssuingInvoice ? 'Issuing…' : invoiceReadiness?.existingInvoiceId ? 'Invoice Issued' : 'Issue Invoice'}</button>}</div>
        {readiness.status === 'finalized' && invoiceReadiness && !invoiceReadiness.ready && <p className="month-end-billing__blockers">Invoice safeguards: {invoiceReadiness.blockers.join(', ').replaceAll('_', ' ')}</p>}
      </>}
    </article>
    <ConfirmationModal
      open={Boolean(pendingAction)}
      title={pendingAction === 'finalize' ? 'Finalize this billing month?' : 'Issue this invoice?'}
      message={pendingAction === 'finalize'
        ? 'Finalized billing records are immutable. This action does not create an invoice or payment.'
        : 'The invoice number, dates, line item, and amounts will become immutable. No payment is collected automatically.'}
      target={pendingAction === 'finalize' && readiness ? `${displayDate(readiness.periodStart)} billing` : undefined}
      confirmLabel={pendingAction === 'finalize' ? 'Finalize Month' : 'Issue Invoice'}
      confirmingLabel={pendingAction === 'finalize' ? 'Finalizing…' : 'Issuing…'}
      destructive
      isConfirming={isFinalizing || isIssuingInvoice}
      error={confirmationError}
      onCancel={() => { if (!isFinalizing && !isIssuingInvoice) { setPendingAction(null); setConfirmationError('') } }}
      onConfirm={() => { if (pendingAction === 'finalize') void finalizeMonth(); else if (pendingAction === 'invoice') void issueInvoice() }}
    />
  </>
}
