import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { AdminDealer } from '../types/admin'
import {
  DOOR_BUILDER_HEADER_FALLBACK,
  DOOR_BUILDER_PRIMARY_FALLBACK,
  doorBuilderColor,
  headerContrastPlate,
  isLightBrandColor,
  normalizeLogoVariant,
  resolveBlackLogoUrl,
  resolveDisplayedLogo,
  resolveVariantLogoUrl,
  resolveWhiteLogoUrl,
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
  { value: 'original', label: 'Original', detail: 'Use the active colored logo.' },
  { value: 'black', label: 'Black', detail: 'Use the custom black logo, or the generated black logo when it is readable.' },
  { value: 'white', label: 'White', detail: 'Use the custom white logo, or the generated white logo when it is readable.' },
]

function sameVariants(dealer: AdminDealer, header: DealerLogoVariant | null, pages: DealerLogoVariant | null) {
  return normalizeLogoVariant(dealer.logo_header_variant) === header
    && normalizeLogoVariant(dealer.logo_pages_variant) === pages
}

export function DealerLogoVariantSettings({ dealer, onSave, onUpdated, onHydrated }: Props) {
  const whiteLogoUrl = resolveWhiteLogoUrl(dealer)
  const blackLogoUrl = resolveBlackLogoUrl(dealer)
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
    void (async () => {
      try {
        const { data, error: loadError } = await supabase
          .from('dealers')
          .select('logo_header_variant, logo_pages_variant, logo_generated_light_usable')
          .eq('id', dealer.id)
          .maybeSingle()
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
      } catch {
        // The columns are absent until the migration is applied.
      }
    })()
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
  const available = { original: Boolean(dealer.logo_url), black: Boolean(blackLogoUrl), white: Boolean(whiteLogoUrl) }

  return (
    <section className="content-card dealer-management-card logo-variant-settings" aria-labelledby="logo-variant-heading">
      <div className="dealer-form__section-heading">
        <p className="eyebrow">Door Builder logos</p>
        <h2 id="logo-variant-heading">Where each logo appears</h2>
        <p>Choose independently for the homepage and for the other customer-facing pages. Leaving a choice unset keeps that area on its current logo.</p>
      </div>
      <div className="logo-variant-settings__grid">
        <VariantChoice
          title="Homepage Header Logo"
          name={`logo-header-${dealer.id}`}
          value={header}
          available={available}
          onChange={(value) => { dirtyRef.current = true; setHeader(value) }}
        />
        <VariantChoice
          title="Normal Pages Logo"
          name={`logo-pages-${dealer.id}`}
          value={pages}
          available={available}
          onChange={(value) => { dirtyRef.current = true; setPages(value) }}
        />
      </div>
      <div className="logo-variant-settings__previews">
        <LogoPreview
          title="Homepage header preview"
          caption="The homepage header uses this dealer’s secondary color."
          background={headerBackground}
          borderColor={headerBorder}
          variant={header}
          logoUrl={resolveDisplayedLogo(dealer, header)}
          fallback={Boolean(header && !resolveVariantLogoUrl(dealer, header))}
          plate={headerContrastPlate(dealer, header)}
          companyName={dealer.company_name}
        />
        <LogoPreview
          title="Normal pages preview"
          caption="Other pages show the logo in the page header, on the same secondary color."
          background={headerBackground}
          borderColor={headerBorder}
          variant={pages}
          logoUrl={resolveDisplayedLogo(dealer, pages)}
          fallback={Boolean(pages && !resolveVariantLogoUrl(dealer, pages))}
          plate={headerContrastPlate(dealer, pages)}
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
  available,
  onChange,
}: {
  title: string
  name: string
  value: DealerLogoVariant | null
  available: Record<DealerLogoVariant, boolean>
  onChange: (value: DealerLogoVariant) => void
}) {
  const hintId = `${name}-unavailable`
  const unavailable = choices.filter((choice) => choice.value !== 'original' && !available[choice.value])
  return (
    <fieldset className="logo-variant-choice">
      <legend>{title}</legend>
      {choices.map((choice) => {
        const disabled = !available[choice.value]
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
      {unavailable.length > 0 && (
        <p id={hintId} className="logo-variant-choice__hint">
          {unavailable.map((choice) => choice.label).join(' and ')} {unavailable.length === 1 ? 'is' : 'are'} unavailable until you upload a custom file or generate a readable one. An unavailable saved choice falls back to Original.
        </p>
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
  fallback,
  plate,
  companyName,
}: {
  title: string
  caption: string
  background: string
  borderColor?: string
  variant: DealerLogoVariant | null
  logoUrl: string | null
  fallback: boolean
  plate: 'light' | 'dark' | null
  companyName: string
}) {
  const logo = logoUrl ? (
    <img src={logoUrl} alt={`${companyName} ${variant ?? 'current'} logo preview`} />
  ) : (
    <span style={{ color: isLightBrandColor(background) ? '#182124' : '#f7faff' }}>{variant === null ? 'Choose a logo to preview.' : 'No usable logo for this choice.'}</span>
  )
  return (
    <figure className="logo-variant-preview">
      <figcaption>
        <strong>{title}</strong>
        <small>{caption}{fallback ? ' This choice is unavailable, so the original logo is shown.' : ''}</small>
      </figcaption>
      <div className={`logo-variant-preview__stage ${borderColor ? 'logo-variant-preview__stage--header' : ''}`} style={{ background, borderBottomColor: borderColor }}>
        {plate && logoUrl ? <div className={`logo-variant-preview__plate logo-variant-preview__plate--${plate}`}>{logo}</div> : logo}
      </div>
    </figure>
  )
}
