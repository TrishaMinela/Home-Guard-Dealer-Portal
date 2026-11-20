import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { AdminDealer } from '../types/admin'
import { inspectLogoAgainstSurface } from '../utils/readLogoForRemoval'
import type { LogoInkSample } from '../utils/logoBackground'
import {
  DOOR_BUILDER_PRIMARY_FALLBACK,
  doorBuilderColor,
  doorBuilderHeaderSurface,
  doorBuilderLogoPreview,
  doorBuilderPagesSurface,
  isLightBrandColor,
  logoChoicesAfterFailedSave,
  logoVariantOffers,
  normalizeLogoDisplay,
  normalizeLogoVariant,
  resolveBlackLogoUrl,
  resolveWhiteLogoUrl,
  secondaryLogoSource,
  type DealerLogoVariant,
  type LogoInkStatus,
  type LogoVariantOffer,
} from '../utils/dealerLogoVariants'
import { logoWebsiteFieldValue, logoWebsiteSaveError, normalizeLogoWebsiteUrl } from '../utils/logoWebsiteUrl'

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
  onSave: (variants: {
    header: DealerLogoVariant | null
    pages: DealerLogoVariant | null
    secondaryHeader: DealerLogoVariant | null
    secondaryPages: DealerLogoVariant | null
  }) => Promise<AdminDealer>
  onSaveWebsite: (slot: 'primary' | 'secondary', url: string | null) => Promise<AdminDealer>
  onWebsiteUpdated?: (dealer: AdminDealer) => void
  onUpdated: (dealer: AdminDealer) => void
  onHydrated?: (dealer: AdminDealer) => void
}

const choices: Array<{ value: DealerLogoVariant; label: string; detail: string }> = [
  { value: 'original', label: 'Original', detail: 'Transparent primary logo.' },
  { value: 'black', label: 'Black', detail: 'Transparent black logo, when it is readable.' },
  { value: 'white', label: 'White', detail: 'Transparent white logo, when it is readable.' },
]

const assetColumns = 'logo_url, logo_source_url, logo_light_url, logo_generated_light_url, logo_generated_light_usable, logo_black_url, logo_generated_black_url, logo_generated_black_usable, logo_header_variant, logo_pages_variant'

function sameVariants(
  dealer: AdminDealer,
  header: DealerLogoVariant | null,
  pages: DealerLogoVariant | null,
  secondaryHeader: DealerLogoVariant | null,
  secondaryPages: DealerLogoVariant | null,
) {
  const primary = normalizeLogoVariant(dealer.logo_header_variant) === header
    && normalizeLogoVariant(dealer.logo_pages_variant) === pages
  if (normalizeLogoDisplay(dealer.logo_display) !== 'dual') return primary
  return primary
    && normalizeLogoVariant(dealer.logo_secondary_header_variant) === secondaryHeader
    && normalizeLogoVariant(dealer.logo_secondary_pages_variant) === secondaryPages
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

export function DealerLogoVariantSettings({ dealer, onSave, onSaveWebsite, onWebsiteUpdated, onUpdated, onHydrated }: Props) {
  const whiteLogoUrl = resolveWhiteLogoUrl(dealer)
  const blackLogoUrl = resolveBlackLogoUrl(dealer)
  const [header, setHeader] = useState<DealerLogoVariant | null>(normalizeLogoVariant(dealer.logo_header_variant))
  const [pages, setPages] = useState<DealerLogoVariant | null>(normalizeLogoVariant(dealer.logo_pages_variant))
  const [secondaryHeader, setSecondaryHeader] = useState<DealerLogoVariant | null>(normalizeLogoVariant(dealer.logo_secondary_header_variant))
  const [secondaryPages, setSecondaryPages] = useState<DealerLogoVariant | null>(normalizeLogoVariant(dealer.logo_secondary_pages_variant))
  const [primaryWebsite, setPrimaryWebsite] = useState(logoWebsiteFieldValue(dealer.logo_website_url, dealer.website))
  const [secondaryWebsite, setSecondaryWebsite] = useState(logoWebsiteFieldValue(dealer.logo_secondary_website_url))
  const [primaryWebsiteError, setPrimaryWebsiteError] = useState('')
  const [secondaryWebsiteError, setSecondaryWebsiteError] = useState('')
  const [primaryWebsiteMessage, setPrimaryWebsiteMessage] = useState('')
  const [secondaryWebsiteMessage, setSecondaryWebsiteMessage] = useState('')
  const [savingWebsite, setSavingWebsite] = useState<'primary' | 'secondary' | null>(null)
  const [samples, setSamples] = useState<Record<string, LogoInkSample | 'unreadable'>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const dealerRef = useRef(dealer)
  const dirtyRef = useRef(false)
  const primaryWebsiteDirtyRef = useRef(false)
  const secondaryWebsiteDirtyRef = useRef(false)
  const onHydratedRef = useRef(onHydrated)
  dealerRef.current = dealer
  onHydratedRef.current = onHydrated

  useEffect(() => {
    dirtyRef.current = false
    setHeader(normalizeLogoVariant(dealerRef.current.logo_header_variant))
    setPages(normalizeLogoVariant(dealerRef.current.logo_pages_variant))
    setSecondaryHeader(normalizeLogoVariant(dealerRef.current.logo_secondary_header_variant))
    setSecondaryPages(normalizeLogoVariant(dealerRef.current.logo_secondary_pages_variant))
    primaryWebsiteDirtyRef.current = false
    secondaryWebsiteDirtyRef.current = false
    setPrimaryWebsite(logoWebsiteFieldValue(dealerRef.current.logo_website_url, dealerRef.current.website))
    setSecondaryWebsite(logoWebsiteFieldValue(dealerRef.current.logo_secondary_website_url))
    setPrimaryWebsiteError('')
    setSecondaryWebsiteError('')
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
        const { data: secondaryData, error: secondaryError } = await supabase
          .from('dealers')
          .select('logo_secondary_header_variant, logo_secondary_pages_variant')
          .eq('id', dealer.id)
          .maybeSingle()
        const nextSecondaryHeader = !secondaryError && secondaryData
          ? normalizeLogoVariant(secondaryData.logo_secondary_header_variant)
          : normalizeLogoVariant(current.logo_secondary_header_variant)
        const nextSecondaryPages = !secondaryError && secondaryData
          ? normalizeLogoVariant(secondaryData.logo_secondary_pages_variant)
          : normalizeLogoVariant(current.logo_secondary_pages_variant)
        if (!dirtyRef.current) {
          setHeader(fields.logo_header_variant)
          setPages(fields.logo_pages_variant)
          setSecondaryHeader(nextSecondaryHeader)
          setSecondaryPages(nextSecondaryPages)
        }
        const secondaryChanged = normalizeLogoVariant(current.logo_secondary_header_variant) !== nextSecondaryHeader
          || normalizeLogoVariant(current.logo_secondary_pages_variant) !== nextSecondaryPages
        const { data: websiteData, error: websiteError } = await supabase
          .from('dealers')
          .select('logo_website_url, logo_secondary_website_url')
          .eq('id', dealer.id)
          .maybeSingle()
        if (!active) return
        const nextPrimaryWebsite = !websiteError && websiteData
          ? nullableText(websiteData.logo_website_url)
          : current.logo_website_url ?? null
        const nextSecondaryWebsite = !websiteError && websiteData
          ? nullableText(websiteData.logo_secondary_website_url)
          : current.logo_secondary_website_url ?? null
        if (!primaryWebsiteDirtyRef.current) setPrimaryWebsite(logoWebsiteFieldValue(nextPrimaryWebsite, current.website))
        if (!secondaryWebsiteDirtyRef.current) setSecondaryWebsite(logoWebsiteFieldValue(nextSecondaryWebsite))
        const websiteChanged = !websiteError && (
          (current.logo_website_url ?? null) !== nextPrimaryWebsite
          || (current.logo_secondary_website_url ?? null) !== nextSecondaryWebsite
        )
        if (changed || secondaryChanged || websiteChanged) onHydratedRef.current?.({
          ...current,
          ...fields,
          logo_secondary_header_variant: nextSecondaryHeader,
          logo_secondary_pages_variant: nextSecondaryPages,
          ...(websiteError ? {} : {
            logo_website_url: nextPrimaryWebsite,
            logo_secondary_website_url: nextSecondaryWebsite,
          }),
        })
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
  const secondSource = secondaryLogoSource(dealer)
  const secondWhiteUrl = resolveWhiteLogoUrl(secondSource)
  const secondBlackUrl = resolveBlackLogoUrl(secondSource)
  const inspectedUrls = [dealer.logo_url, whiteLogoUrl, blackLogoUrl, secondSource.logo_url, secondWhiteUrl, secondBlackUrl].filter((url): url is string => Boolean(url))
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
      const updated = await onSave({ header, pages, secondaryHeader, secondaryPages })
      onUpdated(updated)
      setMessage('Door Builder logo choices saved.')
    } catch (saveError) {
      console.error('Failed to save dealer logo variants.', saveError)
      const saved = logoChoicesAfterFailedSave(dealer)
      dirtyRef.current = false
      setHeader(saved.header)
      setPages(saved.pages)
      setSecondaryHeader(saved.secondaryHeader)
      setSecondaryPages(saved.secondaryPages)
      setError('These logo choices were not saved. The previous choices are unchanged.')
    } finally {
      setIsSaving(false)
    }
  }

  async function saveWebsite(slot: 'primary' | 'secondary') {
    const raw = slot === 'primary' ? primaryWebsite : secondaryWebsite
    const parsed = normalizeLogoWebsiteUrl(raw)
    if (slot === 'primary') {
      setPrimaryWebsiteMessage('')
      setPrimaryWebsiteError(parsed.error ?? '')
    } else {
      setSecondaryWebsiteMessage('')
      setSecondaryWebsiteError(parsed.error ?? '')
    }
    if (parsed.error) return
    setSavingWebsite(slot)
    try {
      const updated = await onSaveWebsite(slot, parsed.url)
      if (slot === 'primary') {
        primaryWebsiteDirtyRef.current = false
        setPrimaryWebsite(logoWebsiteFieldValue(updated.logo_website_url, updated.website))
        setPrimaryWebsiteMessage(parsed.url
          ? 'Logo 1 website saved.'
          : updated.website?.trim()
            ? 'Logo 1 will use the company website.'
            : 'Logo 1 will not link to a website.')
      } else {
        secondaryWebsiteDirtyRef.current = false
        setSecondaryWebsite(logoWebsiteFieldValue(updated.logo_secondary_website_url))
        setSecondaryWebsiteMessage(parsed.url ? 'Logo 2 website saved.' : 'Logo 2 will stay visible without a link.')
      }
      ;(onWebsiteUpdated ?? onUpdated)(updated)
    } catch (saveError) {
      console.error('Failed to save logo website.', saveError)
      const text = logoWebsiteSaveError(saveError)
      if (slot === 'primary') setPrimaryWebsiteError(text)
      else setSecondaryWebsiteError(text)
    } finally {
      setSavingWebsite(null)
    }
  }

  function cancelWebsite(slot: 'primary' | 'secondary') {
    if (slot === 'primary') {
      primaryWebsiteDirtyRef.current = false
      setPrimaryWebsite(logoWebsiteFieldValue(dealer.logo_website_url, dealer.website))
      setPrimaryWebsiteError('')
      setPrimaryWebsiteMessage('')
      return
    }
    secondaryWebsiteDirtyRef.current = false
    setSecondaryWebsite(logoWebsiteFieldValue(dealer.logo_secondary_website_url))
    setSecondaryWebsiteError('')
    setSecondaryWebsiteMessage('')
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
  const secondHeaderOffers = logoVariantOffers(isLightBrandColor(headerSurface), {
    original: statusFor(secondSource.logo_url ?? null, headerSurface),
    white: statusFor(secondWhiteUrl, headerSurface),
    black: statusFor(secondBlackUrl, headerSurface),
  })
  const secondPagesOffers = logoVariantOffers(isLightBrandColor(pagesSurface), {
    original: statusFor(secondSource.logo_url ?? null, pagesSurface),
    white: statusFor(secondWhiteUrl, pagesSurface),
    black: statusFor(secondBlackUrl, pagesSurface),
  })
  const dual = normalizeLogoDisplay(dealer.logo_display) === 'dual'
  const draft = {
    ...dealer,
    logo_header_variant: header,
    logo_pages_variant: pages,
    logo_secondary_header_variant: dual ? secondaryHeader : null,
    logo_secondary_pages_variant: dual ? secondaryPages : null,
  }
  const homePreview = doorBuilderLogoPreview(draft, dealer.logo_placement === 'header' ? 'home-header' : 'home-hero')
  const builderPreview = doorBuilderLogoPreview(draft, 'page-header')
  const findMyDoorPreview = doorBuilderLogoPreview(draft, 'find-my-door')
  const unchanged = sameVariants(dealer, header, pages, secondaryHeader, secondaryPages)
  const primaryWebsiteBaseline = logoWebsiteFieldValue(dealer.logo_website_url, dealer.website)
  const secondaryWebsiteBaseline = logoWebsiteFieldValue(dealer.logo_secondary_website_url)
  const primaryWebsiteHint = dealer.logo_website_url?.trim()
    ? 'Homepage and normal pages use this address for Logo 1.'
    : dealer.website?.trim()
      ? 'Prefilled from the company website. Homepage and normal pages use it for Logo 1 until you save a different address.'
      : 'Homepage and normal pages use this address for Logo 1. Leave it blank and Logo 1 is not a link.'

  return (
    <section className="content-card dealer-management-card logo-variant-settings" aria-labelledby="logo-variant-heading">
      <div className="dealer-form__section-heading">
        <p className="eyebrow">Door Builder logos</p>
        <h2 id="logo-variant-heading">Where each logo appears</h2>
        <p>Choose independently for the homepage header and for the other customer-facing pages. A transparent file can be used on any background. A generated file is offered only when it is marked readable. Leaving Logo 1 unset keeps that area on its current logo. Leaving Logo 2 unset follows Logo 1.</p>
      </div>
      <div className="logo-variant-settings__grid">
        <div className="logo-variant-settings__pair dealer-setup-anchor" id="homepage-logo-selection" tabIndex={-1}>
          <VariantChoice
            title="Homepage Header Logo"
            name={`logo-header-${dealer.id}`}
            value={header}
            offers={headerOffers}
            onChange={(value) => { dirtyRef.current = true; setHeader(value) }}
          />
          <LogoWebsiteField
            id={`logo-1-website-${dealer.id}`}
            label="Logo 1 Website URL"
            hint={primaryWebsiteHint}
            value={primaryWebsite}
            error={primaryWebsiteError}
            message={primaryWebsiteMessage}
            saving={savingWebsite === 'primary'}
            unchanged={primaryWebsite.trim() === primaryWebsiteBaseline}
            onChange={(value) => { primaryWebsiteDirtyRef.current = true; setPrimaryWebsiteError(''); setPrimaryWebsiteMessage(''); setPrimaryWebsite(value) }}
            onCancel={() => cancelWebsite('primary')}
            onSave={() => void saveWebsite('primary')}
          />
          {dual && (
            <>
              <VariantChoice
                title="Homepage Header — Logo 2"
                name={`logo-secondary-header-${dealer.id}`}
                value={secondaryHeader}
                offers={secondHeaderOffers}
                unsetHint="No explicit choice yet. Logo 2 follows Logo 1 for this area."
                onChange={(value) => { dirtyRef.current = true; setSecondaryHeader(value) }}
              />
              <LogoWebsiteField
                id={`logo-2-website-${dealer.id}`}
                label="Logo 2 Website URL"
                hint="Homepage and normal pages use this address for Logo 2. Leave it blank and Logo 2 is not a link."
                value={secondaryWebsite}
                error={secondaryWebsiteError}
                message={secondaryWebsiteMessage}
                saving={savingWebsite === 'secondary'}
                unchanged={secondaryWebsite.trim() === secondaryWebsiteBaseline}
                onChange={(value) => { secondaryWebsiteDirtyRef.current = true; setSecondaryWebsiteError(''); setSecondaryWebsiteMessage(''); setSecondaryWebsite(value) }}
                onCancel={() => cancelWebsite('secondary')}
                onSave={() => void saveWebsite('secondary')}
              />
            </>
          )}
        </div>
        <div className="logo-variant-settings__pair dealer-setup-anchor" id="pages-logo-selection" tabIndex={-1}>
          <VariantChoice
            title="Normal Pages Logo"
            name={`logo-pages-${dealer.id}`}
            value={pages}
            offers={pagesOffers}
            onChange={(value) => { dirtyRef.current = true; setPages(value) }}
          />
          {dual && (
            <VariantChoice
              title="Normal Pages — Logo 2"
              name={`logo-secondary-pages-${dealer.id}`}
              value={secondaryPages}
              offers={secondPagesOffers}
              unsetHint="No explicit choice yet. Logo 2 follows Logo 1 for this area."
              onChange={(value) => { dirtyRef.current = true; setSecondaryPages(value) }}
            />
          )}
        </div>
      </div>
      <div className="logo-variant-settings__previews">
        {homePreview && (
          <LogoPreview
            title={dealer.logo_placement === 'header' ? 'Homepage header preview' : 'Homepage hero preview'}
            caption={dealer.logo_placement === 'header'
              ? 'The homepage header uses this dealer’s secondary color. The logo sits directly on that color.'
              : 'The homepage hero uses a white background. Builder pages still use the secondary color.'}
            background={homePreview.background}
            borderColor={dealer.logo_placement === 'header' ? headerBorder : undefined}
            variant={header}
            logoUrl={homePreview.primaryUrl}
            secondaryUrl={homePreview.showPair ? homePreview.secondaryUrl : null}
            companyName={dealer.company_name}
          />
        )}
        {builderPreview && (
          <LogoPreview
            title="Builder pages preview"
            caption="Builder pages draw these logos on the dealer’s secondary color."
            background={builderPreview.background}
            borderColor={headerBorder}
            variant={pages}
            logoUrl={builderPreview.primaryUrl}
            secondaryUrl={builderPreview.showPair ? builderPreview.secondaryUrl : null}
            companyName={dealer.company_name}
          />
        )}
        {findMyDoorPreview && (
          <LogoPreview
            title="Find My Door preview"
            caption="Find My Door uses its black header and the normal-pages logo choices."
            background={findMyDoorPreview.background}
            variant={pages}
            logoUrl={findMyDoorPreview.primaryUrl}
            secondaryUrl={findMyDoorPreview.showPair ? findMyDoorPreview.secondaryUrl : null}
            companyName={dealer.company_name}
          />
        )}
      </div>
      {message && <div className="portal-alert portal-alert--success" role="status">{message}</div>}
      {error && <div className="portal-alert" role="alert">{error}</div>}
      <div className="dealer-form__actions">
        <button className="button button--outline" type="button" disabled={isSaving || unchanged} onClick={() => { dirtyRef.current = false; setHeader(normalizeLogoVariant(dealer.logo_header_variant)); setPages(normalizeLogoVariant(dealer.logo_pages_variant)); setSecondaryHeader(normalizeLogoVariant(dealer.logo_secondary_header_variant)); setSecondaryPages(normalizeLogoVariant(dealer.logo_secondary_pages_variant)) }}>Cancel</button>
        <button className="button button--primary" type="button" disabled={isSaving || unchanged} onClick={() => void save()}>
          {isSaving ? 'Saving...' : 'Save Logo Choices'}
        </button>
      </div>
    </section>
  )
}

function LogoWebsiteField({
  id,
  label,
  hint,
  value,
  error,
  message,
  saving,
  unchanged,
  onChange,
  onCancel,
  onSave,
}: {
  id: string
  label: string
  hint: string
  value: string
  error: string
  message: string
  saving: boolean
  unchanged: boolean
  onChange: (value: string) => void
  onCancel: () => void
  onSave: () => void
}) {
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  return (
    <div
      className="logo-website-field"
      onKeyDown={(event) => {
        if (event.key !== 'Enter' || !(event.target instanceof HTMLInputElement)) return
        event.preventDefault()
        event.stopPropagation()
        if (!saving && !unchanged) onSave()
      }}
    >
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        inputMode="url"
        autoComplete="url"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder="https://example.com"
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${hintId} ${errorId}` : hintId}
        onChange={(event) => onChange(event.target.value)}
      />
      <p id={hintId} className="logo-website-field__hint">{hint}</p>
      {message && <p className="logo-website-field__status" role="status">{message}</p>}
      {error && <p id={errorId} className="logo-website-field__error" role="alert">{error}</p>}
      <div className="logo-website-field__actions">
        <button className="button button--outline" type="button" disabled={saving || unchanged} onClick={onCancel}>Cancel</button>
        <button className="button button--primary" type="button" disabled={saving || unchanged} onClick={onSave}>{saving ? 'Saving...' : 'Save URL'}</button>
      </div>
    </div>
  )
}

function VariantChoice({
  title,
  name,
  anchorId,
  value,
  offers,
  unsetHint,
  onChange,
}: {
  title: string
  name: string
  anchorId?: string
  value: DealerLogoVariant | null
  offers: Record<DealerLogoVariant, LogoVariantOffer>
  unsetHint?: string
  onChange: (value: DealerLogoVariant) => void
}) {
  return (
    <fieldset className="logo-variant-choice dealer-setup-anchor" id={anchorId} tabIndex={anchorId ? -1 : undefined}>
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
      {value === null && <p className="logo-variant-choice__hint">{unsetHint ?? 'No explicit choice yet. The Door Builder keeps its current logo for this area.'}</p>}
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
  secondaryUrl,
  companyName,
}: {
  title: string
  caption: string
  background: string
  borderColor?: string
  variant: DealerLogoVariant | null
  logoUrl: string | null
  secondaryUrl?: string | null
  companyName: string
}) {
  const ink = isLightBrandColor(background) ? '#182124' : '#f7faff'
  const logo = logoUrl ? (
    <span className="logo-variant-preview__logos">
      <img src={logoUrl} alt={`${companyName} ${variant ?? 'current'} logo preview`} />
      {secondaryUrl && (
        <>
          <span className="logo-variant-preview__divider" aria-hidden="true" />
          <img src={secondaryUrl} alt={`${companyName} partner logo preview`} />
        </>
      )}
    </span>
  ) : (
    <span style={{ color: ink }}>{variant === null ? 'Choose a logo to preview.' : 'No usable logo for this choice.'}</span>
  )
  return (
    <figure className="logo-variant-preview">
      <figcaption>
        <strong>{title}</strong>
        <small>{caption}</small>
      </figcaption>
      <div className={`logo-variant-preview__stage ${borderColor ? 'logo-variant-preview__stage--header' : ''}`} style={{ background, borderBottomColor: borderColor, color: ink }}>
        {logo}
      </div>
    </figure>
  )
}
