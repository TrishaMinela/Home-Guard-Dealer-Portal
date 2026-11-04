import { useEffect, useState } from 'react'
import { MarketingToolsPage } from '../pages/MarketingToolsPage'
import { supabase } from '../lib/supabase'
import type { DealerAccount } from '../types/account'

async function loadDealerMarketingContext(dealerId: string): Promise<DealerAccount> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Your session has expired. Please sign in again.')
  const response = await fetch(`/api/dealer-marketing-context?dealerId=${encodeURIComponent(dealerId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const contentType = response.headers.get('content-type') ?? ''
  const result = contentType.includes('application/json') ? await response.json() as { dealer?: DealerAccount; error?: string } : {}
  if (!response.ok || !result.dealer) throw new Error(result.error ?? 'Dealer marketing information could not be loaded.')
  return result.dealer
}

export function AdminDealerMarketingTools({ dealerId }: { dealerId: string }) {
  const [dealer, setDealer] = useState<DealerAccount | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let current = true
    void loadDealerMarketingContext(dealerId).then((result) => {
      if (current) setDealer(result)
    }).catch((caught: unknown) => {
      if (current) setError(caught instanceof Error ? caught.message : 'Dealer marketing information could not be loaded.')
    })
    return () => { current = false }
  }, [dealerId])

  if (error) return <section className="content-card dealer-settings-section" id="marketing-tools"><div className="portal-alert" role="alert">{error}</div></section>
  if (!dealer) return <section className="content-card dealer-settings-section" id="marketing-tools"><div className="data-state">Loading Marketing Tools…</div></section>
  return <section className="dealer-settings-section dealer-admin-marketing" id="marketing-tools"><MarketingToolsPage dealer={dealer} embedded /></section>
}
