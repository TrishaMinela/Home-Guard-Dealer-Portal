import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { AdminDealer } from '../types/admin'
import { inspectLogoAgainstSurface } from '../utils/readLogoForRemoval'
import type { LogoInkSample } from '../utils/logoBackground'
import {
  DOOR_BUILDER_PRIMARY_FALLBACK,
  doorBuilderColor,
  doorBuilderHeaderSurface,
  doorBuilderPagesSurface,
  isLightBrandColor,
  logoVariantOffers,
  normalizeLogoVariant,
  resolveBlackLogoUrl,
  resolveDisplayedLogo,
  resolveVariantLogoUrl,
  resolveWhiteLogoUrl,
  type DealerLogoVariant,
  type LogoInkStatus,
  type LogoVariantOffer,
} from '../utils/dealerLogoVariants'

type VariantFields = {
  logo_url: string | null
  logo_source_url: string | null
  logo_light_url: string | null
  logo_generated_light_url: string | null
  logo_generated_light_usable: boolean | null
  logo_black_url: string | null
  logo_generated_black_url: string | null
  logo_generated_black_usable: boolean | null
  logo_header_variant: DealerLogoVariant | null
  logo_pages_variant: DealerLogoVariant | null
}

type Props = {
  dealer: AdminDealer
  onSave: (variants: { header: DealerLogoVariant | null; pages: DealerLogoVariant | null }) => Promise<AdminDealer>
  onUpdated: (dealer: AdminDealer) => void
  onHydrated?: (dealer: AdminDealer) => void
}

const choices: Array<{ value: DealerLogoVariant; label: string; detail: string }> = [
  { value: 'original', label: 'Original', detail: 'Transparent primary logo.' },
  { value: 'black', label: 'Black', detail: 'Transparent black logo, when it is readable.' },
  { value: 'white', label: 'White', detail: 'Transparent white logo, when it is readable.' },
]

const assetColumns = 'logo_url, logo_source_url, logo_light_url, logo_generated_light_url, logo_generated_light_usable, logo_black_url, logo_generated_black_url, logo_generated_black_usable, logo_header_variant, logo_pages_variant'

function sameVariants(dealer: AdminDealer, header: DealerLogoVariant | null, pages: DealerLogoVariant | null) {
  return normalizeLogoVariant(dealer.logo_header_variant) === header
    && normalizeLogoVariant(dealer.logo_pages_variant) === pages
}

function nullableText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null
}

function nullableFlag(value: unknown) {
  if (value === true) return true
  if (value === false) return false
  return null
}

function inkKey(url: string, background: string) {
  return `${url}@@${background}`
}

export function DealerLogoVariantSettings({ dealer, onSave, onUpdated, onHydrated }: Props) {
  const whiteLogoUrl = resolveWhiteLogoUrl(dealer)
  const blackLogoUrl = resolveBlackLogoUrl(dealer)
  const [header, setHeader] = useState<DealerLogoVariant | null>(normalizeLogoVariant(dealer.logo_header_variant))
  const [pages, setPages] = useState<DealerLogoVariant | null>(normalizeLogoVariant(dealer.logo_pages_variant))
  const [samples, setSamples] = useState<Record<string, LogoInkSample | 'unreadable'>>({})
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
          .select(assetColumns)
          .eq('id', dealer.id)
          .maybeSingle()
        if (!active || loadError || !data) return
        const fields: VariantFields = {
          logo_url: nullableText(data.logo_url),
          logo_source_url: nullableText(data.logo_source_url),
          logo_light_url: nullableText(data.logo_light_url),
          logo_generated_light_url: nullableText(data.logo_generated_light_url),
          logo_generated_light_usable: nullableFlag(data.logo_generated_light_usable),
          logo_black_url: nullableText(data.logo_black_url),
          logo_generated_black_url: nullableText(data.logo_generated_black_url),
          logo_generated_black_usable: nullableFlag(data.logo_generated_black_usable),
          logo_header_variant: normalizeLogoVariant(data.logo_header_variant),
          logo_pages_variant: normalizeLogoVariant(data.logo_pages_variant),
        }
        const current = dealerRef.current
        const changed = normalizeLogoVariant(current.logo_header_variant) !== fields.logo_header_variant
          || normalizeLogoVariant(current.logo_pages_variant) !== fields.logo_pages_variant
          || (current.logo_url ?? null) !== fields.logo_url
          || (current.logo_source_url ?? null) !== fields.logo_source_url
          || (current.logo_light_url ?? null) !== fields.logo_light_url
          || (current.logo_generated_light_url ?? null) !== fields.logo_generated_light_url
          || (current.logo_generated_light_usable ?? null) !== fields.logo_generated_light_usable
          || (current.logo_black_url ?? null) !== fields.logo_black_url
          || (current.logo_generated_black_url ?? null) !== fields.logo_generated_black_url
          || (current.logo_generated_black_usable ?? null) !== fields.logo_generated_black_usable
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

  const headerSurface = doorBuilderHeaderSurface(dealer)
  const pagesSurface = doorBuilderPagesSurface(dealer)
  const inspectedUrls = [dealer.logo_url, whiteLogoUrl, blackLogoUrl].filter((url): url is string => Boolean(url))
  const inspectedBackgrounds = [...new Set([headerSurface, pagesSurface])]
  const inspectionKey = `${inspectedUrls.join('|')}::${inspectedBackgrounds.join('|')}`

  useEffect(() => {
    const urls = inspectionKey.split('::')[0]?.split('|').filter(Boolean) ?? []
    const backgrounds = inspectionKey.split('::')[1]?.split('|').filter(Boolean) ?? []
    let active = true
    for (const url of urls) {
      for (const background of backgrounds) {
        void inspectLogoAgainstSurface(url, background).then((sample) => {
          if (!active) return
          setSamples((current) => ({ ...current, [inkKey(url, background)]: sample ?? 'unreadable' }))
        })
      }
    }
    return () => {
      active = false
    }
  }, [inspectionKey])

  function statusFor(url: string | null, background: string): LogoInkStatus {
    if (!url) return 'missing'
    return samples[inkKey(url, background)] ?? 'pending'
  }

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

  const headerBorder = doorBuilderColor(dealer.primary_color, DOOR_BUILDER_PRIMARY_FALLBACK)
  const headerOffers = logoVariantOffers(isLightBrandColor(headerSurface), {
    original: statusFor(dealer.logo_url ?? null, headerSurface),
    white: statusFor(whiteLogoUrl, headerSurface),
    black: statusFor(blackLogoUrl, headerSurface),
  })
  const pagesOffers = logoVariantOffers(isLightBrandColor(pagesSurface), {
    original: statusFor(dealer.logo_url ?? null, pagesSurface),
    white: statusFor(whiteLogoUrl, pagesSurface),
    black: statusFor(blackLogoUrl, pagesSurface),
  })

  return (
    <section className="content-card dealer-management-card logo-variant-settings" aria-labelledby="logo-variant-heading">
      <div className="dealer-form__section-heading">
        <p className="eyebrow">Door Builder logos</p>
        <h2 id="logo-variant-heading">Where each logo appears</h2>
        <p>Choose independently for the homepage header and for the other customer-facing pages. Only a transparent logo that can be read on that header is offered. Leaving a choice unset keeps that area on its current logo.</p>
      </div>
      <div className="logo-variant-settings__grid">
        <VariantChoice
          title="Homepage Header Logo"
          name={`logo-header-${dealer.id}`}
          value={header}
          offers={headerOffers}
          onChange={(value) => { dirtyRef.current = true; setHeader(value) }}
        />
        <VariantChoice
          title="Normal Pages Logo"
          name={`logo-pages-${dealer.id}`}
          value={pages}
          offers={pagesOffers}
          onChange={(value) => { dirtyRef.current = true; setPages(value) }}
        />
      </div>
      <div className="logo-variant-settings__previews">
        <LogoPreview
          title="Homepage header preview"
          caption="The homepage header uses this dealer’s secondary color. The logo sits directly on that color."
          background={headerSurface}
          borderColor={headerBorder}
          variant={header}
          logoUrl={resolveDisplayedLogo(dealer, header)}
          fallback={Boolean(header && !resolveVariantLogoUrl(dealer, header))}
          companyName={dealer.company_name}
        />
        <LogoPreview
          title="Normal pages preview"
          caption="Other pages draw this logo in the same header, on the dealer’s secondary color."
          background={pagesSurface}
          borderColor={headerBorder}
          variant={pages}
          logoUrl={resolveDisplayedLogo(dealer, pages)}
          fallback={Boolean(pages && !resolveVariantLogoUrl(dealer, pages))}
          companyName={dealer.company_name}
        />
      </div>
      {message && <div className="portal-alert portal-alert--success" role="status">{message}</div>}
      {error && <div className="portal-alert" role="alert">{error}</div>}
      <div className="dealer-form__actions">
        <button className="button button--outline" type="button" disabled={isSaving || sameVariants(dealer, header, pages)} onClick={() => { dirtyRef.current = false; setHeader(normalizeLogoVariant(dealer.logo_header_variant)); setPages(normalizeLogoVariant(dealer.logo_pages_variant)) }}>Cancel</button>
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
  offers,
  onChange,
}: {
  title: string
  name: string
  value: DealerLogoVariant | null
  offers: Record<DealerLogoVariant, LogoVariantOffer>
  onChange: (value: DealerLogoVariant) => void
}) {
  return (
    <fieldset className="logo-variant-choice">
      <legend>{title}</legend>
      {choices.map((choice) => {
        const offer = offers[choice.value]
        const disabled = !offer.enabled
        const hintId = `${name}-${choice.value}-reason`
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
      {choices.filter((choice) => !offers[choice.value].enabled && offers[choice.value].reason).map((choice) => (
        <p id={`${name}-${choice.value}-reason`} key={choice.value} className="logo-variant-choice__hint">{offers[choice.value].reason}</p>
      ))}
      {value === null && <p className="logo-variant-choice__hint">No explicit choice yet. The Door Builder keeps its current logo for this area.</p>}
      {value && !offers[value].enabled && <p className="logo-variant-choice__hint">This saved choice stays until you select a different logo.</p>}
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
  companyName,
}: {
  title: string
  caption: string
  background: string
  borderColor?: string
  variant: DealerLogoVariant | null
  logoUrl: string | null
  fallback: boolean
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
        {logo}
      </div>
    </figure>
  )
}
