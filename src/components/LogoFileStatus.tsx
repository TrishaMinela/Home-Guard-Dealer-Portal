export type LogoFileStatusState = 'saved' | 'unsaved' | 'generating' | 'failed' | 'unavailable'

const labels: Record<LogoFileStatusState, string> = {
  saved: 'Saved',
  unsaved: 'Unsaved',
  generating: 'Generating',
  failed: 'Failed',
  unavailable: 'Unavailable',
}

export function LogoFileStatus({ state, name, detail }: { state: LogoFileStatusState; name?: string | null; detail?: string | null }) {
  const filename = name?.trim() ?? ''
  const extra = detail?.trim() ?? ''
  return (
    <p className="studio-logo__meta">
      <span className={`studio-logo__status studio-logo__status--${state}`} role="status">
        {state === 'saved' ? <span aria-hidden="true">✓ </span> : null}
        {labels[state]}
      </span>
      {filename ? <span className="studio-logo__sep" aria-hidden="true">·</span> : null}
      {filename ? <span className="studio-logo__name" title={filename}>{filename}</span> : null}
      {extra ? <span className="studio-logo__size">{extra}</span> : null}
    </p>
  )
}
