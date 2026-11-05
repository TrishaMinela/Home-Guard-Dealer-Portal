import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { DealerForm } from '../components/DealerForm'
import { supabase } from '../lib/supabase'
import type { AdminDealer, DealerFormValues } from '../types/admin'
import { isReservedDealerSlug } from '../utils/dealerSlug'
import { DealerTypographySettings } from '../components/DealerTypographySettings'
import { typographyPayload, type DealerTypographyValues } from '../utils/dealerTypography'

type EditDealerPageProps = {
  dealers: AdminDealer[]
  isLoading: boolean
  error: string
  onSaved: (dealer: AdminDealer) => void
}

function optionalValue(value: string) {
  return value.trim() || null
}

function dealerToForm(dealer: AdminDealer): DealerFormValues {
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

export function EditDealerPage({ dealers, isLoading, error, onSaved }: EditDealerPageProps) {
  const { dealerId } = useParams()
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activeSection, setActiveSection] = useState<'company' | 'branding' | 'design'>(() => {
    if (window.location.hash === '#branding') return 'branding'
    if (window.location.hash === '#design') return 'design'
    return 'company'
  })
  const [brandColors, setBrandColors] = useState<{ primary: string; secondary: string } | null>(null)
  const [brandingMessage, setBrandingMessage] = useState('')
  const [brandingError, setBrandingError] = useState('')
  const [isSavingBranding, setIsSavingBranding] = useState(false)
  const navigate = useNavigate()
  const dealer = dealers.find((item) => item.id === dealerId)

  const selectedBrandColors = brandColors ?? { primary: dealer?.primary_color ?? '', secondary: dealer?.secondary_color ?? '' }

  if (isLoading) {
    return <div className="page-content"><div className="data-state">Loading dealer...</div></div>
  }

  if (error) {
    return <div className="page-content"><div className="portal-alert" role="alert">{error}</div></div>
  }

  if (!dealer) {
    return <div className="page-content"><div className="data-state">Dealer not found.</div></div>
  }

  async function handleSubmit(values: DealerFormValues, normalizedSlug: string) {
    if (!dealer) return

    setFormError('')
    if (!normalizedSlug) {
      setFormError('Enter a dealer slug using letters or numbers.')
      return
    }
    if (isReservedDealerSlug(normalizedSlug)) {
      setFormError('This dealer slug is reserved for the Door Builder. Please choose another URL.')
      return
    }

    setIsSubmitting(true)
    const { data, error: updateError } = await supabase
      .from('dealers')
      .update({
        company_name: values.companyName.trim(),
        slug: normalizedSlug,
        primary_contact_name: optionalValue(values.primaryContactName),
        email: optionalValue(values.email),
        phone: optionalValue(values.phone),
        website: optionalValue(values.website),
        address: optionalValue(values.address),
        city: optionalValue(values.city),
        state: optionalValue(values.state),
        zip: optionalValue(values.zip),
      })
      .eq('id', dealer.id)
      .select('id, company_name, slug, logo_url, logo_light_url, logo_generated_light_url, logo_placement, primary_contact_name, email, phone, website, address, city, state, zip, primary_color, secondary_color, is_active, created_at, requested_slug, slug_request_status, slug_requested_at, heading_font_family, heading_font_weight, heading_font_size, body_font_family, body_font_weight, body_font_size, custom_heading_font_url, custom_heading_font_name, custom_heading_font_weight, custom_body_font_url, custom_body_font_name, custom_body_font_weight')
      .single()

    if (updateError) {
      console.error('Failed to update dealer.', updateError)
      setFormError(
        updateError.code === '23505'
          ? 'This dealer URL is already in use. Please choose another slug.'
          : 'We could not save this dealer. Please review the details and try again.',
      )
      setIsSubmitting(false)
      return
    }

    onSaved(data)
    navigate(`/admin/dealers/${dealer.id}`)
  }

  async function saveBranding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!dealer) return
    setBrandingMessage('')
    setBrandingError('')
    setIsSavingBranding(true)
    const { data, error: updateError } = await supabase.from('dealers').update({
      primary_color: optionalValue(selectedBrandColors.primary),
      secondary_color: optionalValue(selectedBrandColors.secondary),
    }).eq('id', dealer.id).select('*').single()
    setIsSavingBranding(false)
    if (updateError) {
      console.error('Failed to update dealer branding.', updateError)
      setBrandingError('We could not save this dealer’s branding. Please try again.')
      return
    }
    onSaved(data as AdminDealer)
    setBrandColors({ primary: data.primary_color ?? '', secondary: data.secondary_color ?? '' })
    setBrandingMessage('Branding saved successfully.')
  }

  async function saveTypography(values: DealerTypographyValues) {
    if(!dealer) throw new Error('Dealer not found.')
    const {data,error:saveError}=await supabase.from('dealers').update(typographyPayload(values)).eq('id',dealer.id).select('*').single()
    if(saveError) throw saveError
    onSaved(data as AdminDealer)
    return data as AdminDealer
  }

  return (
    <div className="page-content">
      <header className="page-header admin-page-header">
        <p className="eyebrow">Home Guard</p>
        <h1>Edit {dealer.company_name}</h1>
        <p>Manage company information, customer-facing branding, typography, and dealer access separately.</p>
      </header>

      <nav className="dealer-settings-nav" aria-label="Dealer settings sections">
        <button className={activeSection === 'company' ? 'is-active' : ''} type="button" onClick={() => setActiveSection('company')}>Company Details</button>
        <button className={activeSection === 'branding' ? 'is-active' : ''} type="button" onClick={() => setActiveSection('branding')}>Branding</button>
        <button className={activeSection === 'design' ? 'is-active' : ''} type="button" onClick={() => setActiveSection('design')}>Typography &amp; Design</button>
        <Link to={`/admin/dealers/${dealer.id}#dealer-users`}>Dealer Users / Access</Link>
      </nav>

      {activeSection === 'company' && <DealerForm
        initialValues={dealerToForm(dealer)}
        cancelTo={`/admin/dealers/${dealer.id}`}
        error={formError}
        isSubmitting={isSubmitting}
        submitLabel="Save Company Details"
        submittingLabel="Saving..."
        onSubmit={handleSubmit}
      />}

      {activeSection === 'branding' && <form className="content-card dealer-form" onSubmit={saveBranding}>
        <div className="dealer-form__section-heading"><p className="eyebrow">Branding</p><h2>Customer-facing Door Builder</h2><p>These settings control the appearance of this dealer’s branded Door Builder. Logo uploads are managed on the dealer overview.</p></div>
        {brandingMessage && <div className="portal-alert portal-alert--success" role="status">{brandingMessage}</div>}
        {brandingError && <div className="portal-alert" role="alert">{brandingError}</div>}
        <div className="form-grid dealer-brand-color-grid">
          <div className="filter-field"><label htmlFor="primary-color">Primary Brand Color</label><div className="color-field"><input aria-label="Choose primary brand color" type="color" value={selectedBrandColors.primary || '#0d666c'} onChange={(event) => setBrandColors({ ...selectedBrandColors, primary: event.target.value })} /><input id="primary-color" value={selectedBrandColors.primary} onChange={(event) => setBrandColors({ ...selectedBrandColors, primary: event.target.value })} placeholder="#0d666c" /></div></div>
          <div className="filter-field"><label htmlFor="secondary-color">Secondary Brand Color</label><div className="color-field"><input aria-label="Choose secondary brand color" type="color" value={selectedBrandColors.secondary || '#f8d30e'} onChange={(event) => setBrandColors({ ...selectedBrandColors, secondary: event.target.value })} /><input id="secondary-color" value={selectedBrandColors.secondary} onChange={(event) => setBrandColors({ ...selectedBrandColors, secondary: event.target.value })} placeholder="#f8d30e" /></div></div>
        </div>
        <div className="dealer-form__actions"><Link className="button button--outline" to={`/admin/dealers/${dealer.id}#branding`}>Manage Logos</Link><button className="button button--primary" type="submit" disabled={isSavingBranding}>{isSavingBranding ? 'Saving...' : 'Save Branding'}</button></div>
      </form>}

      {activeSection === 'design' && <DealerTypographySettings dealer={dealer} onSave={saveTypography} onUpdated={onSaved}/>}
    </div>
  )
}
