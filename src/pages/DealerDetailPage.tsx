import { useState, type ChangeEvent, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { AdminDealer } from '../types/admin'
import { getDealerVisualizerDisplayUrl } from '../config/visualizer'
import { DealerUserAccess } from '../components/DealerUserAccess'
import { generateDefaultDealerLightLogo } from '../utils/dealerLightLogo'
import { DealerLogoPlacementSettings, type DealerLogoPlacement } from '../components/DealerLogoPlacementSettings'
import { DealerLogoVariantSettings } from '../components/DealerLogoVariantSettings'
import { DealerLogoDisplaySettings } from '../components/DealerLogoDisplaySettings'
import { LogoBackgroundDialog } from '../components/LogoBackgroundDialog'
import { readLogoForRemoval } from '../utils/readLogoForRemoval'
import { generatedLightLogoMessage, lightLogoEyebrow, logoVariantSavePlan, type DealerLogoDisplay, type DealerLogoVariant } from '../utils/dealerLogoVariants'
import { AdminDealerMarketingTools } from '../components/AdminDealerMarketingTools'
import { DealerSectionHeader } from '../components/DealerSectionHeader'
import { DealerDetailSectionNav } from '../components/DealerDetailSectionNav'
import { DealerCrmIntegrations } from '../components/DealerCrmIntegrations'
import { DealerSetupChecklist } from '../components/DealerSetupChecklist'

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

function DetailGroup({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return <section className="dealer-detail-group dealer-setup-anchor" id={id} tabIndex={id ? -1 : undefined}><h3>{title}</h3><dl>{children}</dl></section>
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
  const [uploadingLogo, setUploadingLogo] = useState<'primary' | 'light' | 'black' | null>(null)
  const [removal, setRemoval] = useState<{ file: File; originalUrl: string; removedUrl: string; reason: string; png: Blob } | null>(null)
  const [removalNotice, setRemovalNotice] = useState('')
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

  async function saveRemovedBackground(file: File, png: Blob, reason: string) {
    if (!dealer) return false
    setUploadingLogo('primary')
    const sourceExtension = logoExtensions[file.type] ?? 'png'
    const sourcePath = `${dealer.id}/logo-source.${sourceExtension}`
    const transparentPath = `${dealer.id}/logo.png`
    const [sourceUpload, transparentUpload] = await Promise.all([
      supabase.storage.from('dealer-logos').upload(sourcePath, file, { contentType: file.type, upsert: true }),
      supabase.storage.from('dealer-logos').upload(transparentPath, png, { contentType: 'image/png', upsert: true }),
    ])
    if (sourceUpload.error || transparentUpload.error) {
      setActionError('We could not save the transparent logo. The original was not replaced.')
      setUploadingLogo(null)
      return false
    }
    const sourceUrl = `${supabase.storage.from('dealer-logos').getPublicUrl(sourcePath).data.publicUrl}?v=${Date.now()}`
    const transparentUrl = `${supabase.storage.from('dealer-logos').getPublicUrl(transparentPath).data.publicUrl}?v=${Date.now()}`
    const { error: updateError } = await supabase.from('dealers').update({ logo_url: transparentUrl, logo_source_url: sourceUrl }).eq('id', dealer.id)
    if (updateError) {
      setActionError('The files uploaded, but the logo record could not be saved.')
      setUploadingLogo(null)
      return false
    }
    let updatedDealer: AdminDealer = { ...dealer, logo_url: transparentUrl, logo_source_url: sourceUrl }
    setIsGeneratingLightLogo(true)
    const generated = await generateDefaultDealerLightLogo(dealer.id)
    setIsGeneratingLightLogo(false)
    setUploadingLogo(null)
    if (generated.error || !generated.generatedLightLogoUrl) {
      onDealerUpdated(updatedDealer, 'The transparent logo was saved, but its default light version could not be generated.')
      setActionError('Use Regenerate Default to retry the light-logo conversion.')
      return true
    }
    updatedDealer = {
      ...updatedDealer,
      logo_generated_light_url: generated.generatedLightLogoUrl,
      logo_generated_light_usable: generated.generatedLightUsable,
    }
    onDealerUpdated(updatedDealer, `${reason.replace(/\.$/, '')} removed. ${generatedLightLogoMessage(generated.generatedLightUsable, 'primary')}`)
    return true
  }

  async function handleLogoUpload(
    event: ChangeEvent<HTMLInputElement>,
    logoType: 'primary' | 'light' | 'black',
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

    if (logoType === 'primary' && file.type !== 'image/svg+xml') {
      const inspected = await readLogoForRemoval(file)
      if (inspected.confident && inspected.png) {
        setRemovalNotice('')
        setRemoval({
          file,
          originalUrl: URL.createObjectURL(file),
          removedUrl: URL.createObjectURL(inspected.png),
          reason: inspected.reason,
          png: inspected.png,
        })
        return
      }
      setRemovalNotice(inspected.confident
        ? 'The background could be removed, but this browser could not save a PNG. The original file was kept.'
        : inspected.reason)
    }

    await storeUploadedLogo(file, logoType)
  }

  async function storeUploadedLogo(file: File, logoType: 'primary' | 'light' | 'black') {
    if (!dealer) return
    const extension = logoExtensions[file.type]
    if (!extension) return
    setUploadingLogo(logoType)
    const filename = logoType === 'primary' ? 'logo' : logoType === 'black' ? 'logo-black' : 'logo-light'
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
        [logoType === 'primary' ? 'logo_url' : logoType === 'black' ? 'logo_black_url' : 'logo_light_url']: versionedPublicUrl,
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
    let generatedUsable: boolean | null = null
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
      generatedUsable = generated.generatedLightUsable
      updatedDealer = {
        ...updatedDealer,
        logo_generated_light_url: generated.generatedLightLogoUrl,
        logo_generated_light_usable: generated.generatedLightUsable,
      }
    }
    onDealerUpdated(updatedDealer, logoType === 'primary'
      ? generatedLightLogoMessage(generatedUsable, 'primary')
      : logoType === 'black' ? 'Custom black logo updated successfully.' : 'Custom white logo updated successfully.')
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
    onDealerUpdated({
      ...dealer,
      logo_generated_light_url: result.generatedLightLogoUrl,
      logo_generated_light_usable: result.generatedLightUsable,
    }, generatedLightLogoMessage(result.generatedLightUsable, 'regenerate'))
  }

  async function generateBlackLogo() {
    if (!dealer) return
    setActionError('')
    setIsGeneratingLightLogo(true)
    const result = await generateDefaultDealerLightLogo(dealer.id, 'black')
    setIsGeneratingLightLogo(false)
    if (result.error || !result.generatedLogoUrl) {
      setActionError(result.error ?? 'We could not generate the black logo.')
      return
    }
    onDealerUpdated({
      ...dealer,
      logo_generated_black_url: result.generatedLogoUrl,
      logo_generated_black_usable: result.generatedLogoUsable,
    }, result.generatedLogoUsable ? 'Black logo generated.' : 'A black logo was generated, but it is not readable enough to offer.')
  }

  function dismissRemoval() {
    if (!removal) return
    URL.revokeObjectURL(removal.originalUrl)
    URL.revokeObjectURL(removal.removedUrl)
    setRemoval(null)
  }

  async function acceptTransparentLogo() {
    if (!removal) return
    const saved = await saveRemovedBackground(removal.file, removal.png, removal.reason)
    if (saved) dismissRemoval()
  }

  async function keepOriginalLogo() {
    if (!removal) return
    const file = removal.file
    dismissRemoval()
    await storeUploadedLogo(file, 'primary')
  }

  async function restoreOriginalLogo() {
    if (!dealer?.logo_source_url) return
    const { error: updateError } = await supabase.from('dealers').update({ logo_url: dealer.logo_source_url }).eq('id', dealer.id)
    if (updateError) {
      setActionError('We could not restore the original logo.')
      return
    }
    onDealerUpdated({ ...dealer, logo_url: dealer.logo_source_url }, 'Original logo restored.')
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
    onDealerUpdated({ ...dealer, ...(data as AdminDealer) }, dealer.logo_generated_light_usable === true
      ? 'Custom light logo removed. The generated default is now in use.'
      : 'Custom light logo removed.')
  }

  async function saveLogoVariants(variants: {
    header: DealerLogoVariant | null
    pages: DealerLogoVariant | null
    secondaryHeader: DealerLogoVariant | null
    secondaryPages: DealerLogoVariant | null
  }) {
    if (!dealer) throw new Error('Dealer not found.')
    const plan = logoVariantSavePlan(dealer.logo_display, variants.header, variants.pages, variants.secondaryHeader, variants.secondaryPages)
    if (plan.mode === 'primary') {
      const written = plan.fields
      const { error: updateError } = await supabase
        .from('dealers')
        .update(written)
        .eq('id', dealer.id)
      if (updateError) throw updateError
      return { ...dealer, ...written }
    }
    const { error: updateError } = await supabase
      .from('dealers')
      .update(plan.fields)
      .eq('id', dealer.id)
    if (updateError) throw updateError
    return { ...dealer, ...plan.fields }
  }

  async function saveLogoDisplay(display: DealerLogoDisplay) {
    if (!dealer) throw new Error('Dealer not found.')
    const { data, error: updateError } = await supabase
      .from('dealers')
      .update({ logo_display: display })
      .eq('id', dealer.id)
      .select('*')
      .single()
    if (updateError) throw updateError
    return { ...dealer, ...(data as AdminDealer), logo_display: display }
  }

  async function saveSecondaryLogos(assets: {
    logo_secondary_url: string | null
    logo_secondary_source_url: string | null
    logo_secondary_light_url: string | null
    logo_secondary_black_url: string | null
  }) {
    if (!dealer) throw new Error('Dealer not found.')
    const { data, error: updateError } = await supabase
      .from('dealers')
      .update(assets)
      .eq('id', dealer.id)
      .select('*')
      .single()
    if (updateError) throw updateError
    return { ...dealer, ...(data as AdminDealer), ...assets }
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
    <div className="page-content dealer-detail-page">
      <Link className="button button--outline dealer-back-link" to="/admin/dealers">Back to Dealers</Link>
      <header className="page-header admin-page-header dealer-page-header page-header--with-action">
        <div className="dealer-page-header__copy">
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

      <DealerDetailSectionNav
        canManageDealerCredentials={canManageDealerCredentials}
        canManageDealerUsers={canManageDealerUsers}
      />

      {dealer.slug_request_status === 'pending' && dealer.requested_slug && (
        <div className="portal-alert" role="status">
          A Door Builder URL change is waiting for review. <a href="#website-address">Review the request</a>
        </div>
      )}

      <DealerSetupChecklist dealer={dealer} dealerId={dealer.id} />

      {isConfirmingDisable && (
        <section className="disable-confirmation" role="alertdialog" aria-labelledby="disable-title">
          <div><h2 id="disable-title">Disable {dealer.company_name}?</h2><p>This dealer will remain in Home Guard records, but will be marked inactive.</p></div>
          <div className="page-actions"><button className="button button--outline" type="button" onClick={() => setIsConfirmingDisable(false)}>Cancel</button><button className="button button--danger" type="button" disabled={isUpdatingStatus} onClick={() => void updateStatus(false)}>{isUpdatingStatus ? 'Disabling...' : 'Disable'}</button></div>
        </section>
      )}

      <div className="dealer-detail-page__sections">
      <section id="company-details" className="content-card dealer-management-card dealer-detail" aria-labelledby="company-details-heading">
        <DealerSectionHeader eyebrow="Company record" title="Company Details" headingId="company-details-heading" description="Core identity, contact information, location, and public links for this dealer." actionLabel="Edit" actionTo={`/admin/dealers/${dealer.id}/edit#company`} onActionClick={onClearSuccess} trailing={<span className={`status-badge ${dealer.is_active ? 'status-badge--active' : 'status-badge--inactive'}`}>{dealer.is_active ? 'Active' : 'Disabled'}</span>} />
        <div className="dealer-detail-groups">
          <DetailGroup title="Core identity"><DetailItem label="Company Name" value={dealer.company_name} /><DetailItem label="Dealer Slug" value={dealer.slug} /><DetailItem label="Status" value={dealer.is_active ? 'Active' : 'Disabled'} /><DetailItem label="Created Date" value={formatDate(dealer.created_at)} /></DetailGroup>
          <DetailGroup id="company-contact" title="Contact information"><DetailItem label="Primary Contact" value={dealer.primary_contact_name} /><DetailItem label="Email" value={dealer.email} href={dealer.email ? `mailto:${dealer.email}` : undefined} /><DetailItem label="Phone" value={dealer.phone} href={dealer.phone ? `tel:${dealer.phone}` : undefined} /></DetailGroup>
          <DetailGroup title="Address & location"><DetailItem label="Street Address" value={dealer.address} /><DetailItem label="City" value={dealer.city} /><DetailItem label="State" value={dealer.state} /><DetailItem label="ZIP" value={dealer.zip} /></DetailGroup>
          <DetailGroup id="dealer-slug" title="Public links"><DetailItem label="Door Builder URL" value={getDealerVisualizerDisplayUrl(dealer.slug)} href={getDealerVisualizerDisplayUrl(dealer.slug)} /><DetailItem label="Website" value={dealer.website} href={dealer.website ?? undefined} /></DetailGroup>
        </div>
      </section>

      <section id="branding" className="content-card dealer-management-card dealer-settings-section dealer-branding-panel" aria-labelledby="branding-heading">
        <DealerSectionHeader eyebrow="Branding" title="Customer-facing Door Builder" headingId="branding-heading" description="Logos are managed here. Brand colors and typography are saved with Edit colors. Marketing banners use the logo and do not recolor the template." actionLabel="Edit colors" actionTo={`/admin/dealers/${dealer.id}/edit#branding`} onActionClick={onClearSuccess} />
        <p id="branding-colors" className="dealer-setup-anchor" tabIndex={-1}>Brand colors are saved with Edit colors. This section does not contain a second color form.</p>
        <div className="profile-logo-grid">
        <section className="profile-logo-card dealer-setup-anchor" id="logo-original" tabIndex={-1}>
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
            <p>Upload your standard logo. A flat outer background is detected automatically. Nothing is saved until you accept the transparent PNG or keep the upload.</p>
          </div>
          <label className={`button button--outline upload-button ${uploadingLogo ? 'is-disabled' : ''}`}>
            {uploadingLogo === 'primary' ? 'Uploading...' : 'Upload Primary Logo'}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" disabled={uploadingLogo !== null} onChange={(event) => void handleLogoUpload(event, 'primary')} />
          </label>
          {dealer.logo_source_url && (
            <button className="button button--outline" type="button" onClick={() => void restoreOriginalLogo()}>Restore Original</button>
          )}
          {removalNotice && <p className="logo-helper-note" role="status">{removalNotice}</p>}
        </section>

        <section className="profile-logo-card dealer-setup-anchor" id="logo-white" tabIndex={-1}>
          <div className="profile-logo-preview profile-logo-preview--dark">
            {dealer.logo_light_url || dealer.logo_generated_light_url ? (
              <img src={dealer.logo_light_url ?? dealer.logo_generated_light_url ?? ''} alt={`${dealer.company_name} light logo`} />
            ) : (
              <span>{dealer.company_name.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div>
            <p className="eyebrow">{lightLogoEyebrow(dealer)}</p>
            <h2>White Logo</h2>
            <p>A white logo is generated from the original. Upload a custom version to replace it.</p>
            {!dealer.logo_light_url && dealer.logo_generated_light_url && dealer.logo_generated_light_usable !== true && (
              <p className="logo-helper-note">{dealer.logo_generated_light_usable === false
                ? 'This generated file is not readable enough to offer as the White/Light logo.'
                : 'This generated file has not passed the readability check, so it is not offered as the White/Light logo.'}</p>
            )}
          </div>
          <label className={`button button--outline upload-button ${uploadingLogo ? 'is-disabled' : ''}`}>
            {uploadingLogo === 'light' ? 'Uploading...' : 'Upload White Logo'}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" disabled={uploadingLogo !== null} onChange={(event) => void handleLogoUpload(event, 'light')} />
          </label>
          <div className="page-actions">
            {dealer.logo_url && (
              <button className="button button--outline" type="button" disabled={isGeneratingLightLogo || uploadingLogo !== null} onClick={() => void generateLightLogo()}>
                {isGeneratingLightLogo ? 'Generating...' : 'Generate White'}
              </button>
            )}
            {dealer.logo_light_url && (
              <button className="button button--danger-outline" type="button" disabled={isGeneratingLightLogo || uploadingLogo !== null} onClick={() => void removeCustomLightLogo()}>
                Remove Custom Logo
              </button>
            )}
          </div>
        </section>
        <section className="profile-logo-card dealer-setup-anchor" id="logo-black" tabIndex={-1}>
          <div className="profile-logo-preview">
            {dealer.logo_black_url || (dealer.logo_generated_black_usable && dealer.logo_generated_black_url) ? (
              <img src={dealer.logo_black_url ?? dealer.logo_generated_black_url ?? ''} alt={`${dealer.company_name} black logo`} />
            ) : (
              <span>{dealer.company_name.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div>
            <p className="eyebrow">{dealer.logo_black_url ? 'Custom black' : dealer.logo_generated_black_usable ? 'Generated black' : 'Black logo'}</p>
            <h2>Black Logo</h2>
            <p>Generate a black version from the original, or upload your own. An unreadable result is not offered.</p>
          </div>
          <label className={`button button--outline upload-button ${uploadingLogo ? 'is-disabled' : ''}`}>
            {uploadingLogo === 'black' ? 'Uploading...' : 'Upload Black Logo'}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" disabled={uploadingLogo !== null} onChange={(event) => void handleLogoUpload(event, 'black')} />
          </label>
          {dealer.logo_url && (
            <button className="button button--outline" type="button" disabled={isGeneratingLightLogo || uploadingLogo !== null} onClick={() => void generateBlackLogo()}>
              {isGeneratingLightLogo ? 'Generating...' : 'Generate Black'}
            </button>
          )}
        </section>
        </div>
        {removal && (
          <LogoBackgroundDialog
            originalUrl={removal.originalUrl}
            removedUrl={removal.removedUrl}
            reason={removal.reason}
            busy={uploadingLogo !== null}
            onAccept={() => void acceptTransparentLogo()}
            onKeep={() => void keepOriginalLogo()}
            onCancel={dismissRemoval}
          />
        )}
      </section>

      <DealerLogoDisplaySettings
        dealer={dealer}
        onSaveDisplay={saveLogoDisplay}
        onSaveSecondary={saveSecondaryLogos}
        onUpdated={(updated) => onDealerUpdated(updated, 'Logo display saved.')}
      />

      <DealerLogoVariantSettings
        dealer={dealer}
        onSave={saveLogoVariants}
        onUpdated={(updated) => onDealerUpdated(updated, 'Door Builder logo choices saved.')}
        onHydrated={(updated) => onDealerUpdated(updated, successMessage)}
      />

      <DealerLogoPlacementSettings
        dealer={dealer}
        onSave={saveLogoPlacement}
        onUpdated={(updated) => onDealerUpdated(updated, 'Dealer logo placement saved.')}
      />

      <section id="design" className="content-card dealer-management-card dealer-settings-summary dealer-setup-anchor" tabIndex={-1} aria-labelledby="design-heading">
        <DealerSectionHeader eyebrow="Typography & Design" title="Door Builder Design" headingId="design-heading" description="Manage heading and UI fonts, weights, sizes, custom font files, and a live typography preview." actionLabel="Edit design" actionTo={`/admin/dealers/${dealer.id}/edit#design`} onActionClick={onClearSuccess} />
        <div className="dealer-design-preview" aria-hidden="true"><span>Aa</span><div><strong>Build a Door Made for Your Home.</strong><small>Heading and interface typography preview</small></div></div>
      </section>

      {canManageDealerCredentials ? (
        <>
          <AdminDealerMarketingTools dealerId={dealer.id} />
          <DealerCrmIntegrations dealerId={dealer.id} />
        </>
      ) : (
        <section className="content-card dealer-management-card dealer-setup-anchor" id="marketing-and-crm" tabIndex={-1} aria-labelledby="marketing-and-crm-heading">
          <h2 id="marketing-and-crm-heading">Marketing Tools and CRM Integrations</h2>
          <p>This section needs additional access. It is available to an access manager.</p>
        </section>
      )}

      <section className="content-card slug-review-card" id="website-address">
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
      {canManageDealerUsers ? (
        <DealerUserAccess dealerId={dealer.id} sectionId="dealer-users" canSetPassword={canManageDealerCredentials} />
      ) : (
        <section className="content-card dealer-management-card dealer-setup-anchor" id="dealer-users" tabIndex={-1} aria-labelledby="dealer-users-locked-heading">
          <h2 id="dealer-users-locked-heading">Dealer Users</h2>
          <p>This section needs additional access. It is available to an access manager or a billing admin.</p>
        </section>
      )}
      </div>
    </div>
  )
}
