import { useCallback, useEffect, useId, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { ConfirmationModal } from './ConfirmationModal'
import { DealerCardIcon, DealerOutlineIcon } from './DealerOutlineIcon'
import { explainPreviewConfiguration, previewConfigurationNotice } from '../utils/previewConfiguration'

type WebhookState = {
  status: 'configured' | 'not_configured'
  maskedUrl: string | null
  updatedAt: string | null
  lastSuccessAt: string | null
  lastSuccessHttpStatus: number | null
  lastFailureAt: string | null
  lastFailureHttpStatus: number | null
  lastTestAt: string | null
  lastTestHttpStatus: number | null
}
type AuditEntry = { id: string; action: string; maskedUrl: string | null; httpStatus: number | null; testSubmissionId?: string | null; createdAt: string }
type SampleContact = { fullName: string; firstName: string; lastName: string; email: string; phone: string; postalCode: string }
type FailureRow = { id: string; submissionId: string; attemptNumber: number; httpStatus: number | null; attemptedAt: string; canRetry: boolean; blockedReason: string | null }
type ApiResponse = {
  encryptionConfigured?: boolean
  webhook?: WebhookState
  audit?: AuditEntry[]
  failures?: FailureRow[]
  sampleContact?: SampleContact
  sampleDoor?: Record<string, string>
  sampleNote?: string
  notice?: string
  error?: string
  test?: { accepted: boolean; httpStatus: number | null; testedAt?: string; message: string }
}
const defaultContact: SampleContact = { fullName: 'Trisha Sumiran', firstName: 'Trisha', lastName: 'Sumiran', email: 'Trisha.byu@gmail.com', phone: '8083934057', postalCode: '91762' }
type Preview = { encryptionConfigured: boolean; webhook: WebhookState; audit?: AuditEntry[] }

const emptyWebhook: WebhookState = {
  status: 'not_configured',
  maskedUrl: null,
  updatedAt: null,
  lastSuccessAt: null,
  lastSuccessHttpStatus: null,
  lastFailureAt: null,
  lastFailureHttpStatus: null,
  lastTestAt: null,
  lastTestHttpStatus: null,
}

function formatWhen(value: string | null, httpStatus: number | null) {
  if (!value) return '—'
  const when = new Date(value).toLocaleString()
  return httpStatus ? `${when} · HTTP ${httpStatus}` : when
}

async function authenticatedRequest(url: string, options?: RequestInit): Promise<ApiResponse> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Your Portal session has expired. Sign in again.')
  const response = await fetch(url, {
    ...options,
    headers: { ...(options?.body ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${token}` },
  })
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) throw new Error('Door Builder webhook settings could not be loaded. Please try again.')
  const payload = await response.json() as ApiResponse
  if (!response.ok) throw new Error(payload.error || 'Door Builder webhook settings could not be loaded. Please try again.')
  return payload
}

export function DoorBuilderLeadWebhook({ dealerId, preview }: { dealerId: string; preview?: Preview }) {
  const fixture = import.meta.env.DEV ? preview : undefined
  const warningId = useId()
  const [webhook, setWebhook] = useState<WebhookState>(fixture?.webhook ?? emptyWebhook)
  const [audit, setAudit] = useState<AuditEntry[]>(fixture?.audit ?? [])
  const [encryptionConfigured, setEncryptionConfigured] = useState(fixture?.encryptionConfigured ?? false)
  const [draft, setDraft] = useState('')
  const [isLoading, setIsLoading] = useState(!fixture)
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [testMessage, setTestMessage] = useState('')
  const [contact, setContact] = useState<SampleContact>(defaultContact)
  const [doorFields, setDoorFields] = useState<Record<string, string>>({})
  const [sampleNote, setSampleNote] = useState('TEST LEAD — NOT A REAL CUSTOMER')
  const [failures, setFailures] = useState<FailureRow[]>([])
  const [confirmTest, setConfirmTest] = useState(false)
  const [urlFocused, setUrlFocused] = useState(false)
  const [editingSample, setEditingSample] = useState(false)
  const [payloadOpen, setPayloadOpen] = useState(false)

  const apply = useCallback((payload: ApiResponse) => {
    if (payload.webhook) setWebhook(payload.webhook)
    if (payload.audit) setAudit(payload.audit)
    if (payload.failures) setFailures(payload.failures)
    if (payload.sampleContact) setContact(payload.sampleContact)
    if (payload.sampleDoor) setDoorFields(payload.sampleDoor)
    if (payload.sampleNote) setSampleNote(payload.sampleNote)
    setEncryptionConfigured(payload.encryptionConfigured === true)
  }, [])

  const load = useCallback(async () => {
    if (fixture) return
    try {
      apply(await authenticatedRequest(`/api/dealer-door-builder-webhook?dealerId=${encodeURIComponent(dealerId)}`))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Door Builder webhook settings could not be loaded. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }, [apply, dealerId, fixture])

  useEffect(() => {
    const request = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(request)
  }, [load])

  async function save(event: FormEvent) {
    event.preventDefault()
    if (isSaving || fixture || !draft.trim()) return
    setIsSaving(true)
    setError('')
    setNotice('')
    setTestMessage('')
    try {
      const payload = await authenticatedRequest('/api/dealer-door-builder-webhook', {
        method: 'POST',
        body: JSON.stringify({ action: 'save', dealerId, webhookUrl: draft }),
      })
      apply(payload)
      setDraft('')
      setNotice(payload.notice ?? 'Door Builder webhook saved.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Door Builder webhook settings could not be saved. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  async function testConnection() {
    if (isTesting || webhook.status !== 'configured' || fixture) return
    setIsTesting(true)
    setError('')
    setNotice('')
    setTestMessage('')
    try {
      const payload = await authenticatedRequest('/api/dealer-door-builder-webhook', {
        method: 'POST',
        body: JSON.stringify({ action: 'test', dealerId, confirm: true, contact }),
      })
      apply(payload)
      const when = payload.test?.testedAt ? ` Sent at ${new Date(payload.test.testedAt).toLocaleString()}.` : ''
      const status = payload.test?.httpStatus ? ` HTTP ${payload.test.httpStatus}.` : ''
      setTestMessage(`${payload.test?.message ?? 'The connection test finished.'}${status}${when}`)
      setConfirmTest(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The connection test could not be completed.')
    } finally {
      setIsTesting(false)
    }
  }

  async function remove() {
    if (isRemoving || fixture) return
    setIsRemoving(true)
    setError('')
    setNotice('')
    try {
      const payload = await authenticatedRequest('/api/dealer-door-builder-webhook', {
        method: 'POST',
        body: JSON.stringify({ action: 'remove', dealerId, confirm: true }),
      })
      apply(payload)
      setDraft('')
      setTestMessage('')
      setConfirmRemove(false)
      setNotice(payload.notice ?? 'Door Builder webhook removed.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The webhook could not be removed.')
    } finally {
      setIsRemoving(false)
    }
  }

  async function retry(submissionId: string) {
    if (isSaving || isTesting || isRemoving || fixture) return
    setIsTesting(true)
    setError('')
    setNotice('')
    try {
      const payload = await authenticatedRequest('/api/dealer-door-builder-webhook', {
        method: 'POST',
        body: JSON.stringify({ action: 'retry', dealerId, submissionId }),
      })
      apply(payload)
      setNotice(payload.notice ?? 'Retry finished.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The delivery could not be retried.')
    } finally {
      setIsTesting(false)
    }
  }

  const configured = webhook.status === 'configured'
  const busy = isSaving || isTesting || isRemoving
  const shownError = explainPreviewConfiguration(error)
  const previewGap = shownError === previewConfigurationNotice
  const showingMask = !urlFocused && !draft && configured && !!webhook.maskedUrl
  const urlValue = showingMask ? webhook.maskedUrl ?? '' : draft

  async function copyMasked() {
    if (!webhook.maskedUrl) return
    try {
      await navigator.clipboard.writeText(webhook.maskedUrl)
      setNotice('Copied the masked webhook address.')
    } catch {
      setNotice('The masked address is shown in the field.')
    }
  }

  return (
    <div className="door-builder-webhook content-card" id="door-builder-lead-webhook">
      <div className="dealer-section-header door-builder-webhook__heading">
        <DealerCardIcon name="webhook" />
        <div className="dealer-section-header__copy">
          <h3>Lead Webhook</h3>
          <p>Manage dealer lead delivery, connection testing and recent activity.</p>
        </div>
        <span className={`status-badge dd-status ${configured ? 'status-badge--active' : 'status-badge--inactive'}`}>{configured ? 'Configured' : 'Not Configured'}</span>
      </div>
      {!encryptionConfigured && !isLoading && !previewGap && !error && <div className="portal-alert" role="status">Secure webhook storage is not configured. A webhook cannot be saved until the server encryption key is available.</div>}
      {shownError && <div className="portal-alert" role={previewGap ? 'status' : 'alert'}>{shownError}</div>}
      {notice && <div className="portal-alert portal-alert--success" role="status">{notice}</div>}
      {isLoading ? <div className="data-state">Loading Door Builder webhook…</div> : (
        <>
          <div className="door-builder-webhook__columns">
            <section className="door-builder-webhook__panel">
              <div className="door-builder-webhook__panel-head">
                <div>
                  <h4>Webhook Connection</h4>
                  <p>Dealer webhook destination. Home Guard master routing remains separate.</p>
                </div>
                <span className="dd-chip">Zapier</span>
              </div>
              <form className="door-builder-webhook__main" onSubmit={(event) => void save(event)}>
                <label htmlFor={`${warningId}-url`}>Webhook URL
                  <span className="door-builder-webhook__url">
                    <input id={`${warningId}-url`} type="text" inputMode="url" autoComplete="off" spellCheck={false} maxLength={200} value={urlValue} placeholder="https://hooks.zapier.com/hooks/catch/…/…/" onFocus={(event) => { setUrlFocused(true); if (!draft && webhook.maskedUrl && event.currentTarget.value === webhook.maskedUrl) event.currentTarget.value = '' }} onBlur={() => setUrlFocused(false)} onChange={(event) => setDraft(event.target.value === webhook.maskedUrl ? '' : event.target.value)} />
                    <button className="door-builder-webhook__copy" type="button" aria-label="Copy masked webhook" disabled={!webhook.maskedUrl} onClick={() => void copyMasked()}>
                      <DealerOutlineIcon name="copy" />
                    </button>
                  </span>
                </label>
                <p className="door-builder-webhook__hint">Saved addresses are masked for security. Paste a Catch Hook URL to save or replace it. Saved webhook: {configured ? webhook.maskedUrl : 'Not Configured'}.</p>
                <div className="door-builder-webhook__actions">
                  <button className="button button--primary" type="submit" disabled={busy || !encryptionConfigured || !draft.trim()}>{isSaving ? 'Saving securely…' : 'Save Webhook'}</button>
                  <button className="button button--outline" type="button" disabled={busy || !configured} aria-describedby={warningId} onClick={() => setConfirmTest(true)}>{isTesting ? 'Testing…' : 'Test Connection'}</button>
                  <a className="button button--outline" href="#door-builder-webhook-history">View Recent Leads</a>
                  <button className="button button--outline door-builder-webhook__remove" type="button" disabled={busy || !configured} onClick={() => setConfirmRemove(true)}>Remove Webhook</button>
                </div>
                <dl className="door-builder-webhook__stats">
                  <div><dt>Last Received</dt><dd>{formatWhen(webhook.lastSuccessAt, webhook.lastSuccessHttpStatus)}</dd></div>
                  <div><dt>Last Connection Test</dt><dd>{formatWhen(webhook.lastTestAt, webhook.lastTestHttpStatus)}</dd></div>
                  <div><dt>Last Failed Delivery</dt><dd>{formatWhen(webhook.lastFailureAt, webhook.lastFailureHttpStatus)}</dd></div>
                </dl>
              </form>
            </section>
            <section className="door-builder-webhook__panel door-builder-webhook__sample" id="door-builder-webhook-payload">
              <div className="door-builder-webhook__panel-head">
                <div>
                  <h4>Sample Lead</h4>
                  <p>Preview the payload used to test your dealer webhook. It is not saved as a Portal lead and is not sent to the Home Guard master webhook.</p>
                </div>
                <span className="dd-chip">Test Data</span>
              </div>
              <dl className="door-builder-webhook__summary">
                <div><dt>Name</dt><dd>{contact.fullName || '—'}</dd></div>
                <div><dt>Email</dt><dd>{contact.email || '—'}</dd></div>
                <div><dt>ZIP Code</dt><dd>{contact.postalCode || '—'}</dd></div>
                <div><dt>Door Configuration</dt><dd>Included in payload</dd></div>
              </dl>
              {editingSample && (
                <div className="form-grid">
                  {([
                    ['fullName', 'Name'], ['firstName', 'First Name'], ['lastName', 'Last Name'],
                    ['email', 'Email'], ['phone', 'Phone'], ['postalCode', 'ZIP Code'],
                  ] as const).map(([key, label]) => (
                    <label key={key}>{label}<input value={contact[key]} onChange={(event) => setContact((current) => ({ ...current, [key]: event.target.value }))} /></label>
                  ))}
                  {Object.entries(doorFields).map(([key, value]) => (
                    <label key={key}>{key.replaceAll('_', ' ')}<input value={value} onChange={(event) => setDoorFields((current) => ({ ...current, [key]: event.target.value }))} /></label>
                  ))}
                  <label>Test notes<textarea value={sampleNote} onChange={(event) => setSampleNote(event.target.value)} /></label>
                </div>
              )}
              <div className="door-builder-webhook__sample-actions">
                <button className="button button--outline" type="button" onClick={() => setEditingSample((current) => !current)}>{editingSample ? 'Done Editing' : 'Edit Sample Lead'}</button>
                <button className="dd-text-link" type="button" onClick={() => setPayloadOpen((current) => !current)}>
                  View Full Payload
                  <DealerOutlineIcon name="external" />
                </button>
              </div>
              {payloadOpen && (
                <dl className="door-builder-webhook__meta" id="door-builder-webhook-fields">
                  {Object.entries(doorFields).map(([key, value]) => <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd>{value}</dd></div>)}
                  <div><dt>notes</dt><dd>{sampleNote}</dd></div>
                </dl>
              )}
            </section>
          </div>
          <p className="door-builder-webhook__warning" id={warningId}>Testing a webhook may trigger an actual Zap, including emails and Google Sheets rows. A successful HTTP response confirms receipt by Zapier, not the completion of subsequent workflow steps.</p>
          {testMessage && <p className="door-builder-webhook__result" role="status">{testMessage}</p>}
          <div id="door-builder-webhook-history">
            {failures.length > 0 && <div className="door-builder-webhook__audit"><h4>Failed deliveries</h4><ul>{failures.map((row) => <li key={row.id}><span><strong>Attempt {row.attemptNumber}</strong>{row.httpStatus ? ` · HTTP ${row.httpStatus}` : ''}{row.blockedReason ? ` · ${row.blockedReason}` : ''}</span>{row.canRetry ? <button className="button button--outline" type="button" disabled={busy} onClick={() => void retry(row.submissionId)}>Retry</button> : null}</li>)}</ul><p className="door-builder-webhook__hint">A successful delivery is never sent again. Customer submission does not automatically retry a failed dealer copy.</p></div>}
            {audit.length > 0 && <div className="door-builder-webhook__audit"><h4>Webhook history</h4><ul>{audit.slice(0, 6).map((entry) => <li key={entry.id}><span><strong>{entry.action}</strong>{entry.maskedUrl ? ` · ${entry.maskedUrl}` : ''}{entry.httpStatus ? ` · HTTP ${entry.httpStatus}` : ''}{entry.testSubmissionId ? ` · ${entry.testSubmissionId}` : ''}</span><time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString()}</time></li>)}</ul></div>}
          </div>
        </>
      )}
      <ConfirmationModal
        open={confirmRemove}
        title="Remove Door Builder webhook?"
        message="Door Builder will stop sending this dealer a separate copy of new leads. Home Guard master delivery is not changed."
        target={webhook.maskedUrl ?? undefined}
        confirmLabel="Remove Webhook"
        confirmingLabel="Removing…"
        destructive
        isConfirming={isRemoving}
        onCancel={() => { if (!isRemoving) setConfirmRemove(false) }}
        onConfirm={() => void remove()}
      />
      <ConfirmationModal
        open={confirmTest}
        title="Send sample lead?"
        message="Zapier may run the full Zap, including emails and Google Sheets. This sample is not saved as a Portal lead and is not sent to the Home Guard master webhook."
        target={`${contact.fullName} · ${contact.email}`}
        confirmLabel="Send Sample Lead"
        confirmingLabel="Sending…"
        isConfirming={isTesting}
        onCancel={() => { if (!isTesting) setConfirmTest(false) }}
        onConfirm={() => void testConnection()}
      />
    </div>
  )
}
