import { useState, type ChangeEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { AdminDealer } from '../types/admin'
import { getDealerVisualizerDisplayUrl } from '../config/visualizer'

const logoExtensions: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

type DealerDetailPageProps = {
  dealers: AdminDealer[]
  isLoading: boolean
  error: string
  successMessage: string
  onDealerUpdated: (dealer: AdminDealer, message: string) => void
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
  const [isReviewingSlug, setIsReviewingSlug] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState<'primary' | 'light' | null>(null)
  const dealer = dealers.find((item) => item.id === dealerId)

  async function updateStatus(isActive: boolean) {
    if (!dealer) return

    setActionError('')
    setIsUpdatingStatus(true)
    const { data, error: updateError } = await supabase
      .from('dealers')
      .update({ is_active: isActive })
      .eq('id', dealer.id)
      .select('id, company_name, slug, logo_url, logo_light_url, primary_contact_name, email, phone, website, address, city, state, zip, primary_color, secondary_color, is_active, created_at, requested_slug, slug_request_status, slug_requested_at')
      .single()

    if (updateError) {
      console.error('Failed to update dealer status.', updateError)
      setActionError('We could not update this dealer’s status. Please try again.')
      setIsUpdatingStatus(false)
      return
    }

    onDealerUpdated(
      data as AdminDealer,
      `${data.company_name} was ${data.is_active ? 'enabled' : 'disabled'} successfully.`,
    )
    setIsConfirmingDisable(false)
    setIsUpdatingStatus(false)
  }

  async function reviewSlugRequest(action: 'approve' | 'reject') {
    if (!dealer) return

    setActionError('')
    setIsReviewingSlug(true)
    const functionName =
      action === 'approve'
        ? 'approve_dealer_slug_request'
        : 'reject_dealer_slug_request'
    const { data, error: reviewError } = await supabase
      .rpc(functionName, { p_dealer_id: dealer.id })
      .single()

    if (reviewError) {
      console.error(`Failed to ${action} dealer slug request.`, reviewError)
      setActionError(
        reviewError.code === '23505'
          ? 'That Visualizer URL is already in use and cannot be approved.'
          : `We could not ${action} this URL request. Please try again.`,
      )
      setIsReviewingSlug(false)
      return
    }

    onDealerUpdated(
      data as AdminDealer,
      action === 'approve'
        ? 'Visualizer URL request approved successfully.'
        : 'Visualizer URL request rejected.',
    )
    setIsReviewingSlug(false)
  }

  async function handleLogoUpload(
    event: ChangeEvent<HTMLInputElement>,
    logoType: 'primary' | 'light',
  ) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !dealer) return

    setActionError('')
    const extension = logoExtensions[file.type]
    if (!extension || file.size > 5 * 1024 * 1024) {
      setActionError('Choose a PNG, JPEG, or WebP logo no larger than 5 MB.')
      return
    }

    setUploadingLogo(logoType)
    const filename = logoType === 'primary' ? 'logo' : 'logo-light'
    const objectPath = `${dealer.id}/${filename}.${extension}`
    const { error: uploadError } = await supabase.storage
      .from('dealer-logos')
      .upload(objectPath, file, { contentType: file.type, upsert: true })

    if (uploadError) {
      console.error('Failed to upload dealer logo as Home Guard Admin.', uploadError)
      setActionError('We could not upload this dealer logo. Please try again.')
      setUploadingLogo(null)
      return
    }

    const { data: publicUrlData } = supabase.storage
      .from('dealer-logos')
      .getPublicUrl(objectPath)
    const versionedPublicUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`
    const { data, error: updateError } = await supabase
      .from('dealers')
      .update({
        [logoType === 'primary' ? 'logo_url' : 'logo_light_url']: versionedPublicUrl,
      })
      .eq('id', dealer.id)
      .select('id, company_name, slug, logo_url, logo_light_url, primary_contact_name, email, phone, website, address, city, state, zip, primary_color, secondary_color, is_active, created_at, requested_slug, slug_request_status, slug_requested_at')
      .single()

    if (updateError) {
      console.error('Dealer logo uploaded but URL update failed.', updateError)
      setActionError('The logo uploaded, but we could not save it to this dealer.')
      setUploadingLogo(null)
      return
    }

    onDealerUpdated(data, `${logoType === 'primary' ? 'Primary' : 'Light'} logo updated successfully.`)
    setUploadingLogo(null)
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
          <p>{getDealerVisualizerDisplayUrl(dealer.slug)}</p>
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

      <div className="profile-logo-grid">
        <section className="content-card profile-logo-card">
          <div className="profile-logo-preview">
            {dealer.logo_url ? (
              <img src={dealer.logo_url} alt={`${dealer.company_name} primary logo`} />
            ) : (
              <span>{dealer.company_name.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div>
            <p className="eyebrow">Primary Logo</p>
            <h2>Primary Logo</h2>
            <p>Upload your standard logo for use on light or white backgrounds.</p>
          </div>
          <label className={`button button--outline upload-button ${uploadingLogo ? 'is-disabled' : ''}`}>
            {uploadingLogo === 'primary' ? 'Uploading...' : 'Upload Primary Logo'}
            <input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploadingLogo !== null} onChange={(event) => void handleLogoUpload(event, 'primary')} />
          </label>
        </section>

        <section className="content-card profile-logo-card">
          <div className="profile-logo-preview profile-logo-preview--dark">
            {dealer.logo_light_url ? (
              <img src={dealer.logo_light_url} alt={`${dealer.company_name} light logo`} />
            ) : (
              <span>{dealer.company_name.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div>
            <p className="eyebrow">Light Logo</p>
            <h2>Light Logo</h2>
            <p>Upload a white or light-colored version of your logo for use on dark backgrounds.</p>
            <p className="logo-helper-note">This version should remain clearly visible when placed on a dark background. Recommended, but not required.</p>
          </div>
          <label className={`button button--outline upload-button ${uploadingLogo ? 'is-disabled' : ''}`}>
            {uploadingLogo === 'light' ? 'Uploading...' : 'Upload Light Logo'}
            <input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploadingLogo !== null} onChange={(event) => void handleLogoUpload(event, 'light')} />
          </label>
        </section>
      </div>

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
          <DetailItem label="Visualizer URL" value={getDealerVisualizerDisplayUrl(dealer.slug)} />
          <DetailItem label="Primary Contact Name" value={dealer.primary_contact_name} />
          <DetailItem label="Email" value={dealer.email} />
          <DetailItem label="Phone" value={dealer.phone} />
          <DetailItem label="Logo URL" value={dealer.logo_url} />
          <DetailItem label="Light Logo URL" value={dealer.logo_light_url} />
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

      <section className="content-card slug-review-card">
        <div className="content-card__header">
          <p className="eyebrow">Dealer request</p>
          <h2>Visualizer URL Request</h2>
        </div>
        {dealer.slug_request_status === 'pending' && dealer.requested_slug ? (
          <div className="slug-review-card__body">
            <dl className="slug-review-details">
              <DetailItem label="Current URL" value={getDealerVisualizerDisplayUrl(dealer.slug)} />
              <DetailItem label="Requested URL" value={getDealerVisualizerDisplayUrl(dealer.requested_slug)} />
              <DetailItem
                label="Requested Date"
                value={dealer.slug_requested_at ? formatDate(dealer.slug_requested_at) : '—'}
              />
            </dl>
            <div className="page-actions">
              <button
                className="button button--outline"
                type="button"
                disabled={isReviewingSlug}
                onClick={() => void reviewSlugRequest('reject')}
              >
                Reject
              </button>
              <button
                className="button button--primary"
                type="button"
                disabled={isReviewingSlug}
                onClick={() => void reviewSlugRequest('approve')}
              >
                {isReviewingSlug ? 'Working...' : 'Approve'}
              </button>
            </div>
          </div>
        ) : (
          <div className="data-state data-state--compact">
            No pending Visualizer URL request.
          </div>
        )}
      </section>
    </div>
  )
}
