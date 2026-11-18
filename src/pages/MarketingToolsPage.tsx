import { useMemo, useState } from 'react'
import { getDealerVisualizerUrl } from '../config/visualizer'
import { MarketingBannerLibrary } from '../components/marketing-banners/MarketingBannerLibrary'
import type { DealerAccount } from '../types/account'

type MarketingToolsPageProps = {
  dealer: DealerAccount
  embedded?: boolean
  logoManagementHref?: string
  logoManagementLabel?: string
  bannerAdminHref?: string
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value)
}

export function MarketingToolsPage({
  dealer,
  embedded = false,
  logoManagementHref = '/company#dealer-logos',
  logoManagementLabel = 'Add a logo in Company Profile',
  bannerAdminHref,
}: MarketingToolsPageProps) {
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const visualizerUrl = getDealerVisualizerUrl(dealer.slug)
  const embedCode = useMemo(
    () => `<a href="${visualizerUrl}">\n  <img src="YOUR-BANNER-IMAGE-URL" alt="Design Your New Front Door">\n</a>`,
    [visualizerUrl],
  )

  async function handleCopy(value: string, successMessage: string) {
    setError('')
    try {
      await copyText(value)
      setMessage(successMessage)
    } catch (copyError) {
      console.error('Failed to copy banner content.', copyError)
      setError('Copying was unavailable. Please select and copy the text manually.')
    }
  }

  return (
    <div className={embedded ? 'dealer-admin-marketing__content' : 'page-content'}>
      <header className="page-header">
        <p className="eyebrow">{embedded ? dealer.company_name : 'Dealer Marketing'}</p>
        <h1>Marketing Tools</h1>
        <p>Create website-ready graphics using {embedded ? `${dealer.company_name}’s` : 'your approved'} dealer branding.</p>
      </header>

      {message && <div className="portal-alert portal-alert--success" role="status">{message}</div>}
      {error && <div className="portal-alert" role="alert">{error}</div>}

      <MarketingBannerLibrary
        dealer={dealer}
        logoManagementHref={logoManagementHref}
        logoManagementLabel={logoManagementLabel}
        adminHref={bannerAdminHref}
      />

      <section className="content-card banner-link-card">
        <div className="content-card__header"><p className="eyebrow">Destination</p><h2>Visualizer Link</h2></div>
        <div className="banner-copy-row"><code>{visualizerUrl}</code><button className="button button--outline" type="button" onClick={() => void handleCopy(visualizerUrl, 'Visualizer link copied.')}>Copy Link</button></div>
      </section>

      <section className="content-card banner-link-card">
        <div className="content-card__header"><p className="eyebrow">Website</p><h2>Embed Code</h2></div>
        <div className="banner-embed-body">
          <pre><code>{embedCode}</code></pre>
          <p>Upload your downloaded banner to your website/media library, then replace YOUR-BANNER-IMAGE-URL with the uploaded image URL.</p>
          <button className="button button--outline" type="button" onClick={() => void handleCopy(embedCode, 'Embed code copied.')}>Copy Embed Code</button>
        </div>
      </section>
    </div>
  )
}
