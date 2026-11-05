import { useState } from 'react'
import type { AdminDealer } from '../types/admin'

export type DealerLogoPlacement = 'header' | 'hero'

type Props = {
  dealer: AdminDealer
  onSave: (placement: DealerLogoPlacement) => Promise<AdminDealer>
  onUpdated: (dealer: AdminDealer) => void
}

export function DealerLogoPlacementSettings({ dealer, onSave, onUpdated }: Props) {
  const current = dealer.logo_placement === 'header' ? 'header' : 'hero'
  const [placement, setPlacement] = useState<DealerLogoPlacement>(current)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function save() {
    setMessage('')
    setError('')
    setIsSaving(true)
    try {
      const updated = await onSave(placement)
      onUpdated(updated)
      setMessage('Dealer logo placement saved.')
    } catch (saveError) {
      console.error('Failed to save dealer logo placement.', saveError)
      setError('We could not save the logo placement. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="content-card dealer-management-card logo-placement-settings">
      <div className="dealer-form__section-heading">
        <p className="eyebrow">Dealer branding</p>
        <h2>Dealer Logo Placement</h2>
        <p>Choose where the dealer logo appears on this dealer’s public Door Builder homepage.</p>
      </div>
      <div className="logo-placement-options" role="radiogroup" aria-label="Dealer logo placement">
        <label className={`logo-placement-option ${placement === 'header' ? 'is-selected' : ''}`}>
          <input type="radio" name={`logo-placement-${dealer.id}`} value="header" checked={placement === 'header'} onChange={() => setPlacement('header')} />
          <span><strong>Header</strong><small>Show the dealer logo in the top navigation/header.</small></span>
        </label>
        <label className={`logo-placement-option ${placement === 'hero' ? 'is-selected' : ''}`}>
          <input type="radio" name={`logo-placement-${dealer.id}`} value="hero" checked={placement === 'hero'} onChange={() => setPlacement('hero')} />
          <span><strong>Hero</strong><small>Show the dealer logo above the main Door Builder headline.</small></span>
        </label>
      </div>
      <div className={`logo-placement-preview logo-placement-preview--${placement}`} aria-label={`${placement} placement preview`}>
        <span className="logo-placement-preview__logo">Dealer logo</span>
        {placement === 'header' ? <span>Visit Our Website</span> : <strong>Build a Door Made for Your Home.</strong>}
      </div>
      {message && <div className="portal-alert portal-alert--success" role="status">{message}</div>}
      {error && <div className="portal-alert" role="alert">{error}</div>}
      <div className="dealer-form__actions">
        <button className="button button--primary" type="button" disabled={isSaving || placement === current} onClick={() => void save()}>
          {isSaving ? 'Saving...' : 'Save Logo Placement'}
        </button>
      </div>
    </section>
  )
}
