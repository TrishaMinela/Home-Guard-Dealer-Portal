type Props = {
  originalUrl: string
  removedUrl: string
  reason: string
  onDismiss: () => void
}

export function LogoBackgroundDialog({ originalUrl, removedUrl, reason, onDismiss }: Props) {
  return (
    <section className="content-card logo-background-dialog" role="dialog" aria-labelledby="logo-background-title">
      <p className="eyebrow">Saved</p>
      <h2 id="logo-background-title">Flat background removed</h2>
      <p>{reason} The transparent PNG is already saved as the primary logo. The untouched upload is kept. Interior lettering that does not touch the outer edge stays. Use Restore original to put the upload back.</p>
      <div className="logo-background-dialog__grid">
        <Preview label="Before" url={originalUrl} />
        <Preview label="After, checkerboard" url={removedUrl} checker />
        <Preview label="After, light" url={removedUrl} tone="light" />
        <Preview label="After, dark" url={removedUrl} tone="dark" />
      </div>
      <div className="page-actions">
        <button className="button button--primary" type="button" onClick={onDismiss}>Close</button>
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
