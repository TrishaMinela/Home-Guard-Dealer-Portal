import { useEffect } from 'react'

type Props = {
  originalUrl: string
  removedUrl: string
  reason: string
  busy?: boolean
  onAccept: () => void
  onKeep: () => void
  onCancel: () => void
}

export function LogoBackgroundDialog({ originalUrl, removedUrl, reason, busy = false, onAccept, onKeep, onCancel }: Props) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onCancel])

  return (
    <section className="content-card logo-background-dialog" role="dialog" aria-labelledby="logo-background-title">
      <p className="eyebrow">Preview</p>
      <h2 id="logo-background-title">Flat background removed</h2>
      <p>{reason} Nothing is saved until you choose. Interior lettering that does not touch the outer edge stays. Cancel closes this preview and does not make either version active.</p>
      <div className="logo-background-dialog__grid">
        <Preview label="Before" url={originalUrl} />
        <Preview label="After, checkerboard" url={removedUrl} checker />
        <Preview label="After, light" url={removedUrl} tone="light" />
        <Preview label="After, dark" url={removedUrl} tone="dark" />
      </div>
      <div className="page-actions">
        <button className="button button--outline" type="button" disabled={busy} onClick={onCancel}>Cancel</button>
        <button className="button button--outline" type="button" disabled={busy} onClick={onKeep}>Keep Original</button>
        <button className="button button--primary" type="button" disabled={busy} onClick={onAccept}>Accept Transparent Logo</button>
      </div>
    </section>
  )
}

function Preview({ label, url, checker, tone }: { label: string; url: string; checker?: boolean; tone?: 'light' | 'dark' }) {
  return (
    <figure className={`logo-background-preview ${checker ? 'is-checker' : ''} ${tone ? `is-${tone}` : ''}`}>
      <figcaption>{label}</figcaption>
      <img src={url} alt="" />
    </figure>
  )
}
