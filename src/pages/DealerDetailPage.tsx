import { useEffect, useRef, useState, type ReactNode } from 'react'
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
  const navigate = useNavigate()
  const [isConfirmingDisable, setIsConfirmingDisable] = useState(false)
  const disableButtonRef = useRef<HTMLButtonElement>(null)
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
        </div>
      </header>

      {successMessage && <div className="portal-alert portal-alert--success" role="status">{successMessage}</div>}
      {actionError && <div className="portal-alert" role="alert">{actionError}</div>}

      <DealerDetailSectionNav
        dealerId={dealer.id}
        canManageDealerCredentials={canManageDealerCredentials}
        canManageDealerUsers={canManageDealerUsers}
      />

      {dealer.slug_request_status === 'pending' && dealer.requested_slug && (
        <div className="portal-alert" role="status">
          A Door Builder URL change is waiting for review. <a href="#website-address">Review the request</a>
        </div>
      )}

      <DealerSetupChecklist dealer={dealer} dealerId={dealer.id} />

      <DisableDealerDialog
        open={isConfirmingDisable}
        companyName={dealer.company_name}
        isUpdating={isUpdatingStatus}
        onCancel={() => setIsConfirmingDisable(false)}
        onConfirm={() => void updateStatus(false)}
        returnFocusRef={disableButtonRef}
      />

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

      <section className="content-card dealer-management-card" id="branding-studio">
        <div className="dealer-form__section-heading">
          <p className="eyebrow">Door Builder</p>
          <h2>Branding Studio</h2>
          <p>Logos, placement, colors, and typography for this dealer’s Door Builder. Marketing banners use the logo and do not recolor the template.</p>
        </div>
        <Link className="button button--primary" to={`/admin/dealers/${dealer.id}/branding`}>Customize Door Builder</Link>
      </section>

      <DoorBuilderLeadWebhook dealerId={dealer.id} />

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
