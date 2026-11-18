import { Link, useSearchParams } from 'react-router-dom'
import { MarketingBannerAdminEditor } from '../components/marketing-banners/MarketingBannerAdminEditor'
import type { AdminDealer } from '../types/admin'

const dealerIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function AdminMarketingBannersPage({ dealers }: { dealers: AdminDealer[] }) {
  const [params] = useSearchParams()
  const dealerId = params.get('dealer') ?? ''
  const backToDealer = dealerIdPattern.test(dealerId)

  return (
    <div className="page-content">
      <header className="page-header page-header--with-action">
        <div>
          <p className="eyebrow">Home Guard Admin</p>
          <h1>Banner Library</h1>
          <p>Upload a clean template for each banner and set its logo region. Dealers can generate banners for their own dealership. They cannot change these templates.</p>
        </div>
        <Link className="button button--outline" to={backToDealer ? `/admin/dealers/${dealerId}#marketing-tools` : '/admin/dealers'}>
          {backToDealer ? 'Back to dealer' : 'Back to Dealers'}
        </Link>
      </header>
      <MarketingBannerAdminEditor dealers={dealers} />
    </div>
  )
}
