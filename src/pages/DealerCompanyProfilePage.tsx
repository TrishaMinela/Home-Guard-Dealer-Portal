import { useState, type ChangeEvent, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import type { DealerAccount } from '../types/account'
import type { DealerFormValues } from '../types/admin'
import { normalizeDealerSlug } from '../utils/dealerSlug'
import { getDealerVisualizerDisplayUrl } from '../config/visualizer'

type DealerCompanyProfilePageProps = {
  dealer: DealerAccount
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

const logoExtensions: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

export function DealerCompanyProfilePage({
  dealer,
  onDealerUpdated,
}: DealerCompanyProfilePageProps) {
  const [form, setForm] = useState(() => dealerToForm(dealer))
  const [requestedSlug, setRequestedSlug] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState<'primary' | 'light' | null>(null)
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

  async function handleLogoUpload(
    event: ChangeEvent<HTMLInputElement>,
    logoType: 'primary' | 'light',
  ) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setMessage('')
    setError('')

    const extension = logoExtensions[file.type]
    if (!extension) {
      setError('Choose a PNG, JPEG, or WebP logo.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Dealer logos must be 5 MB or smaller.')
      return
    }

    setUploadingLogo(logoType)
    const filename = logoType === 'primary' ? 'logo' : 'logo-light'
    const objectPath = `${dealer.id}/${filename}.${extension}`
    const { error: uploadError } = await supabase.storage
      .from('dealer-logos')
      .upload(objectPath, file, { contentType: file.type, upsert: true })

    if (uploadError) {
      console.error('Failed to upload dealer logo.', uploadError)
      setError('We could not upload your logo. Please try again.')
      setUploadingLogo(null)
      return
    }

    const { data: publicUrlData } = supabase.storage
      .from('dealer-logos')
      .getPublicUrl(objectPath)
    const versionedPublicUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`
    const { data, error: profileError } = await updateProfile(
      dealerToForm(dealer),
      logoType === 'primary' ? versionedPublicUrl : dealer.logo_url,
      logoType === 'light' ? versionedPublicUrl : dealer.logo_light_url,
    )

    if (profileError) {
      console.error('Logo uploaded but profile URL could not be saved.', profileError)
      setError('The logo uploaded, but we could not save it to your profile.')
      setUploadingLogo(null)
      return
    }

    onDealerUpdated(data as DealerAccount)
    setMessage(`${logoType === 'primary' ? 'Primary' : 'Light'} logo updated successfully.`)
    setUploadingLogo(null)
  }

  async function handleSlugRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')
    setError('')

    if (!normalizedRequestedSlug) {
      setError('Enter a valid Visualizer URL slug.')
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
            <p>PNG, JPEG, or WebP. Maximum file size 5 MB.</p>
          </div>
          <label className={`button button--outline upload-button ${uploadingLogo ? 'is-disabled' : ''}`}>
            {uploadingLogo === 'primary' ? 'Uploading...' : 'Upload Primary Logo'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={uploadingLogo !== null}
              onChange={(event) => void handleLogoUpload(event, 'primary')}
            />
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
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={uploadingLogo !== null}
              onChange={(event) => void handleLogoUpload(event, 'light')}
            />
          </label>
        </section>
      </div>

      <form className="content-card dealer-form" onSubmit={handleSave}>
        <div className="dealer-form__section">
          <div className="dealer-form__section-heading">
            <h2>Company details</h2>
            <p>Changes apply only to your own dealer company profile.</p>
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
            <div className="filter-field"><label htmlFor="profile-primary-color">Primary Brand Color</label><input id="profile-primary-color" value={form.primaryColor} onChange={(event) => updateField('primaryColor', event.target.value)} placeholder="#0d666c" /></div>
            <div className="filter-field"><label htmlFor="profile-secondary-color">Secondary Brand Color</label><input id="profile-secondary-color" value={form.secondaryColor} onChange={(event) => updateField('secondaryColor', event.target.value)} placeholder="#f8d30e" /></div>
          </div>
        </div>
        <div className="dealer-form__actions">
          <button className="button button--primary" type="submit" disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>

      <section className="content-card visualizer-request-card">
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
