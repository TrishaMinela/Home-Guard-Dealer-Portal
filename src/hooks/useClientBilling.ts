import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type {
  BillingAccount,
  ClientBillingDashboard,
  ClientChargeSummary,
  ClientInvoice,
  ClientUsageDay,
} from '../types/billing'

type BillingState = {
  data: ClientBillingDashboard | null
  isLoading: boolean
  error: string
}

const initialState: BillingState = { data: null, isLoading: true, error: '' }

export function useClientBilling(accountId: string | null) {
  const [state, setState] = useState(initialState)

  const load = useCallback(async () => {
    setState((current) => ({ ...current, isLoading: true, error: '' }))
    if (!accountId) {
      setState({ data: null, isLoading: false, error: '' })
      return
    }
    const today = new Date()
    const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)).toISOString().slice(0, 10)
    const nextMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1)).toISOString().slice(0, 10)
    const [accountResult, summariesResult, usageResult, invoiceResult] = await Promise.all([
      supabase.from('billing_accounts').select('id, name, currency, next_billing_date').eq('id', accountId).single(),
      supabase.from('billing_charge_summaries').select('id, billing_period_start, billing_period_end, ai_usage_charge_cents, image_generation_count, status, data_complete_through, updated_at').eq('billing_account_id', accountId).order('billing_period_start', { ascending: false }),
      supabase.from('billing_client_usage_daily').select('usage_date, ai_usage_charge_cents, image_generation_count, is_provisional, updated_at').eq('billing_account_id', accountId).gte('usage_date', monthStart).lt('usage_date', nextMonth).order('usage_date'),
      supabase.from('billing_invoices').select('id, invoice_number, billing_period_start, billing_period_end, issued_at, due_at, ai_usage_charge_cents, subtotal_cents, tax_status, tax_amount_cents, total_due_cents, amount_remaining_cents, status').eq('billing_account_id', accountId).order('billing_period_start', { ascending: false }),
    ])

    const queryError = accountResult.error || summariesResult.error || usageResult.error || invoiceResult.error
    if (queryError) {
      console.error('Unable to load client-safe billing data.', queryError)
      setState({ data: null, isLoading: false, error: 'We could not load AI usage charges right now. Please try again.' })
      return
    }

    const invoices = (invoiceResult.data ?? []) as ClientInvoice[]
    const chargeSummaries = (summariesResult.data ?? []) as ClientChargeSummary[]
    const currentMonth = chargeSummaries.find((summary) => summary.billing_period_start >= monthStart && summary.billing_period_start < nextMonth) ?? null
    const usageDays = (usageResult.data ?? []) as ClientUsageDay[]
    const timestamps = [currentMonth?.updated_at, ...usageDays.map((row) => row.updated_at)].filter((value): value is string => Boolean(value))
    setState({
      isLoading: false,
      error: '',
      data: {
        account: accountResult.data as BillingAccount,
        currentMonth,
        chargeSummaries,
        usageDays,
        invoices,
        outstandingBalanceCents: invoices.filter((invoice) => invoice.status === 'issued').reduce((sum, invoice) => sum + invoice.amount_remaining_cents, 0),
        mostRecentInvoice: invoices.find((invoice) => invoice.status !== 'draft') ?? null,
        lastUpdatedAt: timestamps.length ? timestamps.sort().at(-1) ?? null : null,
      },
    })
  }, [accountId])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timeoutId)
  }, [load])
  return { ...state, refresh: load }
}
