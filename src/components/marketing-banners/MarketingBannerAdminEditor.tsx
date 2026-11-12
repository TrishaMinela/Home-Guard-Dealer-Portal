import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react'
import {
  loadMarketingBanners,
  saveMarketingBannerImage,
  saveMarketingBannerPlacement,
  type BannerSaveResult,
} from '../../features/marketing-banners/bannerStore.ts'
import { type BannerLibraryData, type ResolvedMarketingBanner } from '../../features/marketing-banners/catalog.ts'
import { marketingBannerFilename } from '../../features/marketing-banners/filename.ts'
import { dealerLogoVariants, SAMPLE_BANNER_LOGOS, type DealerLogoSource } from '../../features/marketing-banners/logos.ts'
import {
  bannerCompositePlan,
  editPlacement,
  nudgeStep,
  placementAfterDrag,
  type BannerPlacement,
  type DragMode,
} from '../../features/marketing-banners/placement.ts'
import { exportMarketingBanner, loadDrawableImage } from '../../features/marketing-banners/renderBanner.ts'
import '../../features/marketing-banners/marketing-banners.css'
import { BannerPreviewCanvas } from './BannerPreviewCanvas'

type MarketingBannerAdminEditorProps = {
  dealers?: DealerLogoSource[]
  loadBanners?: () => Promise<BannerLibraryData>
  savePlacement?: typeof saveMarketingBannerPlacement
  saveImage?: typeof saveMarketingBannerImage
}

type LogoChoice = { id: string; label: string; url: string; dealerSlug: string; kind: 'sample' | 'dealer' }
const EMPTY_DEALERS: DealerLogoSource[] = []
const HANDLES: Array<[DragMode, string]> = [
  ['nw', 'Resize from the top left'],
  ['n', 'Resize from the top'],
  ['ne', 'Resize from the top right'],
  ['e', 'Resize from the right'],
  ['se', 'Resize from the bottom right'],
  ['s', 'Resize from the bottom'],
  ['sw', 'Resize from the bottom left'],
  ['w', 'Resize from the left'],
]

export function MarketingBannerAdminEditor({
  dealers = EMPTY_DEALERS,
  loadBanners = loadMarketingBanners,
  savePlacement = saveMarketingBannerPlacement,
  saveImage = saveMarketingBannerImage,
}: MarketingBannerAdminEditorProps) {
  const [library, setLibrary] = useState<BannerLibraryData | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState(1)
  const [drafts, setDrafts] = useState<Record<number, BannerPlacement>>({})
  const [verifiedDrafts, setVerifiedDrafts] = useState<Record<number, boolean>>({})
  const [logoId, setLogoId] = useState<string>(SAMPLE_BANNER_LOGOS[0].id)
  const [logoSize, setLogoSize] = useState<{ width: number; height: number } | null>(null)
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [downloading, setDownloading] = useState<'png' | 'jpeg' | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ mode: DragMode; pointerId: number; startX: number; startY: number; origin: BannerPlacement } | null>(null)

  useEffect(() => {
    let current = true
    void loadBanners().then((result) => {
      if (!current) return
      setLoadError(false)
      setLibrary(result)
    }).catch((caught: unknown) => {
      if (!current) return
      console.error('Failed to load banner templates for editing.', caught)
      setLoadError(true)
    })
    return () => { current = false }
  }, [loadBanners])

  const status = loadError ? 'error' : library ? 'ready' : 'loading'
  const logos = useMemo<LogoChoice[]>(() => [
    ...SAMPLE_BANNER_LOGOS.map((item) => ({ id: item.id, label: item.label, url: item.url, dealerSlug: 'sample', kind: 'sample' as const })),
    ...dealers.flatMap((dealer) => dealerLogoVariants(dealer).map((variant) => ({
      id: `${dealer.id}:${variant.id}`,
      label: `${dealer.company_name} — ${variant.label}`,
      url: variant.url,
      dealerSlug: dealer.slug || dealer.company_name,
      kind: 'dealer' as const,
    }))),
  ], [dealers])
  const logo = logos.find((item) => item.id === logoId) ?? logos[0]
  const banner = library?.templates.find((item) => item.slot === selectedSlot) ?? library?.templates[0] ?? null
  const placement = banner ? drafts[banner.slot] ?? banner.placement : null
  const verified = banner ? verifiedDrafts[banner.slot] ?? banner.placementVerified : false

  useEffect(() => {
    if (!logo) return
    let cancelled = false
    void loadDrawableImage(logo.url).then((image) => {
      if (!cancelled) setLogoSize({ width: image.naturalWidth, height: image.naturalHeight })
    }).catch(() => { if (!cancelled) setLogoSize(null) })
    return () => { cancelled = true }
  }, [logo])

  function report(result: BannerSaveResult) {
    if (result.ok) {
      setError('')
      return true
    }
    setMessage('')
    setError(result.message)
    return false
  }

  function updatePlacement(patch: Partial<BannerPlacement>) {
    if (!banner || !placement) return
    setDrafts((current) => ({ ...current, [banner.slot]: editPlacement(placement, patch) }))
  }

  function beginDrag(event: PointerEvent<HTMLElement>, mode: DragMode) {
    if (!placement) return
    event.stopPropagation()
    event.preventDefault()
    stageRef.current?.setPointerCapture(event.pointerId)
    dragRef.current = { mode, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, origin: placement }
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    const bounds = stageRef.current?.getBoundingClientRect()
    if (!drag || drag.pointerId !== event.pointerId || !bounds || bounds.width === 0 || !banner) return
    const dx = ((event.clientX - drag.startX) / bounds.width) * 100
    const dy = ((event.clientY - drag.startY) / bounds.height) * 100
    const next = placementAfterDrag(drag.origin, drag.mode, dx, dy)
    setDrafts((current) => ({ ...current, [banner.slot]: next }))
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null
  }

  function nudge(event: KeyboardEvent<HTMLElement>, mode: DragMode) {
    if (!banner || !placement) return
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    const step = nudgeStep(event)
    const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
    const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
    setDrafts((current) => ({ ...current, [banner.slot]: placementAfterDrag(placement, mode, dx, dy) }))
  }

  async function save() {
    if (!banner || !placement) return
    setSaving(true)
    const result = await savePlacement({ slot: banner.slot, placement, placementVerified: verified })
    if (report(result)) {
      setLibrary((current) => current && ({
        ...current,
        templates: current.templates.map((item) => item.slot === banner.slot
          ? { ...item, placement, placementVerified: verified, placementLabel: verified ? 'Verified placement' : `Unverified placement · ${item.region}` }
          : item),
      }))
      setDrafts((current) => {
        const next = { ...current }
        delete next[banner.slot]
        return next
      })
      setMessage(`Saved banner ${banner.slot}.`)
    }
    setSaving(false)
  }

  async function upload(file: File | undefined) {
    if (!banner || !file) return
    setUploading(true)
    setError('')
    setMessage('')
    try {
      const previewUrl = URL.createObjectURL(file)
      const image = await loadDrawableImage(previewUrl)
      const result = await saveImage({ slot: banner.slot, file, width: image.naturalWidth, height: image.naturalHeight })
      if (report(result)) {
        const nextUrl = result.previewUrl ?? previewUrl
        setLibrary((current) => current && ({
          ...current,
          templates: current.templates.map((item) => item.slot === banner.slot
            ? { ...item, imageUrl: nextUrl, imageSource: 'storage', width: image.naturalWidth, height: image.naturalHeight }
            : item),
        }))
        setMessage(`Replaced the template image for banner ${banner.slot}.`)
      } else {
        URL.revokeObjectURL(previewUrl)
      }
    } catch (uploadError) {
      console.error('Failed to read a banner template image.', uploadError)
      setError('The template image could not be read. Choose a PNG, JPEG, or WebP file.')
    } finally {
      setUploading(false)
    }
  }

  async function download(format: 'png' | 'jpeg') {
    if (!banner || !placement || !logo) return
    setDownloading(format)
    setError('')
    try {
      const plan = await exportMarketingBanner({
        templateUrl: banner.imageUrl,
        logoUrl: logo.url,
        placement,
        format,
        filename: marketingBannerFilename({
          slot: banner.slot,
          headline: banner.headline,
          dealerSlug: logo.dealerSlug,
          extension: format === 'jpeg' ? 'jpg' : 'png',
        }),
      })
      setMessage(`Downloaded a ${Math.round(plan.canvasWidth)} × ${Math.round(plan.canvasHeight)} ${format === 'jpeg' ? 'JPG' : 'PNG'} for banner ${banner.slot}.`)
    } catch (downloadError) {
      console.error('Failed to export an admin banner preview.', downloadError)
      setError('The banner could not be created from this template and logo.')
    } finally {
      setDownloading(null)
    }
  }

  const logoBox = banner && placement && logoSize && natural && natural.width > 0
    ? bannerCompositePlan({
      placement,
      imageWidth: natural.width,
      imageHeight: natural.height,
      logoWidth: logoSize.width,
      logoHeight: logoSize.height,
    })
    : null

  return (
    <div className="mbl-admin">
      <div className="mbl-admin__list">
        {status === 'loading' ? <div className="data-state" role="status">Loading templates…</div> : null}
        {status === 'error' ? <div className="data-state data-state--error" role="alert">The template list could not be loaded.</div> : null}
        {library?.templates.map((item) => (
          <button className={`mbl-banner-pick${item.slot === banner?.slot ? ' is-selected' : ''}`} type="button" key={item.slot} onClick={() => setSelectedSlot(item.slot)} aria-pressed={item.slot === banner?.slot}>
            <img src={item.imageUrl} alt="" />
            <span><strong>{item.slot}. {item.headline}</strong><span>{item.placementVerified ? 'Verified' : 'Unverified default'}</span></span>
          </button>
        ))}
      </div>
      {banner && placement ? <EditorPanel
        banner={banner}
        placement={placement}
        verified={verified}
        logos={logos}
        logoId={logo?.id ?? ''}
        logoUrl={logo?.url ?? ''}
        logoBox={logoBox}
        natural={natural}
        notice={library?.notice ?? null}
        message={message}
        error={error}
        saving={saving}
        uploading={uploading}
        downloading={downloading}
        stageRef={stageRef}
        onLogo={setLogoId}
        onVerified={(value) => setVerifiedDrafts((current) => ({ ...current, [banner.slot]: value }))}
        onPlacement={updatePlacement}
        onNatural={setNatural}
        onBeginDrag={beginDrag}
        onMoveDrag={moveDrag}
        onEndDrag={endDrag}
        onNudge={nudge}
        onSave={() => void save()}
        onUpload={(file) => void upload(file)}
        onDownload={(format) => void download(format)}
      /> : null}
    </div>
  )
}

function EditorPanel({
  banner,
  placement,
  verified,
  logos,
  logoId,
  logoUrl,
  logoBox,
  natural,
  notice,
  message,
  error,
  saving,
  uploading,
  downloading,
  stageRef,
  onLogo,
  onVerified,
  onPlacement,
  onNatural,
  onBeginDrag,
  onMoveDrag,
  onEndDrag,
  onNudge,
  onSave,
  onUpload,
  onDownload,
}: {
  banner: ResolvedMarketingBanner
  placement: BannerPlacement
  verified: boolean
  logos: LogoChoice[]
  logoId: string
  logoUrl: string
  logoBox: { logo: { x: number; y: number; width: number; height: number } } | null
  natural: { width: number; height: number } | null
  notice: string | null
  message: string
  error: string
  saving: boolean
  uploading: boolean
  downloading: 'png' | 'jpeg' | null
  stageRef: RefObject<HTMLDivElement | null>
  onLogo: (id: string) => void
  onVerified: (value: boolean) => void
  onPlacement: (patch: Partial<BannerPlacement>) => void
  onNatural: (size: { width: number; height: number }) => void
  onBeginDrag: (event: PointerEvent<HTMLElement>, mode: DragMode) => void
  onMoveDrag: (event: PointerEvent<HTMLDivElement>) => void
  onEndDrag: (event: PointerEvent<HTMLDivElement>) => void
  onNudge: (event: KeyboardEvent<HTMLElement>, mode: DragMode) => void
  onSave: () => void
  onUpload: (file: File | undefined) => void
  onDownload: (format: 'png' | 'jpeg') => void
}) {
  const width = natural?.width ?? banner.width
  const height = natural?.height ?? banner.height
  const hiddenByPadding = logoBox != null && logoBox.logo.width === 0
  return (
    <div className="mbl-admin__editor">
      {notice ? <p className="mbl-notice" role="status">{notice}</p> : null}
      {message ? <div className="portal-alert portal-alert--success" role="status">{message}</div> : null}
      {error ? <div className="portal-alert" role="alert">{error}</div> : null}
      <div className="mbl-inline-meta">
        <span className="mbl-badge">{banner.imageSource === 'fixture' ? 'Demo template' : 'Uploaded template'}</span>
        <span className={`mbl-badge ${verified ? 'mbl-badge--verified' : 'mbl-badge--warning'}`}>{verified ? 'Verified placement' : `Unverified default · ${banner.region}`}</span>
      </div>
      <h2>{banner.slot}. {banner.headline}</h2>
      <p className="mbl-help">Drag the outline to move it. Drag a handle to resize. Arrow keys nudge the selected outline or handle. Shift nudges by 2 percent. Alt nudges by 0.1 percent.</p>
      <div className="mbl-editor-actions">
        <label className="button button--outline mbl-upload">
          {uploading ? 'Uploading…' : banner.imageSource === 'storage' ? 'Replace template image' : 'Upload template image'}
          <input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={(event) => { onUpload(event.target.files?.[0]); event.target.value = '' }} />
        </label>
        <button className="button button--primary" type="button" disabled={saving} onClick={onSave}>{saving ? 'Saving…' : 'Save this banner'}</button>
      </div>
      <div ref={stageRef} className="mbl-stage" onPointerMove={onMoveDrag} onPointerUp={onEndDrag} onPointerCancel={onEndDrag}>
        <img className="mbl-stage__image" src={banner.imageUrl} alt="" onLoad={(event) => onNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} />
        {logoBox && logoUrl ? (
          <div className="mbl-stage__logo" style={{
            left: `${(logoBox.logo.x / width) * 100}%`,
            top: `${(logoBox.logo.y / height) * 100}%`,
            width: `${(logoBox.logo.width / width) * 100}%`,
            height: `${(logoBox.logo.height / height) * 100}%`,
          }}
          >
            <img src={logoUrl} alt="" />
          </div>
        ) : null}
        <div
          className="mbl-stage__frame"
          role="application"
          tabIndex={0}
          aria-label={`Logo region, ${placement.x}% from the left and ${placement.y}% from the top, ${placement.width}% wide and ${placement.height}% tall.`}
          style={{ left: `${placement.x}%`, top: `${placement.y}%`, width: `${placement.width}%`, height: `${placement.height}%` }}
          onPointerDown={(event) => { if ((event.target as HTMLElement).dataset.handle) return; onBeginDrag(event, 'move') }}
          onKeyDown={(event) => onNudge(event, 'move')}
        >
          {HANDLES.map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              className={`mbl-handle mbl-handle--${mode}`}
              data-handle={mode}
              aria-label={label}
              onPointerDown={(event) => onBeginDrag(event, mode)}
              onKeyDown={(event) => onNudge(event, mode)}
            />
          ))}
        </div>
      </div>
      <div className="mbl-fields">
        <NumberField label="X %" value={placement.x} onChange={(value) => onPlacement({ x: value })} />
        <NumberField label="Y %" value={placement.y} onChange={(value) => onPlacement({ y: value })} />
        <NumberField label="Width %" value={placement.width} onChange={(value) => onPlacement({ width: value })} />
        <NumberField label="Height %" value={placement.height} onChange={(value) => onPlacement({ height: value })} />
        <NumberField label="Padding %" value={placement.padding} onChange={(value) => onPlacement({ padding: value })} />
        <OptionalNumberField label="Max width %" value={placement.maxLogoWidth} onChange={(value) => onPlacement({ maxLogoWidth: value })} />
        <OptionalNumberField label="Max height %" value={placement.maxLogoHeight} onChange={(value) => onPlacement({ maxLogoHeight: value })} />
      </div>
      <label className="mbl-check">
        <input type="checkbox" checked={verified} onChange={(event) => onVerified(event.target.checked)} />
        Mark this placement as verified
      </label>
      <p className="mbl-help">Leave this unchecked while the region is still an approximate default. The final artwork and exact regions are set in Phase 2.</p>
      {hiddenByPadding ? <p className="mbl-notice" role="status">Padding is larger than the placement box, so the logo is hidden.</p> : null}
      <label className="mbl-field">
        <span>Preview logo</span>
        <select value={logoId} onChange={(event) => onLogo(event.target.value)}>
          <optgroup label="Sample logos">
            {logos.filter((item) => item.kind === 'sample').map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}
          </optgroup>
          {logos.some((item) => item.kind === 'dealer') ? (
            <optgroup label="Dealer logos">
              {logos.filter((item) => item.kind === 'dealer').map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}
            </optgroup>
          ) : null}
        </select>
      </label>
      <BannerPreviewCanvas templateUrl={banner.imageUrl} logoUrl={logoUrl || null} placement={placement} label={`${banner.headline} export preview`} />
      <div className="mbl-editor-actions">
        <button className="button button--outline" type="button" disabled={!logoUrl || downloading !== null} onClick={() => onDownload('png')}>{downloading === 'png' ? 'Preparing PNG…' : 'Download PNG'}</button>
        <button className="button button--outline" type="button" disabled={!logoUrl || downloading !== null} onClick={() => onDownload('jpeg')}>{downloading === 'jpeg' ? 'Preparing JPG…' : 'Download JPG'}</button>
      </div>
    </div>
  )
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="mbl-field">
      <span>{label}</span>
      <input type="number" min={0} max={100} step={0.1} value={value} onChange={(event) => {
        const next = Number(event.target.value)
        if (Number.isFinite(next)) onChange(next)
      }}
      />
    </label>
  )
}

function OptionalNumberField({ label, value, onChange }: { label: string; value: number | null; onChange: (value: number | null) => void }) {
  return (
    <label className="mbl-field">
      <span>{label}</span>
      <input type="number" min={0.5} max={100} step={0.1} value={value ?? ''} placeholder="No cap" onChange={(event) => {
        if (event.target.value === '') onChange(null)
        else {
          const next = Number(event.target.value)
          if (Number.isFinite(next)) onChange(next)
        }
      }}
      />
    </label>
  )
}
