import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { loadMarketingBanners } from '../../features/marketing-banners/bannerStore.ts'
import { bannersInCategory, type BannerCategory, type BannerLibraryData, type ResolvedMarketingBanner } from '../../features/marketing-banners/catalog.ts'
import { marketingBannerFilename } from '../../features/marketing-banners/filename.ts'
import { dealerLogoVariants, type DealerLogoSource } from '../../features/marketing-banners/logos.ts'
import { exportMarketingBanner } from '../../features/marketing-banners/renderBanner.ts'
import '../../features/marketing-banners/marketing-banners.css'
import { BannerCustomizeDialog, BannerPreviewDialog } from './BannerLibraryDialogs'
import { BannerPreviewCanvas } from './BannerPreviewCanvas'

type MarketingBannerLibraryProps = {
  dealer: DealerLogoSource & { slug: string }
  logoManagementHref?: string
  logoManagementLabel?: string
  adminHref?: string
  initialCategory?: BannerCategory
  initialCustomizeSlot?: number | null
  loadBanners?: () => Promise<BannerLibraryData>
}

export function MarketingBannerLibrary({
  dealer,
  logoManagementHref = '/company#dealer-logos',
  logoManagementLabel = 'Add a logo in Company Profile',
  adminHref,
  initialCategory = 'landscape',
  initialCustomizeSlot = null,
  loadBanners = loadMarketingBanners,
}: MarketingBannerLibraryProps) {
  const [library, setLibrary] = useState<BannerLibraryData | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [category, setCategory] = useState<BannerCategory>(initialCategory)
  const [logoId, setLogoId] = useState<string | null>(null)
  const [previewSlot, setPreviewSlot] = useState<number | null>(null)
  const [customizeSlot, setCustomizeSlot] = useState<number | null>(initialCustomizeSlot)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const tabFocus = useRef<BannerCategory | null>(null)
  const tabRefs = useRef<Partial<Record<BannerCategory, HTMLButtonElement | null>>>({})
  const baseId = useId()
  const variants = useMemo(() => dealerLogoVariants(dealer), [dealer])
  const selectedLogo = variants.find((item) => item.id === logoId) ?? variants[0] ?? null

  useEffect(() => {
    let current = true
    void loadBanners().then((result) => {
      if (!current) return
      setLoadError(false)
      setLibrary(result)
    }).catch((caught: unknown) => {
      if (!current) return
      console.error('Failed to load marketing banners.', caught)
      setLoadError(true)
    })
    return () => { current = false }
  }, [loadBanners])

  useEffect(() => {
    if (!tabFocus.current) return
    tabRefs.current[tabFocus.current]?.focus()
    tabFocus.current = null
  }, [category])

  const status = loadError ? 'error' : library ? 'ready' : 'loading'
  const visible = library ? bannersInCategory(library.templates, category) : []
  const previewBanner = library?.templates.find((item) => item.slot === previewSlot) ?? null
  const customizeBanner = library?.templates.find((item) => item.slot === customizeSlot) ?? null

  function onTabKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft' && event.key !== 'Home' && event.key !== 'End') return
    event.preventDefault()
    const order: BannerCategory[] = ['landscape', 'square']
    const index = order.indexOf(category)
    const next = event.key === 'Home'
      ? 'landscape'
      : event.key === 'End'
        ? 'square'
        : order[(index + (event.key === 'ArrowRight' ? 1 : -1) + order.length) % order.length] ?? 'landscape'
    tabFocus.current = next
    setCategory(next)
  }

  async function download(banner: ResolvedMarketingBanner, format: 'png' | 'jpeg') {
    if (!selectedLogo) {
      setCustomizeSlot(banner.slot)
      setPreviewSlot(null)
      return
    }
    const key = `${banner.slot}-${format}`
    setBusy(key)
    setError('')
    setMessage('')
    try {
      const plan = await exportMarketingBanner({
        templateUrl: banner.imageUrl,
        logoUrl: selectedLogo.url,
        placement: banner.placement,
        format,
        filename: marketingBannerFilename({
          slot: banner.slot,
          headline: banner.headline,
          dealerSlug: dealer.slug,
          extension: format === 'jpeg' ? 'jpg' : 'png',
        }),
      })
      setMessage(`Downloaded a ${Math.round(plan.canvasWidth)} × ${Math.round(plan.canvasHeight)} ${format === 'jpeg' ? 'JPG' : 'PNG'}.`)
    } catch (downloadError) {
      console.error('Failed to export marketing banner.', downloadError)
      setError('The banner could not be created. Refresh the page and try the download again.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="content-card mbl" aria-labelledby={`${baseId}-title`}>
      <div className="content-card__header">
        <p className="eyebrow">Dealer branding</p>
        <h2 id={`${baseId}-title`}>Banner Library</h2>
        <p className="mbl-intro">Choose a Home Guard template and place {dealer.company_name}’s existing logo on it. Logo positions are unverified defaults until an admin sets them.</p>
      </div>
      <div className="mbl-body">
        {message ? <div className="portal-alert portal-alert--success" role="status">{message}</div> : null}
        {error ? <div className="portal-alert" role="alert">{error}</div> : null}
        {library?.notice ? <p className="mbl-notice" role="status">{library.notice}</p> : null}
        <div className="mbl-toolbar">
          <div className="mbl-tabs" role="tablist" aria-label="Banner shape" onKeyDown={onTabKeyDown}>
            {(['landscape', 'square'] as const).map((item) => (
              <button
                ref={(element) => { tabRefs.current[item] = element }}
                id={`${baseId}-tab-${item}`}
                key={item}
                type="button"
                role="tab"
                aria-selected={category === item}
                aria-controls={`${baseId}-panel`}
                tabIndex={category === item ? 0 : -1}
                onClick={() => setCategory(item)}
              >
                {item === 'landscape' ? 'Landscape' : 'Square'}
              </button>
            ))}
          </div>
          {adminHref ? <Link className="mbl-admin-link" to={adminHref}>Edit template placements</Link> : null}
        </div>
        <div role="tabpanel" id={`${baseId}-panel`} aria-labelledby={`${baseId}-tab-${category}`}>
          {status === 'loading' ? <div className="mbl-grid mbl-grid--landscape" role="status">{[0, 1, 2, 3].map((item) => <div className="mbl-skeleton" key={item} />)}</div> : null}
          {status === 'error' ? (
            <div className="data-state data-state--error" role="alert">
              The banner library could not be loaded.
              <button className="button button--outline" type="button" onClick={() => window.location.reload()}>Try again</button>
            </div>
          ) : null}
          {status === 'ready' && visible.length === 0 ? <div className="data-state" role="status">No {category} banners are available.</div> : null}
          {status === 'ready' && visible.length > 0 ? (
            <ul className={`mbl-grid mbl-grid--${category}`}>
              {visible.map((banner) => (
                <li className="mbl-card" key={banner.slot}>
                  <div
                    className="mbl-card__media"
                    role="button"
                    tabIndex={0}
                    aria-label={`Preview ${banner.headline}`}
                    onClick={() => setPreviewSlot(banner.slot)}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return
                      event.preventDefault()
                      setPreviewSlot(banner.slot)
                    }}
                  >
                    {selectedLogo ? (
                      <BannerPreviewCanvas templateUrl={banner.imageUrl} logoUrl={selectedLogo.url} placement={banner.placement} label="" />
                    ) : (
                      <img src={banner.imageUrl} alt="" />
                    )}
                  </div>
                  <div className="mbl-card__body">
                    <div className="mbl-card__meta">
                      <span className={`mbl-badge ${banner.placementVerified ? 'mbl-badge--verified' : 'mbl-badge--warning'}`}>{banner.placementLabel}</span>
                    </div>
                    <h3>{banner.headline}</h3>
                    <p>Banner {banner.slot} · {banner.width} × {banner.height}</p>
                    <div className="mbl-card__actions">
                      <button className="button button--primary" type="button" onClick={() => setCustomizeSlot(banner.slot)}>Customize Banner</button>
                      <button className="button button--outline" type="button" disabled={busy === `${banner.slot}-png`} onClick={() => void download(banner, 'png')}>
                        {busy === `${banner.slot}-png` ? 'Preparing PNG…' : 'Download'}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
      <BannerPreviewDialog
        banner={previewBanner}
        logoUrl={selectedLogo?.url ?? null}
        downloading={busy === `${previewBanner?.slot ?? 0}-png`}
        onClose={() => setPreviewSlot(null)}
        onCustomize={() => { setCustomizeSlot(previewBanner?.slot ?? null); setPreviewSlot(null) }}
        onDownload={() => { if (previewBanner) void download(previewBanner, 'png') }}
      />
      <BannerCustomizeDialog
        banner={customizeBanner}
        variants={variants}
        logoId={selectedLogo?.id ?? null}
        onLogoId={setLogoId}
        downloading={busy === `${customizeBanner?.slot ?? 0}-png` ? 'png' : busy === `${customizeBanner?.slot ?? 0}-jpeg` ? 'jpeg' : null}
        logoManagementHref={logoManagementHref}
        logoManagementLabel={logoManagementLabel}
        onClose={() => setCustomizeSlot(null)}
        onDownload={(format) => { if (customizeBanner) void download(customizeBanner, format) }}
      />
    </section>
  )
}
