import { MarketingBannerLibrary } from '../components/marketing-banners/MarketingBannerLibrary'
import type { DealerAccount } from '../types/account'

type MarketingToolsPageProps = {
  dealer: DealerAccount
  embedded?: boolean
  logoManagementHref?: string
  logoManagementLabel?: string
  bannerAdminHref?: string
}

export function MarketingToolsPage({
  dealer,
  embedded = false,
  logoManagementHref = '/company#dealer-logos',
  logoManagementLabel = 'Add a logo in Company Profile',
  bannerAdminHref,
}: MarketingToolsPageProps) {
  return (
    <div className={embedded ? 'dealer-admin-marketing__content' : 'page-content'}>
      <header className="page-header">
        <p className="eyebrow">{embedded ? dealer.company_name : 'Dealer Marketing'}</p>
        <h1>Marketing Tools</h1>
        <p>Create ready-to-use marketing graphics featuring your dealership's branding.</p>
      </header>
      <MarketingBannerLibrary
        key={dealer.id}
        dealer={dealer}
        logoManagementHref={logoManagementHref}
        logoManagementLabel={logoManagementLabel}
        adminHref={bannerAdminHref}
      />
    </div>
  )
}
