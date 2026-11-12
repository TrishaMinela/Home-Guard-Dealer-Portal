import { useEffect, useState } from 'react'
import { placementKey, type BannerPlacement } from '../../features/marketing-banners/placement.ts'
import { renderMarketingBanner } from '../../features/marketing-banners/renderBanner.ts'

type BannerPreviewCanvasProps = {
  templateUrl: string
  logoUrl: string | null
  placement: BannerPlacement
  label: string
  canvasRef?: (canvas: HTMLCanvasElement | null) => void
}

export function BannerPreviewCanvas({ templateUrl, logoUrl, placement, label, canvasRef }: BannerPreviewCanvasProps) {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const signature = `${templateUrl}|${logoUrl ?? ''}|${placementKey(placement)}`

  useEffect(() => {
    canvasRef?.(canvas)
  }, [canvas, canvasRef])

  useEffect(() => {
    if (!canvas) return
    let cancelled = false
    void renderMarketingBanner({ canvas, templateUrl, logoUrl, placement, format: 'png' })
      .then(() => { if (!cancelled) setStatus('ready') })
      .catch((error: unknown) => {
        if (cancelled) return
        console.error('Failed to render marketing banner preview.', error)
        setStatus('error')
      })
    return () => { cancelled = true }
  }, [canvas, signature, templateUrl, logoUrl, placement])

  return (
    <div className="mbl-canvas-frame">
      <canvas ref={setCanvas} role={label ? 'img' : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : true} />
      {status === 'loading' ? <p className="mbl-canvas-status" role="status">Rendering preview…</p> : null}
      {status === 'error' ? <p className="mbl-canvas-status" role="alert">This preview could not be rendered.</p> : null}
    </div>
  )
}
