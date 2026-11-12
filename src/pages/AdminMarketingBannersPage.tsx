import { MarketingBannerAdminEditor } from '../components/marketing-banners/MarketingBannerAdminEditor'
import type { AdminDealer } from '../types/admin'

export function AdminMarketingBannersPage({ dealers }: { dealers: AdminDealer[] }) {
  return (
    <div className="page-content">
      <header className="page-header">
        <p className="eyebrow">Home Guard Admin</p>
        <h1>Banner Library</h1>
        <p>Upload a clean template for each banner and set its logo region. Dealers can generate banners for their own dealership. They cannot change these templates.</p>
      </header>
      <MarketingBannerAdminEditor dealers={dealers} />
    </div>
  )
}
