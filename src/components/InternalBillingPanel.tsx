import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type PricingVersion = {
  id: string
  markup_basis_points: number
  effective_from: string
  effective_until: string | null
  currency: string
}

type InternalState = {
  pricing: PricingVersion | null
  periodCount: number
  auditCount: number
  error: string
}

export function InternalBillingPanel({ accountId }: { accountId: string }) {
  const [state, setState] = useState<InternalState>({ pricing: null, periodCount: 0, auditCount: 0, error: '' })

  useEffect(() => {
    let active = true
    void Promise.all([
      supabase.from('billing_pricing_versions').select('id, markup_basis_points, effective_from, effective_until, currency').eq('billing_account_id', accountId).order('effective_from', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('billing_periods').select('id', { count: 'exact', head: true }).eq('billing_account_id', accountId),
      supabase.from('billing_audit_log').select('id', { count: 'exact', head: true }).eq('billing_account_id', accountId),
    ]).then(([pricingResult, periodResult, auditResult]) => {
      if (!active) return
      const queryError = pricingResult.error || periodResult.error || auditResult.error
      setState({
        pricing: (pricingResult.data as PricingVersion | null) ?? null,
        periodCount: periodResult.count ?? 0,
        auditCount: auditResult.count ?? 0,
        error: queryError ? 'Internal billing configuration could not be loaded.' : '',
      })
    })
    return () => { active = false }
  }, [accountId])

  return (
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
  )
}
