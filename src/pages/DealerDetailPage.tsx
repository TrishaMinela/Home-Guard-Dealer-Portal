import { useState, type ChangeEvent, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { AdminDealer } from '../types/admin'
import { getDealerVisualizerDisplayUrl } from '../config/visualizer'
import { DealerUserAccess } from '../components/DealerUserAccess'
import { generateDefaultDealerLightLogo } from '../utils/dealerLightLogo'
import { DealerLogoPlacementSettings, type DealerLogoPlacement } from '../components/DealerLogoPlacementSettings'
import { AdminDealerMarketingTools } from '../components/AdminDealerMarketingTools'
import { DealerSectionHeader } from '../components/DealerSectionHeader'
import { DealerCrmIntegrations } from '../components/DealerCrmIntegrations'

const logoExtensions: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
}

type DealerDetailPageProps = {
  dealers: AdminDealer[]
  isLoading: boolean
  error: string
  successMessage: string
  onDealerUpdated: (dealer: AdminDealer, message: string) => void
  onClearSuccess: () => void
  canManageDealerUsers: boolean
  canManageDealerCredentials: boolean
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date))
}

function DetailItem({ label, value, href }: { label: string; value: string | null; href?: string }) {
  return (
    <div className="dealer-detail__item">
      <dt>{label}</dt>
      <dd>{href && value ? <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel={href.startsWith('http') ? 'noreferrer' : undefined}>{value}</a> : value || '—'}</dd>
    </div>
  )
}

function DetailGroup({ title, children }: { title: string; children: ReactNode }) {
  return <section className="dealer-detail-group"><h3>{title}</h3><dl>{children}</dl></section>
}

export function DealerDetailPage({
  dealers,
  isLoading,
  error,
  successMessage,
  onDealerUpdated,
  onClearSuccess,
  canManageDealerUsers,
  canManageDealerCredentials,
}: DealerDetailPageProps) {
  const { dealerId } = useParams()
  const [isConfirmingDisable, setIsConfirmingDisable] = useState(false)
  const [actionError, setActionError] = useState('')
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const [isReviewingSlug, setIsReviewingSlug] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState<'primary' | 'light' | null>(null)
  const [isGeneratingLightLogo, setIsGeneratingLightLogo] = useState(false)
  const dealer = dealers.find((item) => item.id === dealerId)

  async function updateStatus(isActive: boolean) {
    if (!dealer) return

    setActionError('')
    setIsUpdatingStatus(true)
    const { data, error: updateError } = await supabase
      .from('dealers')
      .update({ is_active: isActive })
      .eq('id', dealer.id)
      .select('id, company_name, slug, logo_url, logo_light_url, logo_generated_light_url, logo_placement, primary_contact_name, email, phone, website, address, city, state, zip, primary_color, secondary_color, is_active, created_at, requested_slug, slug_request_status, slug_requested_at, heading_font_family, heading_font_weight, heading_font_size, body_font_family, body_font_weight, body_font_size, custom_heading_font_url, custom_heading_font_name, custom_heading_font_weight, custom_body_font_url, custom_body_font_name, custom_body_font_weight')
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
      setActionError('Choose a PNG, JPEG, WebP, or SVG logo no larger than 5 MB.')
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
      .select('id, company_name, slug, logo_url, logo_light_url, logo_generated_light_url, logo_placement, primary_contact_name, email, phone, website, address, city, state, zip, primary_color, secondary_color, is_active, created_at, requested_slug, slug_request_status, slug_requested_at, heading_font_family, heading_font_weight, heading_font_size, body_font_family, body_font_weight, body_font_size, custom_heading_font_url, custom_heading_font_name, custom_heading_font_weight, custom_body_font_url, custom_body_font_name, custom_body_font_weight')
      .single()

    if (updateError) {
      console.error('Dealer logo uploaded but URL update failed.', updateError)
      setActionError('The logo uploaded, but we could not save it to this dealer.')
      setUploadingLogo(null)
      return
    }

    let updatedDealer = data as AdminDealer
    if (logoType === 'primary') {
      setIsGeneratingLightLogo(true)
      const generated = await generateDefaultDealerLightLogo(dealer.id)
      setIsGeneratingLightLogo(false)
      if (generated.error || !generated.generatedLightLogoUrl) {
        onDealerUpdated(updatedDealer, 'Primary logo updated, but the default light version could not be generated.')
        setActionError('Use Regenerate Default to retry the light-logo conversion.')
        setUploadingLogo(null)
        return
      }
      updatedDealer = { ...updatedDealer, logo_generated_light_url: generated.generatedLightLogoUrl }
    }
    onDealerUpdated(updatedDealer, `${logoType === 'primary' ? 'Primary logo and default light logo' : 'Custom light logo'} updated successfully.`)
    setUploadingLogo(null)
  }

  async function generateLightLogo() {
    if (!dealer) return
    setActionError('')
    setIsGeneratingLightLogo(true)
    const result = await generateDefaultDealerLightLogo(dealer.id)
    setIsGeneratingLightLogo(false)
    if (result.error || !result.generatedLightLogoUrl) {
      setActionError(result.error ?? 'We could not generate the default light logo.')
      return
    }
    onDealerUpdated({ ...dealer, logo_generated_light_url: result.generatedLightLogoUrl }, 'Default light logo generated successfully.')
  }

  async function removeCustomLightLogo() {
    if (!dealer) return
    setActionError('')
    setIsGeneratingLightLogo(true)
    const { data, error: updateError } = await supabase
      .from('dealers')
      .update({ logo_light_url: null })
      .eq('id', dealer.id)
      .select('id, company_name, slug, logo_url, logo_light_url, logo_generated_light_url, logo_placement, primary_contact_name, email, phone, website, address, city, state, zip, primary_color, secondary_color, is_active, created_at, requested_slug, slug_request_status, slug_requested_at, heading_font_family, heading_font_weight, heading_font_size, body_font_family, body_font_weight, body_font_size, custom_heading_font_url, custom_heading_font_name, custom_heading_font_weight, custom_body_font_url, custom_body_font_name, custom_body_font_weight')
      .single()
    setIsGeneratingLightLogo(false)
    if (updateError) {
      setActionError('We could not remove the custom light logo. Please try again.')
      return
    }
    onDealerUpdated(data as AdminDealer, 'Custom light logo removed. The generated default is now in use.')
  }

  async function saveLogoPlacement(placement: DealerLogoPlacement) {
    if (!dealer) throw new Error('Dealer not found.')
    const { data, error: updateError } = await supabase
      .from('dealers')
      .update({ logo_placement: placement })
      .eq('id', dealer.id)
      .select('*')
      .single()
    if (updateError) throw updateError
    return data as AdminDealer
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
      <header className="page-header admin-page-header dealer-page-header page-header--with-action">
        <div>
          <p className="eyebrow">Dealer company</p>
          <h1>{dealer.company_name}</h1>
          <a className="dealer-page-header__url" href={getDealerVisualizerDisplayUrl(dealer.slug)} target="_blank" rel="noreferrer">{getDealerVisualizerDisplayUrl(dealer.slug)}</a>
          <div className="dealer-page-header__meta"><span className={`status-badge ${dealer.is_active ? 'status-badge--active' : 'status-badge--inactive'}`}>{dealer.is_active ? 'Active' : 'Disabled'}</span><span>Added {formatDate(dealer.created_at)}</span></div>
        </div>
        <div className="page-actions">
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

      <nav className="dealer-settings-nav" aria-label="Dealer management sections">
        <a href="#company-details">Company Details</a>
        <a href="#branding">Branding</a>
        <a href="#design">Typography &amp; Design</a>
        {canManageDealerCredentials && <a href="#marketing-tools">Marketing Tools</a>}
        {canManageDealerCredentials && <a href="#crm-integrations">CRM Integrations</a>}
        {canManageDealerUsers && <a href="#dealer-users">Dealer Users / Access</a>}
      </nav>

      {isConfirmingDisable && (
        <section className="disable-confirmation" role="alertdialog" aria-labelledby="disable-title">
          <div><h2 id="disable-title">Disable {dealer.company_name}?</h2><p>This dealer will remain in Home Guard records, but will be marked inactive.</p></div>
          <div className="page-actions"><button className="button button--outline" type="button" onClick={() => setIsConfirmingDisable(false)}>Cancel</button><button className="button button--danger" type="button" disabled={isUpdatingStatus} onClick={() => void updateStatus(false)}>{isUpdatingStatus ? 'Disabling...' : 'Disable'}</button></div>
        </section>
      )}

      <section id="company-details" className="content-card dealer-management-card dealer-detail" aria-labelledby="company-details-heading">
        <DealerSectionHeader eyebrow="Company record" title="Company Details" headingId="company-details-heading" description="Core identity, contact information, location, and public links for this dealer." actionLabel="Edit" actionTo={`/admin/dealers/${dealer.id}/edit#company`} onActionClick={onClearSuccess} trailing={<span className={`status-badge ${dealer.is_active ? 'status-badge--active' : 'status-badge--inactive'}`}>{dealer.is_active ? 'Active' : 'Disabled'}</span>} />
        <div className="dealer-detail-groups">
          <DetailGroup title="Core identity"><DetailItem label="Company Name" value={dealer.company_name} /><DetailItem label="Dealer Slug" value={dealer.slug} /><DetailItem label="Status" value={dealer.is_active ? 'Active' : 'Disabled'} /><DetailItem label="Created Date" value={formatDate(dealer.created_at)} /></DetailGroup>
          <DetailGroup title="Contact information"><DetailItem label="Primary Contact" value={dealer.primary_contact_name} /><DetailItem label="Email" value={dealer.email} href={dealer.email ? `mailto:${dealer.email}` : undefined} /><DetailItem label="Phone" value={dealer.phone} href={dealer.phone ? `tel:${dealer.phone}` : undefined} /></DetailGroup>
          <DetailGroup title="Address & location"><DetailItem label="Street Address" value={dealer.address} /><DetailItem label="City" value={dealer.city} /><DetailItem label="State" value={dealer.state} /><DetailItem label="ZIP" value={dealer.zip} /></DetailGroup>
          <DetailGroup title="Public links"><DetailItem label="Door Builder URL" value={getDealerVisualizerDisplayUrl(dealer.slug)} href={getDealerVisualizerDisplayUrl(dealer.slug)} /><DetailItem label="Website" value={dealer.website} href={dealer.website ?? undefined} /></DetailGroup>
        </div>
      </section>

      <section id="branding" className="content-card dealer-management-card dealer-settings-section dealer-branding-panel" aria-labelledby="branding-heading">
        <DealerSectionHeader eyebrow="Branding" title="Customer-facing Door Builder" headingId="branding-heading" description="Manage the logo assets and placement used by this dealer’s public Door Builder. Portal colors remain HGI branded." actionLabel="Edit colors" actionTo={`/admin/dealers/${dealer.id}/edit#branding`} onActionClick={onClearSuccess} />
        <div className="profile-logo-grid">
        <section className="profile-logo-card">
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
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" disabled={uploadingLogo !== null} onChange={(event) => void handleLogoUpload(event, 'primary')} />
          </label>
        </section>

        <section className="profile-logo-card">
          <div className="profile-logo-preview profile-logo-preview--dark">
            {dealer.logo_light_url || dealer.logo_generated_light_url ? (
              <img src={dealer.logo_light_url ?? dealer.logo_generated_light_url ?? ''} alt={`${dealer.company_name} light logo`} />
            ) : (
              <span>{dealer.company_name.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div>
            <p className="eyebrow">{dealer.logo_light_url ? 'Custom override' : 'Generated default'}</p>
            <h2>Light Logo</h2>
            <p>A white logo is generated from the primary logo. Upload a custom version to override it on dark backgrounds.</p>
          </div>
          <label className={`button button--outline upload-button ${uploadingLogo ? 'is-disabled' : ''}`}>
            {uploadingLogo === 'light' ? 'Uploading...' : 'Upload Light Logo'}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" disabled={uploadingLogo !== null} onChange={(event) => void handleLogoUpload(event, 'light')} />
          </label>
          <div className="page-actions">
            {dealer.logo_url && (
              <button className="button button--outline" type="button" disabled={isGeneratingLightLogo || uploadingLogo !== null} onClick={() => void generateLightLogo()}>
                {isGeneratingLightLogo ? 'Generating...' : 'Regenerate Default'}
              </button>
            )}
            {dealer.logo_light_url && (
              <button className="button button--danger-outline" type="button" disabled={isGeneratingLightLogo || uploadingLogo !== null} onClick={() => void removeCustomLightLogo()}>
                Remove Custom Logo
              </button>
            )}
          </div>
        </section>
        </div>
      </section>

      <DealerLogoPlacementSettings
        dealer={dealer}
        onSave={saveLogoPlacement}
        onUpdated={(updated) => onDealerUpdated(updated, 'Dealer logo placement saved.')}
      />

      <section id="design" className="content-card dealer-management-card dealer-settings-summary">
        <DealerSectionHeader eyebrow="Typography & Design" title="Door Builder Design" description="Manage heading and UI fonts, weights, sizes, custom font files, and a live typography preview." actionLabel="Edit design" actionTo={`/admin/dealers/${dealer.id}/edit#design`} onActionClick={onClearSuccess} />
        <div className="dealer-design-preview" aria-hidden="true"><span>Aa</span><div><strong>Build a Door Made for Your Home.</strong><small>Heading and interface typography preview</small></div></div>
      </section>

      {canManageDealerCredentials && <AdminDealerMarketingTools dealerId={dealer.id} />}

      {canManageDealerCredentials && <DealerCrmIntegrations dealerId={dealer.id} />}

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
      {canManageDealerUsers && <DealerUserAccess dealerId={dealer.id} sectionId="dealer-users" canSetPassword={canManageDealerCredentials} />}
    </div>
  )
}
