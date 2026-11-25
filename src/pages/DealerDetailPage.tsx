import { useEffect, useId, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
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

  useEffect(() => {
    if (!dealer) return
    const redirect = () => {
      if (!isLegacyBrandingTarget(window.location.hash)) return
      const section = studioSectionFromValue(window.location.hash)
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

  const editCompanyPath = `/admin/dealers/${dealer.id}/edit#company`
  const editSlugPath = `/admin/dealers/${dealer.id}/edit#dealer-slug`
  const website = dealer.website?.trim() ?? ''
  const visualizerUrl = getDealerVisualizerDisplayUrl(dealer.slug)
  const headerHref = website || visualizerUrl

  return (
    <div className="page-content dealer-detail-page">
      <header className="dd-heading">
        <nav className="dd-crumb" aria-label="Breadcrumb">
          <Link to="/admin/dealers" aria-label="Back to Dealers">Dealers</Link>
          <span aria-hidden="true">›</span>
          <span>{dealer.company_name}</span>
        </nav>
        <div className="dd-heading__row">
          <div className="dd-heading__copy">
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
      {dealer.slug_request_status === 'pending' && dealer.requested_slug && (
        <div className="portal-alert" role="status">
          A Door Builder URL change is waiting for review. <a href="#website-address">Review the request</a>
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
        <DealerSetupChecklist dealer={dealer} dealerId={dealer.id} />

        <section id="company-details" className="content-card dealer-management-card dealer-detail" aria-labelledby="company-details-heading">
          <DealerSectionHeader
            icon="building"
            eyebrow="Company record"
            title="Company Details"
            headingId="company-details-heading"
            description="Core information about the dealer and their business."
            actionLabel="Edit Details"
            actionTo={editCompanyPath}
            onActionClick={onClearSuccess}
          />
          <div className="dealer-detail-groups dd-fields">
            <DetailItem label="Company Name" value={dealer.company_name} />
            <DetailItem label="Website" value={dealer.website} href={dealer.website ?? undefined} external />
            <DetailItem label="Dealer Slug" value={dealer.slug} />
            <div className="dealer-detail__item">
              <dt>Status</dt>
              <dd><StatusBadge active={dealer.is_active} /></dd>
            </div>
            <DetailItem label="Created" value={formatDate(dealer.created_at)} />
            <DetailItem label="Primary Contact" value={dealer.primary_contact_name} />
            <DetailItem label="Email" value={dealer.email} href={dealer.email ? `mailto:${dealer.email}` : undefined} />
            <DetailItem label="Phone" value={dealer.phone} href={dealer.phone ? `tel:${dealer.phone}` : undefined} />
            <DetailItem label="Street Address" value={dealer.address} />
            <DetailItem label="City" value={dealer.city} />
            <DetailItem label="State" value={dealer.state} />
            <DetailItem label="ZIP" value={dealer.zip} />
            <div className="dealer-detail__item dd-field--wide">
              <dt>Door Builder URL</dt>
              <dd>
                <a href={visualizerUrl} target="_blank" rel="noreferrer">
                  {visualizerUrl}
                  <DealerOutlineIcon name="external" />
                </a>
              </dd>
            </div>
          </div>
        </section>

        <section className="content-card dealer-management-card dd-card--compact" id="branding-studio">
          <DealerSectionHeader
            compact
            icon="palette"
            eyebrow="Door Builder"
            title="Branding Studio"
            description="Customize the dealer’s branding—logos, colors, fonts, and visual style—for a consistent experience. Marketing banners use the logo and do not recolor the template."
            actionLabel="Open Branding Studio"
            actionTo={`/admin/dealers/${dealer.id}/branding`}
            actionIcon="external"
            actionTone="primary"
          />
        </section>

        <DoorBuilderLeadWebhook dealerId={dealer.id} preview={webhookPreview} />

        {canManageDealerCredentials ? (
          <>
            <AdminDealerMarketingTools dealerId={dealer.id} previewDealer={marketingPreview} />
            <DealerCrmIntegrations dealerId={dealer.id} preview={crmPreview} />
          </>
        ) : (
          <section className="content-card dealer-management-card dealer-setup-anchor" id="marketing-and-crm" tabIndex={-1} aria-labelledby="marketing-and-crm-heading">
            <h2 id="marketing-and-crm-heading">Marketing Tools and CRM Integrations</h2>
            <p>This section needs additional access. It is available to an access manager.</p>
          </section>
        )}

        <section className="content-card dealer-management-card slug-review-card" id="website-address">
          <DealerSectionHeader
            icon="image"
            eyebrow="Dealer request"
            title="Visualizer URL Request"
            description="Request a custom Visualizer URL for this dealer."
            actionLabel="Request URL"
            actionTo={editSlugPath}
            actionIcon="external"
          />
          {dealer.slug_request_status === 'pending' && dealer.requested_slug ? (
            <div className="slug-review-card__body">
              <dl className="slug-review-details">
                <DetailItem label="Current URL" value={visualizerUrl} />
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
            <div className="dd-empty">
              <span className="dd-empty__icon" aria-hidden="true"><DealerOutlineIcon name="image" /></span>
              <strong>No Visualizer URL requested yet.</strong>
              <p>When this dealer asks for a different Door Builder address, the request shows up here to approve or reject.</p>
            </div>
          )}
        </section>
        {canManageDealerUsers ? (
          <DealerUserAccess dealerId={dealer.id} sectionId="dealer-users" canSetPassword={canManageDealerCredentials} previewUsers={userPreview} />
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
