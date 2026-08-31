import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { normalizeDealerSlug } from '../utils/dealerSlug'

type DealerFormState = {
  companyName: string
  slug: string
  primaryContactName: string
  email: string
  phone: string
  website: string
  address: string
  city: string
  state: string
  zip: string
  primaryColor: string
  secondaryColor: string
}

type AddDealerPageProps = {
  onCreated: (companyName: string) => void
}

const initialForm: DealerFormState = {
  companyName: '',
  slug: '',
  primaryContactName: '',
  email: '',
  phone: '',
  website: '',
  address: '',
  city: '',
  state: '',
  zip: '',
  primaryColor: '',
  secondaryColor: '',
}

function optionalValue(value: string) {
  return value.trim() || null
}

export function AddDealerPage({ onCreated }: AddDealerPageProps) {
  const [form, setForm] = useState(initialForm)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const navigate = useNavigate()
  const normalizedSlug = normalizeDealerSlug(form.slug)

  function updateField(field: keyof DealerFormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    if (!normalizedSlug) {
      setError('Enter a dealer slug using letters or numbers.')
      return
    }

    setIsSubmitting(true)

    const { error: insertError } = await supabase.from('dealers').insert({
      company_name: form.companyName.trim(),
      slug: normalizedSlug,
      primary_contact_name: optionalValue(form.primaryContactName),
      email: optionalValue(form.email),
      phone: optionalValue(form.phone),
      website: optionalValue(form.website),
      address: optionalValue(form.address),
      city: optionalValue(form.city),
      state: optionalValue(form.state),
      zip: optionalValue(form.zip),
      primary_color: optionalValue(form.primaryColor),
      secondary_color: optionalValue(form.secondaryColor),
      is_active: true,
    })

    if (insertError) {
      console.error('Failed to create dealer.', insertError)
      setError(
        insertError.code === '23505'
          ? 'This dealer URL is already in use. Please choose another slug.'
          : 'We could not add this dealer. Please review the details and try again.',
      )
      setIsSubmitting(false)
      return
    }

    onCreated(form.companyName.trim())
    navigate('/admin/dealers')
  }

  return (
    <div className="page-content">
      <header className="page-header admin-page-header">
        <p className="eyebrow">Home Guard</p>
        <h1>Add Dealer</h1>
        <p>Create a company record for the Home Guard dealer network.</p>
      </header>

      <form className="content-card dealer-form" onSubmit={handleSubmit}>
        <div className="dealer-form__section">
          <div className="dealer-form__section-heading">
            <h2>Company details</h2>
            <p>Dealer users and invitations will be added separately.</p>
          </div>

          <div className="form-grid">
            <div className="filter-field form-field--wide">
              <label htmlFor="company-name">Company Name *</label>
              <input
                id="company-name"
                value={form.companyName}
                onChange={(event) => updateField('companyName', event.target.value)}
                required
              />
            </div>
            <div className="filter-field form-field--wide">
              <label htmlFor="dealer-slug">Dealer Slug *</label>
              <input
                id="dealer-slug"
                value={form.slug}
                onChange={(event) => updateField('slug', event.target.value)}
                onBlur={() => updateField('slug', normalizedSlug)}
                placeholder="beewindow"
                required
              />
              <p className="slug-preview">
                <strong>Visualizer URL:</strong>{' '}
                homeguardvisualizer.com/{normalizedSlug || '[slug]'}
              </p>
            </div>
            <div className="filter-field">
              <label htmlFor="primary-contact">Primary Contact Name</label>
              <input
                id="primary-contact"
                value={form.primaryContactName}
                onChange={(event) => updateField('primaryContactName', event.target.value)}
              />
            </div>
            <div className="filter-field">
              <label htmlFor="dealer-email">Email</label>
              <input
                id="dealer-email"
                type="email"
                value={form.email}
                onChange={(event) => updateField('email', event.target.value)}
              />
            </div>
            <div className="filter-field">
              <label htmlFor="dealer-phone">Phone</label>
              <input
                id="dealer-phone"
                type="tel"
                value={form.phone}
                onChange={(event) => updateField('phone', event.target.value)}
              />
            </div>
            <div className="filter-field">
              <label htmlFor="dealer-website">Website</label>
              <input
                id="dealer-website"
                type="url"
                value={form.website}
                onChange={(event) => updateField('website', event.target.value)}
                placeholder="https://"
              />
            </div>
            <div className="filter-field form-field--wide">
              <label htmlFor="dealer-address">Address</label>
              <input
                id="dealer-address"
                value={form.address}
                onChange={(event) => updateField('address', event.target.value)}
              />
            </div>
            <div className="filter-field">
              <label htmlFor="dealer-city">City</label>
              <input
                id="dealer-city"
                value={form.city}
                onChange={(event) => updateField('city', event.target.value)}
              />
            </div>
            <div className="form-grid form-grid--location form-field--wide">
              <div className="filter-field">
                <label htmlFor="dealer-state">State</label>
                <input
                  id="dealer-state"
                  value={form.state}
                  onChange={(event) => updateField('state', event.target.value)}
                />
              </div>
              <div className="filter-field">
                <label htmlFor="dealer-zip">ZIP</label>
                <input
                  id="dealer-zip"
                  value={form.zip}
                  onChange={(event) => updateField('zip', event.target.value)}
                />
              </div>
            </div>
            <div className="filter-field">
              <label htmlFor="primary-color">Primary Brand Color</label>
              <input
                id="primary-color"
                value={form.primaryColor}
                onChange={(event) => updateField('primaryColor', event.target.value)}
                placeholder="#0d666c"
              />
            </div>
            <div className="filter-field">
              <label htmlFor="secondary-color">Secondary Brand Color</label>
              <input
                id="secondary-color"
                value={form.secondaryColor}
                onChange={(event) => updateField('secondaryColor', event.target.value)}
                placeholder="#f8d30e"
              />
            </div>
          </div>
        </div>

        {error && <div className="dealer-form__error" role="alert">{error}</div>}

        <div className="dealer-form__actions">
          <Link className="button button--outline" to="/admin/dealers">Cancel</Link>
          <button className="button button--primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Adding Dealer...' : 'Add Dealer'}
          </button>
        </div>
      </form>
    </div>
  )
}
