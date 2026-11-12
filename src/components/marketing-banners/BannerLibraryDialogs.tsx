import { useEffect, useId, useRef } from 'react'
import { Link } from 'react-router-dom'
import type { ResolvedMarketingBanner } from '../../features/marketing-banners/catalog.ts'
import type { DealerLogoVariant } from '../../features/marketing-banners/logos.ts'
import { BannerPreviewCanvas } from './BannerPreviewCanvas'

type SharedDialogProps = {
  banner: ResolvedMarketingBanner | null
  onClose: () => void
}

function useBannerDialog(open: boolean) {
  const dialog = useRef<HTMLDialogElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (open && !element.open) {
      element.showModal()
      window.requestAnimationFrame(() => closeButton.current?.focus())
    } else if (!open && element.open) {
      element.close()
    }
  }, [open])
  return { dialog, closeButton }
}

function ManagementLink({ href, label }: { href: string; label: string }) {
  if (href.startsWith('/')) return <Link className="button button--outline" to={href}>{label}</Link>
  return <a className="button button--outline" href={href}>{label}</a>
}

export function BannerPreviewDialog({
  banner,
  logoUrl,
  onClose,
  onCustomize,
  onDownload,
  downloading,
}: SharedDialogProps & {
  logoUrl: string | null
  onCustomize: () => void
  onDownload: () => void
  downloading: boolean
}) {
  const { dialog, closeButton } = useBannerDialog(Boolean(banner))
  const titleId = useId()
  return (
    <dialog ref={dialog} className="mbl-dialog" aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose() }} onClose={onClose}>
      {banner ? (
        <>
          <div className="mbl-dialog__header">
            <p className="eyebrow">Banner {banner.slot}</p>
            <h2 id={titleId}>{banner.headline}</h2>
            <p className="mbl-help">{banner.placementLabel}. Demo artwork is labeled until the final template is uploaded.</p>
          </div>
          <div className="mbl-dialog__body">
            <BannerPreviewCanvas templateUrl={banner.imageUrl} logoUrl={logoUrl} placement={banner.placement} label={`${banner.headline} preview`} />
            <div className="mbl-dialog__actions">
              <button className="button button--primary" type="button" onClick={onCustomize}>Customize Banner</button>
              <button className="button button--outline" type="button" disabled={downloading || !logoUrl} onClick={onDownload}>{downloading ? 'Preparing PNG…' : 'Download'}</button>
              <button ref={closeButton} className="button button--outline" type="button" onClick={onClose}>Close</button>
            </div>
          </div>
        </>
      ) : null}
    </dialog>
  )
}

export function BannerCustomizeDialog({
  banner,
  variants,
  logoId,
  onLogoId,
  onClose,
  onDownload,
  downloading,
  logoManagementHref,
  logoManagementLabel,
}: SharedDialogProps & {
  variants: DealerLogoVariant[]
  logoId: string | null
  onLogoId: (id: string) => void
  onDownload: (format: 'png' | 'jpeg') => void
  downloading: 'png' | 'jpeg' | null
  logoManagementHref: string
  logoManagementLabel: string
}) {
  const { dialog, closeButton } = useBannerDialog(Boolean(banner))
  const titleId = useId()
  const selected = variants.find((item) => item.id === logoId) ?? variants[0] ?? null
  return (
    <dialog ref={dialog} className="mbl-dialog" aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose() }} onClose={onClose}>
      {banner ? (
        <>
          <div className="mbl-dialog__header">
            <p className="eyebrow">Customize banner {banner.slot}</p>
            <h2 id={titleId}>{banner.headline}</h2>
            <p className="mbl-help">The logo keeps its proportions, colors, and transparency. The download uses the same placement as this preview.</p>
          </div>
          <div className="mbl-dialog__body">
            {variants.length === 0 ? (
              <div className="mbl-empty">
                <p>This dealership does not have a logo yet. Add one through the existing logo workflow, then return here to generate the banner.</p>
                <ManagementLink href={logoManagementHref} label={logoManagementLabel} />
              </div>
            ) : (
              <fieldset className="mbl-logo-list">
                <legend>Logo</legend>
                {variants.map((variant) => (
                  <label className={`mbl-logo-option${selected?.id === variant.id ? ' is-selected' : ''}`} key={variant.id}>
                    <input type="radio" name={`banner-logo-${banner.slot}`} value={variant.id} checked={selected?.id === variant.id} onChange={() => onLogoId(variant.id)} />
                    <span className="mbl-logo-swatch"><img src={variant.url} alt="" /></span>
                    <span><strong>{variant.label}</strong>{variant.description}</span>
                  </label>
                ))}
              </fieldset>
            )}
            <BannerPreviewCanvas
              templateUrl={banner.imageUrl}
              logoUrl={selected?.url ?? null}
              placement={banner.placement}
              label={`${banner.headline} with the selected logo`}
            />
            <p className="mbl-help">{banner.placementLabel}. {banner.width} × {banner.height} template.</p>
            <div className="mbl-dialog__actions">
              <button className="button button--primary" type="button" disabled={!selected || downloading !== null} onClick={() => onDownload('png')}>{downloading === 'png' ? 'Preparing PNG…' : 'Download PNG'}</button>
              <button className="button button--outline" type="button" disabled={!selected || downloading !== null} onClick={() => onDownload('jpeg')}>{downloading === 'jpeg' ? 'Preparing JPG…' : 'Download JPG'}</button>
              <button ref={closeButton} className="button button--outline" type="button" onClick={onClose}>Close</button>
            </div>
          </div>
        </>
      ) : null}
    </dialog>
  )
}
