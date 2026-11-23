import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { DealerAccount } from '../types/account'
import type { DealerFormValues } from '../types/admin'
import { isReservedDealerSlug, normalizeDealerSlug } from '../utils/dealerSlug'
import {
  UNSAVED_PROFILE_LEAVE_MESSAGE,
  UNSAVED_PROFILE_SECTION_MESSAGE,
  unsavedProfileClickFromEvent,
  unsavedProfileNavigationKind,
} from '../utils/unsavedProfileNavigation'
import { getDealerVisualizerDisplayUrl } from '../config/visualizer'
import { isLegacyBrandingTarget, studioSectionFromValue } from '../features/branding-studio/sections'

type DealerCompanyProfilePageProps = {
  dealer: DealerAccount
  canEditAppearance?: boolean
  onDealerUpdated: (dealer: DealerAccount) => void
}

function dealerToForm(dealer: DealerAccount): DealerFormValues {
  return {
    companyName: dealer.company_name,
    slug: dealer.slug,
    primaryContactName: dealer.primary_contact_name ?? '',
    email: dealer.email ?? '',
    phone: dealer.phone ?? '',
    website: dealer.website ?? '',
    address: dealer.address ?? '',
    city: dealer.city ?? '',
    state: dealer.state ?? '',
    zip: dealer.zip ?? '',
    primaryColor: dealer.primary_color ?? '',
    secondaryColor: dealer.secondary_color ?? '',
  }
}

export function DealerCompanyProfilePage({
  dealer,
  canEditAppearance = false,
  onDealerUpdated,
}: DealerCompanyProfilePageProps) {
  const navigate = useNavigate()
  const [form, setForm] = useState(() => dealerToForm(dealer))
  const profileDirty = JSON.stringify(form) !== JSON.stringify(dealerToForm(dealer))
  useEffect(() => {
    if (!profileDirty) return
    const onLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    // BrowserRouter has no useBlocker. Capture same-tab link clicks, including the sidebar, while this form is dirty.
    const onClick = (event: MouseEvent) => {
      const kind = unsavedProfileNavigationKind(unsavedProfileClickFromEvent(event, true), window.location.href)
      if (kind === 'allow') return
      const message = kind === 'section' ? UNSAVED_PROFILE_SECTION_MESSAGE : UNSAVED_PROFILE_LEAVE_MESSAGE
      if (window.confirm(message)) return
      event.preventDefault()
      event.stopPropagation()
    }
    window.addEventListener('beforeunload', onLeave)
    document.addEventListener('click', onClick, true)
    return () => {
      window.removeEventListener('beforeunload', onLeave)
      document.removeEventListener('click', onClick, true)
    }
  }, [profileDirty])
  useEffect(() => {
    const redirect = () => {
      if (!isLegacyBrandingTarget(window.location.hash)) return
      const section = studioSectionFromValue(window.location.hash)
      const allowed = section
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
      navigate(`/company/branding${allowed ? `?section=${allowed}` : ''}`, { replace: true })
    }
    redirect()
    window.addEventListener('hashchange', redirect)
    return () => window.removeEventListener('hashchange', redirect)
  }, [canEditAppearance, navigate])
  const [requestedSlug, setRequestedSlug] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isRequestingSlug, setIsRequestingSlug] = useState(false)
  const normalizedRequestedSlug = normalizeDealerSlug(requestedSlug)

  function updateField(field: keyof DealerFormValues, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function updateProfile(
    values: DealerFormValues,
    logoUrl: string | null,
    logoLightUrl: string | null,
  ) {
    return supabase
      .rpc('update_my_dealer_profile', {
        p_dealer_id: dealer.id,
        p_company_name: values.companyName,
        p_primary_contact_name: values.primaryContactName,
        p_email: values.email,
        p_phone: values.phone,
        p_website: values.website,
        p_address: values.address,
        p_city: values.city,
        p_state: values.state,
        p_zip: values.zip,
        p_primary_color: values.primaryColor,
        p_secondary_color: values.secondaryColor,
        p_logo_url: logoUrl ?? '',
        p_logo_light_url: logoLightUrl ?? '',
      })
      .single()
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')
    setError('')
    setIsSaving(true)

    const { data, error: updateError } = await updateProfile(
      form,
      dealer.logo_url,
      dealer.logo_light_url,
    )

    if (updateError) {
      console.error('Failed to update dealer profile.', updateError)
      setError('We could not save your company profile. Please try again.')
      setIsSaving(false)
      return
    }

    const updatedDealer = data as DealerAccount
    onDealerUpdated(updatedDealer)
    setForm(dealerToForm(updatedDealer))
    setMessage('Company profile saved successfully.')
    setIsSaving(false)
  }

  async function handleSlugRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')
    setError('')

    if (!normalizedRequestedSlug) {
      setError('Enter a valid Visualizer URL slug.')
      return
    }
    if (isReservedDealerSlug(normalizedRequestedSlug)) {
      setError('This dealer slug is reserved for the Door Builder. Please choose another URL.')
      return
    }

    setIsRequestingSlug(true)
    const { data, error: requestError } = await supabase
      .rpc('request_my_dealer_slug', {
        p_dealer_id: dealer.id,
        p_requested_slug: requestedSlug,
      })
      .single()

    if (requestError) {
      console.error('Failed to request dealer slug.', requestError)
      setError(
        requestError.code === '23505'
          ? 'This Visualizer URL is already in use or awaiting approval.'
          : 'We could not submit your URL request. Please try again.',
      )
      setIsRequestingSlug(false)
      return
    }

    onDealerUpdated(data as DealerAccount)
    setRequestedSlug('')
    setMessage('Visualizer URL request submitted for Home Guard approval.')
    setIsRequestingSlug(false)
  }

  return (
    <div className="page-content">
      <header className="page-header">
        <p className="eyebrow">Dealer Portal</p>
        <h1>Company Profile</h1>
        <p>Manage your company information and dealer branding.</p>
      </header>

      {message && <div className="portal-alert portal-alert--success" role="status">{message}</div>}
      {error && <div className="portal-alert" role="alert">{error}</div>}
      {profileDirty && <div className="portal-alert" role="status">Company details or colors have unsaved changes.</div>}

      <nav className="dealer-settings-nav" aria-label="Company profile sections">
        <a href="#company-details">Company Details</a>
        <Link to="/company/branding">Branding Studio</Link>
        <a href="#colors-and-typography">Colors and Typography</a>
        <a href="#website-address">Website Address</a>
      </nav>

      <form onSubmit={handleSave}>
      <section className="content-card dealer-form" id="company-details">
        <div className="dealer-form__section">
          <div className="dealer-form__section-heading">
            <h2>Company Details</h2>
            <p>Name, contact, and address for this dealership. Brand colors are edited in the Branding Studio.</p>
          </div>
          <div className="form-grid">
            <div className="filter-field form-field--wide">
              <label htmlFor="profile-company-name">Company Name *</label>
              <input id="profile-company-name" value={form.companyName} onChange={(event) => updateField('companyName', event.target.value)} required />
            </div>
            <div className="filter-field"><label htmlFor="profile-contact">Primary Contact Name</label><input id="profile-contact" value={form.primaryContactName} onChange={(event) => updateField('primaryContactName', event.target.value)} /></div>
            <div className="filter-field"><label htmlFor="profile-email">Email</label><input id="profile-email" type="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} /></div>
            <div className="filter-field"><label htmlFor="profile-phone">Phone</label><input id="profile-phone" type="tel" value={form.phone} onChange={(event) => updateField('phone', event.target.value)} /></div>
            <div className="filter-field"><label htmlFor="profile-website">Website</label><input id="profile-website" value={form.website} onChange={(event) => updateField('website', event.target.value)} /></div>
            <div className="filter-field form-field--wide"><label htmlFor="profile-address">Address</label><input id="profile-address" value={form.address} onChange={(event) => updateField('address', event.target.value)} /></div>
            <div className="filter-field"><label htmlFor="profile-city">City</label><input id="profile-city" value={form.city} onChange={(event) => updateField('city', event.target.value)} /></div>
            <div className="filter-field"><label htmlFor="profile-state">State</label><input id="profile-state" value={form.state} onChange={(event) => updateField('state', event.target.value)} /></div>
            <div className="filter-field"><label htmlFor="profile-zip">ZIP</label><input id="profile-zip" value={form.zip} onChange={(event) => updateField('zip', event.target.value)} /></div>
          </div>
        </div>
        <div className="dealer-form__actions">
          <button className="button button--outline" type="button" disabled={isSaving || !profileDirty} onClick={() => setForm(dealerToForm(dealer))}>Cancel</button>
          <button className="button button--primary" type="submit" disabled={isSaving || !profileDirty}>
            {isSaving ? 'Saving...' : 'Save Company Details'}
          </button>
        </div>
      </section>

      <section className="content-card dealer-form" id="branding-studio">
        <div className="dealer-form__section-heading">
          <h2>Branding Studio</h2>
          <p>{canEditAppearance ? 'Logos, placement, colors, and typography for your Door Builder live on their own page so the preview can stay large.' : 'Logo branding lives on its own page. Color settings are available to dealer admins.'}</p>
        </div>
        <Link className="button button--primary" to="/company/branding">Customize Door Builder</Link>
      </section>

      </form>

      <section id="colors-and-typography">
        <div className="content-card dealer-form">
          <div className="dealer-form__section-heading">
            <h2>Colors and Typography</h2>
            <p>Brand colors, Door Builder colors, and typography are edited in the Branding Studio.</p>
          </div>
          <Link className="button button--outline" to="/company/branding?section=colors">Edit colors</Link>
        </div>
      </section>

      <section className="content-card visualizer-request-card" id="website-address">
        <div className="dealer-form__section-heading">
          <p className="eyebrow">Visualizer URL</p>
          <h2>Request New Visualizer URL</h2>
          <p><strong>Current URL:</strong> {getDealerVisualizerDisplayUrl(dealer.slug)}</p>
        </div>

        {dealer.slug_request_status === 'pending' ? (
          <div className="slug-request-state slug-request-state--pending">
            <strong>Pending Home Guard Approval</strong>
            <span>{getDealerVisualizerDisplayUrl(dealer.requested_slug ?? '')}</span>
            <p>Your live URL will not change until Home Guard approves this request.</p>
          </div>
        ) : (
          <form className="slug-request-form" onSubmit={handleSlugRequest}>
            {dealer.slug_request_status === 'rejected' && (
              <div className="slug-request-state slug-request-state--rejected">
                <strong>Previous request rejected</strong>
                <p>You may submit a different Visualizer URL for approval.</p>
              </div>
            )}
            <div className="filter-field">
              <label htmlFor="requested-slug">Requested slug</label>
              <input id="requested-slug" value={requestedSlug} onChange={(event) => setRequestedSlug(event.target.value)} onBlur={() => setRequestedSlug(normalizedRequestedSlug)} placeholder="new-dealer-url" required />
              <p className="slug-preview"><strong>Preview:</strong> {getDealerVisualizerDisplayUrl(normalizedRequestedSlug || '[requested-slug]')}</p>
            </div>
            <p className="visualizer-warning">Changing your Visualizer URL may affect existing website links, QR codes, and marketing materials.</p>
            <button className="button button--primary" type="submit" disabled={isRequestingSlug}>
              {isRequestingSlug ? 'Submitting...' : 'Submit for Approval'}
            </button>
          </form>
        )}
      </section>
    </div>
  )
}
