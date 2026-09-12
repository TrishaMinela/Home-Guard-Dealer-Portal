import { useEffect, useMemo, useRef, useState } from 'react'
import { getDealerVisualizerUrl } from '../config/visualizer'
import { bannerSizes, bannerTemplates } from '../features/banner-generator/bannerTemplates'
import { renderBanner } from '../features/banner-generator/bannerRenderer'
import type { DealerAccount } from '../types/account'

type MarketingToolsPageProps = {
  dealer: DealerAccount
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value)
}

export function MarketingToolsPage({ dealer }: MarketingToolsPageProps) {
  const [sizeId, setSizeId] = useState(bannerSizes[0].id)
  const [templateId, setTemplateId] = useState(bannerTemplates[0].id)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isDownloading, setIsDownloading] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const size = bannerSizes.find((item) => item.id === sizeId) ?? bannerSizes[0]
  const template = bannerTemplates.find((item) => item.id === templateId) ?? bannerTemplates[0]
  const visualizerUrl = getDealerVisualizerUrl(dealer.slug)
  const embedCode = useMemo(
    () => `<a href="${visualizerUrl}">\n  <img src="YOUR-BANNER-IMAGE-URL" alt="Design Your New Front Door">\n</a>`,
    [visualizerUrl],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let isCurrent = true
    void document.fonts.ready
      .then(async () => {
        const renderedCanvas = document.createElement('canvas')
        await renderBanner({ canvas: renderedCanvas, dealer, size, template, visualizerUrl })
        if (!isCurrent) return
        canvas.width = renderedCanvas.width
        canvas.height = renderedCanvas.height
        canvas.getContext('2d')?.drawImage(renderedCanvas, 0, 0)
      })
      .catch((renderError) => {
        if (!isCurrent) return
        console.error('Failed to render dealer banner preview.', renderError)
        setError('We could not render this banner preview. Please try another template.')
      })

    return () => { isCurrent = false }
  }, [dealer, size, template, visualizerUrl])

  async function handleDownload() {
    const canvas = canvasRef.current
    if (!canvas) return

    setError('')
    setMessage('')
    setIsDownloading(true)

    try {
      await document.fonts.ready
      await renderBanner({ canvas, dealer, size, template, visualizerUrl })
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((result) => result ? resolve(result) : reject(new Error('PNG creation failed.')), 'image/png')
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${dealer.slug}-visualizer-banner-${size.id}.png`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
      setMessage(`Your ${size.width} × ${size.height} PNG is ready.`)
    } catch (downloadError) {
      console.error('Failed to generate dealer banner PNG.', downloadError)
      setError('We could not create the PNG. Please confirm your logo is publicly accessible and try again.')
    } finally {
      setIsDownloading(false)
    }
  }

  async function handleCopy(value: string, successMessage: string) {
    setError('')
    try {
      await copyText(value)
      setMessage(successMessage)
    } catch (copyError) {
      console.error('Failed to copy banner content.', copyError)
      setError('Copying was unavailable. Please select and copy the text manually.')
    }
  }

  return (
    <div className="page-content">
      <header className="page-header">
        <p className="eyebrow">Dealer Marketing</p>
        <h1>Marketing Tools</h1>
        <p>Create website-ready graphics using your approved dealer branding.</p>
      </header>

      {message && <div className="portal-alert portal-alert--success" role="status">{message}</div>}
      {error && <div className="portal-alert" role="alert">{error}</div>}

      <section className="content-card banner-generator">
        <div className="content-card__header">
          <p className="eyebrow">Version 1</p>
          <h2>Website Banner Generator</h2>
        </div>

        <div className="banner-generator__body">
          <fieldset className="banner-control-group">
            <legend>Banner Size</legend>
            <div className="banner-size-grid">
              {bannerSizes.map((option) => (
                <label className={`banner-option ${size.id === option.id ? 'is-selected' : ''}`} key={option.id}>
                  <input type="radio" name="banner-size" value={option.id} checked={size.id === option.id} onChange={() => setSizeId(option.id)} />
                  <strong>{option.width} × {option.height}</strong>
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="banner-control-group">
            <legend>Banner Layout</legend>
            <div className="banner-template-grid">
              {bannerTemplates.map((option) => (
                <label className={`banner-option ${template.id === option.id ? 'is-selected' : ''}`} key={option.id}>
                  <input type="radio" name="banner-template" value={option.id} checked={template.id === option.id} onChange={() => setTemplateId(option.id)} />
                  <strong>{option.name}</strong>
                  <span>{option.description}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="banner-preview-heading">
            <div><p className="eyebrow">Live Preview</p><h3>{size.width} × {size.height}</h3></div>
            <button className="button button--primary" type="button" disabled={isDownloading} onClick={() => void handleDownload()}>
              {isDownloading ? 'Creating PNG...' : 'Download PNG'}
            </button>
          </div>
          <div className="banner-preview-frame">
            <canvas ref={canvasRef} aria-label={`${template.name} banner preview`} />
          </div>
        </div>
      </section>

      <section className="content-card banner-link-card">
        <div className="content-card__header"><p className="eyebrow">Destination</p><h2>Visualizer Link</h2></div>
        <div className="banner-copy-row"><code>{visualizerUrl}</code><button className="button button--outline" type="button" onClick={() => void handleCopy(visualizerUrl, 'Visualizer link copied.')}>Copy Link</button></div>
      </section>

      <section className="content-card banner-link-card">
        <div className="content-card__header"><p className="eyebrow">Website</p><h2>Embed Code</h2></div>
        <div className="banner-embed-body">
          <pre><code>{embedCode}</code></pre>
          <p>Upload your downloaded banner to your website/media library, then replace YOUR-BANNER-IMAGE-URL with the uploaded image URL.</p>
          <button className="button button--outline" type="button" onClick={() => void handleCopy(embedCode, 'Embed code copied.')}>Copy Embed Code</button>
        </div>
      </section>
    </div>
  )
}
