import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import type { DealerFormValues } from '../types/admin'
import { getDealerVisualizerDisplayUrl } from '../config/visualizer'
import { normalizeDealerSlug } from '../utils/dealerSlug'

type DealerFormProps = {
  initialValues: DealerFormValues
  cancelTo: string
  error: string
  isSubmitting: boolean
  submitLabel: string
  submittingLabel: string
  onSubmit: (values: DealerFormValues, normalizedSlug: string) => Promise<void>
}

export function DealerForm({
  initialValues,
  cancelTo,
  error,
  isSubmitting,
  submitLabel,
  submittingLabel,
  onSubmit,
}: DealerFormProps) {
  const [form, setForm] = useState(initialValues)
  const normalizedSlug = normalizeDealerSlug(form.slug)

  function updateField(field: keyof DealerFormValues, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void onSubmit(form, normalizedSlug)
  }

  return (
    <form className="content-card dealer-form" onSubmit={handleSubmit}>
      <div className="dealer-form__section">
        <div className="dealer-form__section-heading">
          <h2>Company details</h2>
          <p>Dealer users and invitations are managed separately.</p>
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
              {getDealerVisualizerDisplayUrl(normalizedSlug || '[slug]')}
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
        <Link className="button button--outline" to={cancelTo}>Cancel</Link>
        <button className="button button--primary" type="submit" disabled={isSubmitting}>
          {isSubmitting ? submittingLabel : submitLabel}
        </button>
      </div>
    </form>
  )
}
