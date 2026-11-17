type Props = {
  originalUrl: string
  removedUrl: string
  reason: string
  onAccept: () => void
  onKeep: () => void
}

export function LogoBackgroundDialog({ originalUrl, removedUrl, reason, onAccept, onKeep }: Props) {
  return (
    <section className="content-card logo-background-dialog" role="dialog" aria-labelledby="logo-background-title">
      <p className="eyebrow">Optional</p>
      <h2 id="logo-background-title">Remove the flat background?</h2>
      <p>{reason} Interior lettering that does not touch the outer edge is kept. Nothing is saved until you choose.</p>
      <div className="logo-background-dialog__grid">
        <Preview label="Before" url={originalUrl} />
        <Preview label="After, checkerboard" url={removedUrl} checker />
        <Preview label="After, light" url={removedUrl} tone="light" />
        <Preview label="After, dark" url={removedUrl} tone="dark" />
      </div>
      <div className="page-actions">
        <button className="button button--outline" type="button" onClick={onKeep}>Keep Original</button>
        <button className="button button--primary" type="button" onClick={onAccept}>Accept transparent PNG</button>
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
