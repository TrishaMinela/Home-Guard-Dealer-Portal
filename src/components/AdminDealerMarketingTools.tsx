import { useEffect, useState } from 'react'
import { MarketingToolsPage } from '../pages/MarketingToolsPage'
import { supabase } from '../lib/supabase'
import type { DealerAccount } from '../types/account'
import { DealerSectionHeader } from './DealerSectionHeader'
import { explainPreviewConfiguration, previewConfigurationNotice } from '../utils/previewConfiguration'

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

export function AdminDealerMarketingTools({ dealerId, previewDealer }: { dealerId: string; previewDealer?: DealerAccount }) {
  const fixture = import.meta.env.DEV ? previewDealer : undefined
  const [dealer, setDealer] = useState<DealerAccount | null>(fixture ?? null)
  const [error, setError] = useState('')
  const adminHref = `/admin/marketing-banners?dealer=${encodeURIComponent(dealerId)}`

  useEffect(() => {
    if (fixture) return
    let current = true
    void loadDealerMarketingContext(dealerId).then((result) => {
      if (current) setDealer(result)
    }).catch((caught: unknown) => {
      if (current) setError(caught instanceof Error ? caught.message : 'Dealer marketing information could not be loaded.')
    })
    return () => { current = false }
  }, [dealerId, fixture])

  return (
    <section className="content-card dealer-management-card dealer-settings-section dealer-admin-marketing dealer-setup-anchor" id="marketing-tools" tabIndex={-1}>
      <DealerSectionHeader
        icon="megaphone"
        eyebrow="Marketing"
        title="Marketing Tools"
        description="Give this dealer ready-to-use marketing assets, banners, and links to embed on their website."
        actionLabel="Manage Marketing Tools"
        actionTo={adminHref}
        actionIcon="manage"
      />
      {error ? <div className="portal-alert" role={explainPreviewConfiguration(error) === previewConfigurationNotice ? 'status' : 'alert'}>{explainPreviewConfiguration(error)}</div> : null}
      {!error && !dealer ? <div className="data-state">Loading Marketing Tools…</div> : null}
      {dealer ? (
        <MarketingToolsPage
          dealer={dealer}
          embedded
          logoManagementHref="#branding"
          logoManagementLabel="Open branding logos"
          bannerAdminHref={`/admin/marketing-banners?dealer=${encodeURIComponent(dealerId)}`}
        />
      ) : null}
    </section>
  )
}
