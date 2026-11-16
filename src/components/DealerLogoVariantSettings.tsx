import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { AdminDealer } from '../types/admin'
import {
  DOOR_BUILDER_HEADER_FALLBACK,
  DOOR_BUILDER_PAGE_BACKGROUND,
  DOOR_BUILDER_PRIMARY_FALLBACK,
  coloredLogoNeedsNeutralPlate,
  doorBuilderColor,
  isLightBrandColor,
  normalizeLogoVariant,
  resolveVariantLogoUrl,
  type DealerLogoVariant,
} from '../utils/dealerLogoVariants'

type VariantFields = {
  logo_header_variant: DealerLogoVariant | null
  logo_pages_variant: DealerLogoVariant | null
  logo_generated_light_usable: boolean | null
}

type Props = {
  dealer: AdminDealer
  onSave: (variants: { header: DealerLogoVariant | null; pages: DealerLogoVariant | null }) => Promise<AdminDealer>
  onUpdated: (dealer: AdminDealer) => void
  onHydrated?: (dealer: AdminDealer) => void
}

const choices: Array<{ value: DealerLogoVariant; label: string; detail: string }> = [
  { value: 'original', label: 'Original Colored Logo', detail: 'Use the primary colored logo.' },
  { value: 'light', label: 'White/Light Logo', detail: 'Use the custom light logo, or the generated light logo when it is readable.' },
]

function sameVariants(dealer: AdminDealer, header: DealerLogoVariant | null, pages: DealerLogoVariant | null) {
  return normalizeLogoVariant(dealer.logo_header_variant) === header
    && normalizeLogoVariant(dealer.logo_pages_variant) === pages
}

export function DealerLogoVariantSettings({ dealer, onSave, onUpdated, onHydrated }: Props) {
  const lightLogoUrl = resolveVariantLogoUrl(dealer, 'light')
  const [header, setHeader] = useState<DealerLogoVariant | null>(normalizeLogoVariant(dealer.logo_header_variant))
  const [pages, setPages] = useState<DealerLogoVariant | null>(normalizeLogoVariant(dealer.logo_pages_variant))
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const dealerRef = useRef(dealer)
  const dirtyRef = useRef(false)
  const onHydratedRef = useRef(onHydrated)
  dealerRef.current = dealer
  onHydratedRef.current = onHydrated

  useEffect(() => {
    dirtyRef.current = false
    setHeader(normalizeLogoVariant(dealerRef.current.logo_header_variant))
    setPages(normalizeLogoVariant(dealerRef.current.logo_pages_variant))
    let active = true
    void supabase
      .from('dealers')
      .select('logo_header_variant, logo_pages_variant, logo_generated_light_usable')
      .eq('id', dealer.id)
      .maybeSingle()
      .then(({ data, error: loadError }) => {
        if (!active || loadError || !data) return
        const fields: VariantFields = {
          logo_header_variant: normalizeLogoVariant(data.logo_header_variant),
          logo_pages_variant: normalizeLogoVariant(data.logo_pages_variant),
          logo_generated_light_usable: data.logo_generated_light_usable === true
            ? true
            : data.logo_generated_light_usable === false
              ? false
              : null,
        }
        const current = dealerRef.current
        const changed = normalizeLogoVariant(current.logo_header_variant) !== fields.logo_header_variant
          || normalizeLogoVariant(current.logo_pages_variant) !== fields.logo_pages_variant
          || (current.logo_generated_light_usable ?? null) !== fields.logo_generated_light_usable
        if (!dirtyRef.current) {
          setHeader(fields.logo_header_variant)
          setPages(fields.logo_pages_variant)
        }
        if (changed) onHydratedRef.current?.({ ...current, ...fields })
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [dealer.id])

  async function save() {
    setMessage('')
    setError('')
    setIsSaving(true)
    try {
      const updated = await onSave({ header, pages })
      onUpdated(updated)
      setMessage('Door Builder logo choices saved.')
    } catch (saveError) {
      console.error('Failed to save dealer logo variants.', saveError)
      setError('We could not save these logo choices. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  const headerBackground = doorBuilderColor(dealer.secondary_color, DOOR_BUILDER_HEADER_FALLBACK)
  const headerBorder = doorBuilderColor(dealer.primary_color, DOOR_BUILDER_PRIMARY_FALLBACK)

  return (
    <section className="content-card dealer-management-card logo-variant-settings" aria-labelledby="logo-variant-heading">
      <div className="dealer-form__section-heading">
        <p className="eyebrow">Door Builder logos</p>
        <h2 id="logo-variant-heading">Where each logo appears</h2>
        <p>Choose independently for the homepage header and for the other customer-facing Door Builder pages. Leaving a choice unset keeps that area on its current logo.</p>
      </div>
      <div className="logo-variant-settings__grid">
        <VariantChoice
          title="Homepage/Header Logo"
          name={`logo-header-${dealer.id}`}
          value={header}
          lightAvailable={Boolean(lightLogoUrl)}
          onChange={(value) => { dirtyRef.current = true; setHeader(value) }}
        />
        <VariantChoice
          title="Normal Pages Logo"
          name={`logo-pages-${dealer.id}`}
          value={pages}
          lightAvailable={Boolean(lightLogoUrl)}
          onChange={(value) => { dirtyRef.current = true; setPages(value) }}
        />
      </div>
      <div className="logo-variant-settings__previews">
        <LogoPreview
          title="Homepage/Header preview"
          caption="Header background is this dealer’s secondary color."
          background={headerBackground}
          borderColor={headerBorder}
          variant={header}
          logoUrl={resolveVariantLogoUrl(dealer, header)}
          contained={header === 'original' && coloredLogoNeedsNeutralPlate(headerBackground)}
          companyName={dealer.company_name}
        />
        <LogoPreview
          title="Normal pages preview"
          caption="Other Door Builder pages use the page background."
          background={DOOR_BUILDER_PAGE_BACKGROUND}
          variant={pages}
          logoUrl={resolveVariantLogoUrl(dealer, pages)}
          contained={pages === 'original' && coloredLogoNeedsNeutralPlate(DOOR_BUILDER_PAGE_BACKGROUND)}
          companyName={dealer.company_name}
        />
      </div>
      {message && <div className="portal-alert portal-alert--success" role="status">{message}</div>}
      {error && <div className="portal-alert" role="alert">{error}</div>}
      <div className="dealer-form__actions">
        <button className="button button--primary" type="button" disabled={isSaving || sameVariants(dealer, header, pages)} onClick={() => void save()}>
          {isSaving ? 'Saving...' : 'Save Logo Choices'}
        </button>
      </div>
    </section>
  )
}

function VariantChoice({
  title,
  name,
  value,
  lightAvailable,
  onChange,
}: {
  title: string
  name: string
  value: DealerLogoVariant | null
  lightAvailable: boolean
  onChange: (value: DealerLogoVariant) => void
}) {
  const hintId = `${name}-light-hint`
  return (
    <fieldset className="logo-variant-choice">
      <legend>{title}</legend>
      {choices.map((choice) => {
        const disabled = choice.value === 'light' && !lightAvailable
        return (
          <label key={choice.value} className={`logo-placement-option ${value === choice.value ? 'is-selected' : ''} ${disabled ? 'is-disabled' : ''}`}>
            <input
              type="radio"
              name={name}
              value={choice.value}
              checked={value === choice.value}
              disabled={disabled}
              aria-describedby={disabled ? hintId : undefined}
              onChange={() => onChange(choice.value)}
            />
            <span><strong>{choice.label}</strong><small>{choice.detail}</small></span>
          </label>
        )
      })}
      {!lightAvailable && (
        <p id={hintId} className="logo-variant-choice__hint">White/Light Logo is unavailable until you upload a custom light logo or generate a readable one.</p>
      )}
      {value === null && <p className="logo-variant-choice__hint">No explicit choice yet. The Door Builder keeps its current logo for this area.</p>}
    </fieldset>
  )
}

function LogoPreview({
  title,
  caption,
  background,
  borderColor,
  variant,
  logoUrl,
  contained,
  companyName,
}: {
  title: string
  caption: string
  background: string
  borderColor?: string
  variant: DealerLogoVariant | null
  logoUrl: string | null
  contained: boolean
  companyName: string
}) {
  const logo = logoUrl ? (
    <img src={logoUrl} alt={`${companyName} ${variant === 'light' ? 'white/light' : 'colored'} logo preview`} />
  ) : (
    <span style={{ color: isLightBrandColor(background) ? '#182124' : '#f7faff' }}>{variant === null ? 'Choose a logo to preview.' : 'No usable logo for this choice.'}</span>
  )
  return (
    <figure className="logo-variant-preview">
      <figcaption>
        <strong>{title}</strong>
        <small>{caption}</small>
      </figcaption>
      <div className={`logo-variant-preview__stage ${borderColor ? 'logo-variant-preview__stage--header' : ''}`} style={{ background, borderBottomColor: borderColor }}>
        {contained && logoUrl ? <div className="logo-variant-preview__plate">{logo}</div> : logo}
      </div>
    </figure>
  )
}
