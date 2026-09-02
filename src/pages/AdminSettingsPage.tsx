import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import type { HomeGuardSettings, HomeGuardSettingsForm } from '../types/settings'

const settingsColumns = 'id, company_name, logo_url, logo_light_url, email, phone, website, address, city, state, zip, primary_color, secondary_color, created_at, updated_at'

function toForm(settings: HomeGuardSettings): HomeGuardSettingsForm {
  return {
    companyName: settings.company_name,
    email: settings.email ?? '',
    phone: settings.phone ?? '',
    website: settings.website ?? '',
    address: settings.address ?? '',
    city: settings.city ?? '',
    state: settings.state ?? '',
    zip: settings.zip ?? '',
    primaryColor: settings.primary_color ?? '',
    secondaryColor: settings.secondary_color ?? '',
  }
}

function optionalValue(value: string) {
  return value.trim() || null
}

function colorPickerValue(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim() : '#0d666c'
}

export function AdminSettingsPage() {
  const [settings, setSettings] = useState<HomeGuardSettings | null>(null)
  const [form, setForm] = useState<HomeGuardSettingsForm | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let isCurrent = true

    async function loadSettings() {
      const { data, error: loadError } = await supabase
        .from('home_guard_settings')
        .select(settingsColumns)
        .limit(1)
        .single()

      if (!isCurrent) return

      if (loadError) {
        console.error('Failed to load Home Guard settings.', loadError)
        setError('We could not load Home Guard settings. Please try again later.')
      } else {
        const loadedSettings = data as HomeGuardSettings
        setSettings(loadedSettings)
        setForm(toForm(loadedSettings))
      }
      setIsLoading(false)
    }

    void loadSettings()
    return () => { isCurrent = false }
  }, [])

  function updateField(field: keyof HomeGuardSettingsForm, value: string) {
    setForm((current) => current ? { ...current, [field]: value } : current)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!settings || !form) return

    setError('')
    setMessage('')
    setIsSaving(true)

    const { data, error: updateError } = await supabase
      .from('home_guard_settings')
      .update({
        company_name: form.companyName.trim(),
        email: optionalValue(form.email),
        phone: optionalValue(form.phone),
        website: optionalValue(form.website),
        address: optionalValue(form.address),
        city: optionalValue(form.city),
        state: optionalValue(form.state),
        zip: optionalValue(form.zip),
        primary_color: optionalValue(form.primaryColor),
        secondary_color: optionalValue(form.secondaryColor),
        updated_at: new Date().toISOString(),
      })
      .eq('id', settings.id)
      .select(settingsColumns)
      .single()

    if (updateError) {
      console.error('Failed to update Home Guard settings.', updateError)
      setError('We could not save Home Guard settings. Please review the details and try again.')
    } else {
      const updatedSettings = data as HomeGuardSettings
      setSettings(updatedSettings)
      setForm(toForm(updatedSettings))
      setMessage('Home Guard settings saved successfully.')
    }
    setIsSaving(false)
  }

  if (isLoading) {
    return <div className="page-content"><div className="data-state">Loading Home Guard settings...</div></div>
  }

  if (!form || !settings) {
    return <div className="page-content"><div className="portal-alert" role="alert">{error || 'Home Guard settings are unavailable.'}</div></div>
  }

  return (
    <div className="page-content">
      <header className="page-header admin-page-header">
        <p className="eyebrow">Home Guard Industries</p>
        <h1>Home Guard Settings</h1>
        <p>Manage the global company profile and branding used across Home Guard products.</p>
      </header>

      {message && <div className="portal-alert portal-alert--success" role="status">{message}</div>}
      {error && <div className="portal-alert" role="alert">{error}</div>}

      <form className="settings-form" onSubmit={handleSubmit}>
        <section className="content-card settings-card">
          <div className="content-card__header"><p className="eyebrow">Company Information</p><h2>Company Information</h2></div>
          <div className="form-grid settings-card__body">
            <div className="filter-field form-field--wide"><label htmlFor="hg-company-name">Company Name *</label><input id="hg-company-name" value={form.companyName} onChange={(event) => updateField('companyName', event.target.value)} required /></div>
            <div className="filter-field"><label htmlFor="hg-email">Email</label><input id="hg-email" type="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} /></div>
            <div className="filter-field"><label htmlFor="hg-phone">Phone</label><input id="hg-phone" type="tel" value={form.phone} onChange={(event) => updateField('phone', event.target.value)} /></div>
            <div className="filter-field"><label htmlFor="hg-website">Website</label><input id="hg-website" value={form.website} onChange={(event) => updateField('website', event.target.value)} /></div>
            <div className="filter-field form-field--wide"><label htmlFor="hg-address">Address</label><input id="hg-address" value={form.address} onChange={(event) => updateField('address', event.target.value)} /></div>
            <div className="filter-field"><label htmlFor="hg-city">City</label><input id="hg-city" value={form.city} onChange={(event) => updateField('city', event.target.value)} /></div>
            <div className="filter-field"><label htmlFor="hg-state">State</label><input id="hg-state" value={form.state} onChange={(event) => updateField('state', event.target.value)} /></div>
            <div className="filter-field"><label htmlFor="hg-zip">ZIP</label><input id="hg-zip" value={form.zip} onChange={(event) => updateField('zip', event.target.value)} /></div>
          </div>
        </section>

        <section className="content-card settings-card">
          <div className="content-card__header"><p className="eyebrow">Branding</p><h2>Brand Colors</h2></div>
          <div className="form-grid settings-card__body">
            <div className="filter-field"><label htmlFor="hg-primary-color">Primary Brand Color</label><div className="color-field"><input aria-label="Choose primary brand color" type="color" value={colorPickerValue(form.primaryColor)} onChange={(event) => updateField('primaryColor', event.target.value)} /><input id="hg-primary-color" value={form.primaryColor} placeholder="#0d666c" onChange={(event) => updateField('primaryColor', event.target.value)} /></div></div>
            <div className="filter-field"><label htmlFor="hg-secondary-color">Secondary Brand Color</label><div className="color-field"><input aria-label="Choose secondary brand color" type="color" value={colorPickerValue(form.secondaryColor)} onChange={(event) => updateField('secondaryColor', event.target.value)} /><input id="hg-secondary-color" value={form.secondaryColor} placeholder="#f8d30e" onChange={(event) => updateField('secondaryColor', event.target.value)} /></div></div>
          </div>
        </section>

        <section className="content-card settings-card">
          <div className="content-card__header"><p className="eyebrow">Logos</p><h2>Home Guard Logos</h2></div>
          <div className="settings-logo-grid settings-card__body">
            <div className="settings-logo-item"><div className="profile-logo-preview">{settings.logo_url ? <img src={settings.logo_url} alt="Home Guard primary logo" /> : <span>HG</span>}</div><div><h3>Primary Logo</h3><p>Standard Home Guard logo for use on light or white backgrounds.</p></div></div>
            <div className="settings-logo-item"><div className="profile-logo-preview profile-logo-preview--dark">{settings.logo_light_url ? <img src={settings.logo_light_url} alt="Home Guard light logo" /> : <span>HG</span>}</div><div><h3>Light Logo</h3><p>White or light-colored Home Guard logo for use on dark backgrounds.</p></div></div>
          </div>
        </section>

        <div className="settings-form__actions"><button className="button button--primary" type="submit" disabled={isSaving}>{isSaving ? 'Saving...' : 'Save Changes'}</button></div>
      </form>
    </div>
  )
}
