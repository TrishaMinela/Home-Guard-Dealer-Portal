import { useEffect, useId, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { AdminDealer } from '../types/admin'
import { getDealerVisualizerDisplayUrl } from '../config/visualizer'
import { DealerUserAccess } from '../components/DealerUserAccess'
import { isLegacyBrandingTarget, studioSectionFromValue } from '../features/branding-studio/sections'
import { AdminDealerMarketingTools } from '../components/AdminDealerMarketingTools'
import { DealerSectionHeader } from '../components/DealerSectionHeader'
import { DealerDetailSectionNav } from '../components/DealerDetailSectionNav'
import { DealerCrmIntegrations } from '../components/DealerCrmIntegrations'
import { DoorBuilderLeadWebhook } from '../components/DoorBuilderLeadWebhook'
import { DealerSetupChecklist } from '../components/DealerSetupChecklist'
import { DisableDealerDialog } from '../components/DisableDealerDialog'
import { DealerOutlineIcon } from '../components/DealerOutlineIcon'
import { dealerSectionFromLegacyHash, dealerSectionFromPathname, dealerSectionHref, dealerDetailSections } from '../components/dealerDetailSections'
import { EditDealerPage } from './EditDealerPage'
import { AdminBrandingStudioRoute } from './BrandingStudioPage'
import type { DealerAccount } from '../types/account'

type DealerDetailPageProps = {
  dealers: AdminDealer[]
  isLoading: boolean
  error: string
  successMessage: string
  onDealerUpdated: (dealer: AdminDealer, message: string) => void
  onClearSuccess: () => void
  canManageDealerUsers: boolean
  canManageDealerCredentials: boolean
  webhookPreview?: ComponentProps<typeof DoorBuilderLeadWebhook>['preview']
  crmPreview?: ComponentProps<typeof DealerCrmIntegrations>['preview']
  marketingPreview?: DealerAccount
  userPreview?: ComponentProps<typeof DealerUserAccess>['previewUsers']
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date))
}

function DetailItem({ label, value, href, external }: { label: string; value: ReactNode; href?: string; external?: boolean }) {
  const text = typeof value === 'string' ? value : null
  return (
    <div className="dealer-detail__item">
      <dt>{label}</dt>
      <dd>
        {href && text ? (
          <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel={href.startsWith('http') ? 'noreferrer' : undefined}>
            {text}
            {external ? <DealerOutlineIcon name="external" /> : null}
          </a>
        ) : value || '—'}
      </dd>
    </div>
  )
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span className={`status-badge dd-status ${active ? 'status-badge--active' : 'status-badge--inactive'}`}>
      <span className="dd-status__dot" aria-hidden="true" />
      {active ? 'Active' : 'Disabled'}
    </span>
  )
}

export function LegacyDealerEditRedirect() {
  const { dealerId } = useParams()
  const hash = window.location.hash
  const id = hash.replace(/^#/, '')
  if (id === 'branding' || id === 'primary-color' || id === 'secondary-color') {
    return <Navigate to={`/admin/dealers/${dealerId}/branding?section=colors`} replace />
  }
  if (id === 'design' || id === 'heading-font-family') {
    return <Navigate to={`/admin/dealers/${dealerId}/branding?section=typography`} replace />
  }
  return <Navigate to={`/admin/dealers/${dealerId}/company/edit${hash}`} replace />
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
  webhookPreview,
  crmPreview,
  marketingPreview,
  userPreview,
}: DealerDetailPageProps) {
  const { dealerId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const actionsMenuId = useId()
  const [isConfirmingDisable, setIsConfirmingDisable] = useState(false)
  const [actionsOpen, setActionsOpen] = useState(false)
  const disableButtonRef = useRef<HTMLButtonElement>(null)
  const actionsRef = useRef<HTMLDivElement>(null)
  const [actionError, setActionError] = useState('')
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const [isReviewingSlug, setIsReviewingSlug] = useState(false)
  const dealer = dealers.find((item) => item.id === dealerId)
  const sectionPath = dealer ? dealerSectionFromPathname(location.pathname, dealer.id) : ''
  const section = dealerDetailSections.find((item) => item.path === (sectionPath === 'company/edit' ? 'company' : sectionPath)) ?? dealerDetailSections[0]

  useEffect(() => {
    if (!dealer || sectionPath == null) return
    document.querySelector<HTMLElement>('.portal-main')?.scrollTo({ top: 0 })
  }, [dealer, sectionPath])

  useEffect(() => {
    if (!dealer) return
    const redirect = () => {
      const hash = window.location.hash
      const legacySection = dealerSectionFromLegacyHash(hash)
      if (legacySection != null) {
        navigate(dealerSectionHref(dealer.id, legacySection), { replace: true })
        return
      }
      if (!isLegacyBrandingTarget(hash)) return
      const section = studioSectionFromValue(hash)
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
      navigate(`/admin/dealers/${dealer.id}/branding${section ? `?section=${section}` : ''}`, { replace: true })
    }
    redirect()
    window.addEventListener('hashchange', redirect)
    return () => window.removeEventListener('hashchange', redirect)
  }, [dealer, navigate])

  useEffect(() => {
    if (!actionsOpen) return
    function onPointerDown(event: PointerEvent) {
      if (isConfirmingDisable) return
      if (!actionsRef.current?.contains(event.target as Node)) setActionsOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isConfirmingDisable) setActionsOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [actionsOpen, isConfirmingDisable])

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

  if (sectionPath == null) {
    return <Navigate to={`/admin/dealers/${dealer.id}`} replace />
  }

  const editCompanyPath = dealerSectionHref(dealer.id, 'company/edit')
  const editSlugPath = `${dealerSectionHref(dealer.id, 'company/edit')}#dealer-slug`
  const sectionTitle = sectionPath === 'company/edit' ? 'Edit company' : section.label
  const website = dealer.website?.trim() ?? ''
  const visualizerUrl = getDealerVisualizerDisplayUrl(dealer.slug)
  const headerHref = website || visualizerUrl

  return (
    <div className="page-content dealer-detail-page">
      <header className="dd-heading">
        <nav className="dd-crumb" aria-label="Breadcrumb">
          <Link to="/admin/dealers" aria-label="Back to Dealers">Dealers</Link>
          <span aria-hidden="true">›</span>
          {sectionPath ? <Link to={dealerSectionHref(dealer.id, '')}>{dealer.company_name}</Link> : <span>{dealer.company_name}</span>}
          {sectionPath ? <><span aria-hidden="true">›</span><span>{sectionTitle}</span></> : null}
        </nav>
        <div className="dd-heading__row">
          <div className="dd-heading__copy">
            <p className="dd-open-section">{sectionTitle}</p>
            <h1>{dealer.company_name}</h1>
            <a className="dd-website" href={headerHref} target="_blank" rel="noreferrer">
              <DealerOutlineIcon name="external" />
              <span>{headerHref}</span>
            </a>
            <div className="dd-meta">
              <StatusBadge active={dealer.is_active} />
              <span className="dd-meta__item">Dealer ID: {dealer.id}</span>
              <span className="dd-meta__item">Created: {formatDate(dealer.created_at)}</span>
            </div>
          </div>
          <div className="page-actions dd-heading__actions">
            <div className="dd-actions" ref={actionsRef}>
              <button
                className="button button--outline"
                type="button"
                aria-expanded={actionsOpen}
                aria-controls={actionsMenuId}
                aria-haspopup="true"
                onClick={(event) => {
                  // detail 0 is a scripted click, which can be delivered twice. Opening is idempotent.
                  if (event.detail === 0) {
                    setActionsOpen(true)
                    return
                  }
                  setActionsOpen((open) => !open)
                }}
              >
                Actions
                <DealerOutlineIcon name="chevron" />
              </button>
              <div className="dd-actions__menu" id={actionsMenuId} hidden={!actionsOpen}>
                {dealer.is_active ? (
                  <button
                    ref={disableButtonRef}
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
                <Link to={editCompanyPath} onClick={onClearSuccess}>Edit company details</Link>
              </div>
            </div>
            <Link className="button button--primary dd-text-button" to={editCompanyPath} onClick={onClearSuccess}>
              <DealerOutlineIcon name="pencil" />
              Update Dealer
            </Link>
          </div>
        </div>
      </header>

      {successMessage && <div className="portal-alert portal-alert--success" role="status">{successMessage}</div>}
      {actionError && <div className="portal-alert" role="alert">{actionError}</div>}
      {dealer.slug_request_status === 'pending' && dealer.requested_slug && (sectionPath === '' || sectionPath === 'visualizer') && (
        <div className="portal-alert" role="status">
          A Door Builder URL change is waiting for review. <Link to={dealerSectionHref(dealer.id, 'visualizer')}>Review the request</Link>
        </div>
      )}

      <DealerDetailSectionNav
        dealerId={dealer.id}
        canManageDealerCredentials={canManageDealerCredentials}
        canManageDealerUsers={canManageDealerUsers}
      />

      <DisableDealerDialog
        open={isConfirmingDisable}
        companyName={dealer.company_name}
        isUpdating={isUpdatingStatus}
        onCancel={() => setIsConfirmingDisable(false)}
        onConfirm={() => void updateStatus(false)}
        returnFocusRef={disableButtonRef}
      />

      <div className="dealer-detail-page__sections">
        {sectionPath === '' && (
          <>
            <section className="content-card dd-section" aria-labelledby="dealer-summary-heading">
              <DealerSectionHeader icon="building" eyebrow="Dealer" title="Dealer summary" headingId="dealer-summary-heading" description="Key details for this dealer. Use the tabs to change a setting." />
              <dl className="dd-rows">
                <DetailItem label="Company Name" value={dealer.company_name} />
                <div className="dealer-detail__item"><dt>Status</dt><dd><StatusBadge active={dealer.is_active} /></dd></div>
                <DetailItem label="Website" value={dealer.website} href={dealer.website ?? undefined} external />
                <DetailItem label="Dealer Slug" value={dealer.slug} />
                <DetailItem label="Created" value={formatDate(dealer.created_at)} />
                <DetailItem label="Door Builder URL" value={visualizerUrl} href={visualizerUrl} external />
              </dl>
            </section>
            <DealerSetupChecklist dealer={dealer} dealerId={dealer.id} />
            <p className="dd-note">Marketing banners use the logo and do not recolor the template.</p>
          </>
        )}

        {(sectionPath === 'company' || sectionPath === 'company/edit') && (
        <section id="company-details" className="content-card dd-section dealer-detail" aria-labelledby="company-details-heading">
          {sectionPath === 'company' ? (
            <DealerSectionHeader
              icon="building"
              eyebrow="Company record"
              title="Company Details"
              headingId="company-details-heading"
              description="Core information about the dealer and their business."
              actionLabel="Edit Details"
              actionTo={editCompanyPath}
              actionTone="primary"
              onActionClick={onClearSuccess}
            />
          ) : (
            <DealerSectionHeader
              icon="building"
              eyebrow="Company record"
              title="Edit company"
              headingId="company-details-heading"
              description="Core information about the dealer and their business."
              actionLabel="Company details"
              actionTo={dealerSectionHref(dealer.id, 'company')}
            />
          )}
          {sectionPath === 'company/edit' ? (
            <div className="dd-editor">
              <EditDealerPage dealers={dealers} isLoading={false} error="" onSaved={(saved) => { onDealerUpdated(saved, `${saved.company_name} was updated successfully.`); onClearSuccess() }} scope="company" />
              <p className="dd-note">Saving company details does not change logos, brand colors, webhooks, or CRM credentials.</p>
            </div>
          ) : (
          <>
            <div className="dd-split">
              <div className="dd-panel">
                <h3>Business</h3>
                <p>Name, website, and the public Door Builder address.</p>
                <dl className="dealer-detail-groups dd-rows">
                  <DetailItem label="Company Name" value={dealer.company_name} />
                  <DetailItem label="Website" value={dealer.website} href={dealer.website ?? undefined} external />
                  <DetailItem label="Dealer Slug" value={dealer.slug} />
                  <div className="dealer-detail__item"><dt>Status</dt><dd><StatusBadge active={dealer.is_active} /></dd></div>
                  <DetailItem label="Created" value={formatDate(dealer.created_at)} />
                  <DetailItem label="Door Builder URL" value={visualizerUrl} href={visualizerUrl} external />
                </dl>
              </div>
              <div className="dd-panel">
                <h3>Contact</h3>
                <p>Who to reach and where the business is located.</p>
                <dl className="dd-rows">
                  <DetailItem label="Primary Contact" value={dealer.primary_contact_name} />
                  <DetailItem label="Email" value={dealer.email} href={dealer.email ? `mailto:${dealer.email}` : undefined} />
                  <DetailItem label="Phone" value={dealer.phone} href={dealer.phone ? `tel:${dealer.phone}` : undefined} />
                  <DetailItem label="Street Address" value={dealer.address} />
                  <DetailItem label="City" value={dealer.city} />
                  <DetailItem label="State" value={dealer.state} />
                  <DetailItem label="ZIP" value={dealer.zip} />
                </dl>
              </div>
            </div>
            <p className="dd-note">Company details do not change logos, brand colors, or lead delivery. Use Edit Details to update these fields.</p>
          </>
          )}
        </section>
        )}

        {sectionPath === 'branding' && (
        <section className="dd-studio" id="branding-studio">
          <AdminBrandingStudioRoute dealers={dealers} onDealerUpdated={(saved, message) => { onDealerUpdated(saved, message); onClearSuccess() }} />
        </section>
        )}

        {sectionPath === 'leads' && <DoorBuilderLeadWebhook dealerId={dealer.id} preview={webhookPreview} />}

        {sectionPath === 'marketing' && (canManageDealerCredentials ? (
          <AdminDealerMarketingTools dealerId={dealer.id} previewDealer={marketingPreview} />
        ) : (
          <section className="content-card dealer-management-card dealer-setup-anchor" id="marketing-and-crm" tabIndex={-1} aria-labelledby="marketing-and-crm-heading">
            <h2 id="marketing-and-crm-heading">Marketing Tools</h2>
            <p>This section needs additional access. It is available to an access manager.</p>
          </section>
        ))}

        {sectionPath === 'crm' && (canManageDealerCredentials ? (
          <DealerCrmIntegrations dealerId={dealer.id} preview={crmPreview} />
        ) : (
          <section className="content-card dealer-management-card dealer-setup-anchor" id="marketing-and-crm" tabIndex={-1} aria-labelledby="crm-locked-heading">
            <h2 id="crm-locked-heading">CRM Integrations</h2>
            <p>This section needs additional access. It is available to an access manager.</p>
          </section>
        ))}

        {sectionPath === 'visualizer' && (
        <section className="content-card dd-section slug-review-card" id="website-address">
          <DealerSectionHeader
            icon="image"
            eyebrow="Dealer request"
            title="Visualizer URL Request"
            description="Request a custom Visualizer URL for this dealer."
            actionLabel="Request URL"
            actionTo={editSlugPath}
            actionIcon="external"
            actionTone="primary"
            trailing={<span className={`status-badge dd-status ${dealer.slug_request_status === 'pending' ? 'dd-status--test' : 'status-badge--inactive'}`}>{dealer.slug_request_status === 'pending' ? 'Pending review' : 'No request'}</span>}
          />
          {dealer.slug_request_status === 'pending' && dealer.requested_slug ? (
            <>
              <div className="dd-split">
                <div className="dd-panel">
                  <h3>Current address</h3>
                  <p>The Door Builder address customers use today.</p>
                  <dl className="dd-rows">
                    <DetailItem label="Current URL" value={visualizerUrl} />
                  </dl>
                </div>
                <div className="dd-panel">
                  <h3>Requested address</h3>
                  <p>The address waiting for approval.</p>
                  <dl className="dd-rows">
                    <DetailItem label="Requested URL" value={getDealerVisualizerDisplayUrl(dealer.requested_slug)} />
                    <DetailItem label="Requested Date" value={dealer.slug_requested_at ? formatDate(dealer.slug_requested_at) : '—'} />
                  </dl>
                </div>
              </div>
              <div className="dd-actions-row">
                <button className="button button--danger-outline" type="button" disabled={isReviewingSlug} onClick={() => void reviewSlugRequest('reject')}>Reject</button>
                <button className="button button--primary" type="button" disabled={isReviewingSlug} onClick={() => void reviewSlugRequest('approve')}>{isReviewingSlug ? 'Working...' : 'Approve'}</button>
              </div>
            </>
          ) : (
            <div className="dd-empty">
              <span className="dd-empty__icon" aria-hidden="true"><DealerOutlineIcon name="image" /></span>
              <strong>No Visualizer URL requested yet.</strong>
              <p>When this dealer asks for a different Door Builder address, the request shows up here to approve or reject.</p>
            </div>
          )}
          <p className="dd-note">Approving replaces the public Door Builder address. Rejecting leaves the current address in place. This does not change logos or lead delivery.</p>
        </section>
        )}
        {sectionPath === 'access' && (canManageDealerUsers ? (
          <DealerUserAccess dealerId={dealer.id} sectionId="dealer-users" canSetPassword={canManageDealerCredentials} previewUsers={userPreview} />
        ) : (
          <section className="content-card dealer-management-card dealer-setup-anchor" id="dealer-users" tabIndex={-1} aria-labelledby="dealer-users-locked-heading">
            <h2 id="dealer-users-locked-heading">Dealer Users</h2>
            <p>This section needs additional access. It is available to an access manager or a billing admin.</p>
          </section>
        ))}
      </div>
    </div>
  )
}
