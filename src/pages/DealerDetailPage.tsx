import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { AdminDealer } from '../types/admin'

type DealerDetailPageProps = {
  dealers: AdminDealer[]
  isLoading: boolean
  error: string
  successMessage: string
  onDealerUpdated: (dealer: AdminDealer) => void
  onClearSuccess: () => void
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date))
}

function DetailItem({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="dealer-detail__item">
      <dt>{label}</dt>
      <dd>{value || '—'}</dd>
    </div>
  )
}

export function DealerDetailPage({
  dealers,
  isLoading,
  error,
  successMessage,
  onDealerUpdated,
  onClearSuccess,
}: DealerDetailPageProps) {
  const { dealerId } = useParams()
  const [isConfirmingDisable, setIsConfirmingDisable] = useState(false)
  const [actionError, setActionError] = useState('')
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const dealer = dealers.find((item) => item.id === dealerId)

  async function updateStatus(isActive: boolean) {
    if (!dealer) return

    setActionError('')
    setIsUpdatingStatus(true)
    const { data, error: updateError } = await supabase
      .from('dealers')
      .update({ is_active: isActive })
      .eq('id', dealer.id)
      .select('id, company_name, slug, primary_contact_name, email, phone, website, address, city, state, zip, primary_color, secondary_color, is_active, created_at')
      .single()

    if (updateError) {
      console.error('Failed to update dealer status.', updateError)
      setActionError('We could not update this dealer’s status. Please try again.')
      setIsUpdatingStatus(false)
      return
    }

    onDealerUpdated(data)
    setIsConfirmingDisable(false)
    setIsUpdatingStatus(false)
  }

  if (isLoading) {
    return <div className="page-content"><div className="data-state">Loading dealer...</div></div>
  }

  if (error) {
    return <div className="page-content"><div className="portal-alert" role="alert">{error}</div></div>
  }

  if (!dealer) {
    return (
      <div className="page-content">
        <div className="content-card dealer-not-found">
          <h1>Dealer not found</h1>
          <Link className="button button--outline" to="/admin/dealers">Back to Dealers</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="page-content">
      <header className="page-header admin-page-header page-header--with-action">
        <div>
          <p className="eyebrow">Dealer company</p>
          <h1>{dealer.company_name}</h1>
          <p>homeguardvisualizer.com/{dealer.slug}</p>
        </div>
        <div className="page-actions">
          <Link
            className="button button--outline"
            to={`/admin/dealers/${dealer.id}/edit`}
            onClick={onClearSuccess}
          >
            Edit Dealer
          </Link>
          {dealer.is_active ? (
            <button
              className="button button--danger-outline"
              type="button"
              onClick={() => setIsConfirmingDisable(true)}
            >
              Disable Dealer
            </button>
          ) : (
            <button
              className="button button--primary"
              type="button"
              disabled={isUpdatingStatus}
              onClick={() => void updateStatus(true)}
            >
              {isUpdatingStatus ? 'Enabling...' : 'Enable Dealer'}
            </button>
          )}
        </div>
      </header>

      {successMessage && <div className="portal-alert portal-alert--success" role="status">{successMessage}</div>}
      {actionError && <div className="portal-alert" role="alert">{actionError}</div>}

      {isConfirmingDisable && (
        <section className="disable-confirmation" role="alertdialog" aria-labelledby="disable-title">
          <div>
            <h2 id="disable-title">Disable {dealer.company_name}?</h2>
            <p>This dealer will remain in Home Guard records, but will be marked inactive.</p>
          </div>
          <div className="page-actions">
            <button className="button button--outline" type="button" onClick={() => setIsConfirmingDisable(false)}>
              Cancel
            </button>
            <button
              className="button button--danger"
              type="button"
              disabled={isUpdatingStatus}
              onClick={() => void updateStatus(false)}
            >
              {isUpdatingStatus ? 'Disabling...' : 'Disable'}
            </button>
          </div>
        </section>
      )}

      <section className="content-card dealer-detail">
        <div className="content-card__header dealer-detail__heading">
          <div>
            <p className="eyebrow">Company record</p>
            <h2>Dealer Details</h2>
          </div>
          <span className={`status-badge ${dealer.is_active ? 'status-badge--active' : 'status-badge--inactive'}`}>
            {dealer.is_active ? 'Active' : 'Disabled'}
          </span>
        </div>
        <dl className="dealer-detail__grid">
          <DetailItem label="Company Name" value={dealer.company_name} />
          <DetailItem label="Slug" value={dealer.slug} />
          <DetailItem label="Visualizer URL" value={`homeguardvisualizer.com/${dealer.slug}`} />
          <DetailItem label="Primary Contact Name" value={dealer.primary_contact_name} />
          <DetailItem label="Email" value={dealer.email} />
          <DetailItem label="Phone" value={dealer.phone} />
          <DetailItem label="Website" value={dealer.website} />
          <DetailItem label="Address" value={dealer.address} />
          <DetailItem label="City" value={dealer.city} />
          <DetailItem label="State" value={dealer.state} />
          <DetailItem label="ZIP" value={dealer.zip} />
          <DetailItem label="Primary Brand Color" value={dealer.primary_color} />
          <DetailItem label="Secondary Brand Color" value={dealer.secondary_color} />
          <DetailItem label="Status" value={dealer.is_active ? 'Active' : 'Disabled'} />
          <DetailItem label="Created Date" value={formatDate(dealer.created_at)} />
        </dl>
      </section>
    </div>
  )
}
