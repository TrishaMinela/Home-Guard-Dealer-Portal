import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

type Provider = 'opta' | 'gohighlevel' | 'custom_webhook'
type Integration = {
  id: string
  dealerId: string
  provider: Provider
  state: 'disabled' | 'test' | 'live'
  fieldMapping: Record<string, string>
  hasCredentials: boolean
  createdAt: string
  updatedAt: string
}
type AuditEntry = { id: string; provider: Provider | null; action: string; previousState: string | null; nextState: string | null; createdAt: string }
type ApiResponse = {
  integrations?: Integration[]
  auditHistory?: AuditEntry[]
  encryptionConfigured?: boolean
  notice?: string
  error?: string
}
type MappingRow = { destination: string; source: string }

const providers: Array<{ value: Provider; label: string; description: string }> = [
  { value: 'opta', label: 'Opta', description: 'Dealer lead delivery for approved Opta accounts.' },
  { value: 'gohighlevel', label: 'GoHighLevel', description: 'Future location-scoped lead delivery.' },
  { value: 'custom_webhook', label: 'Custom Webhook', description: 'Future HTTPS webhook delivery.' },
]
const sources = [
  ['customer.first_name', 'Customer first name'], ['customer.last_name', 'Customer last name'],
  ['customer.full_name', 'Customer full name'], ['customer.email', 'Customer email'],
  ['customer.phone', 'Customer phone'], ['customer.address', 'Customer address'],
  ['customer.city', 'Customer city'], ['customer.state', 'Customer state'],
  ['customer.postal_code', 'Customer ZIP'], ['dealer.id', 'Verified dealer ID'],
  ['lead.id', 'Lead ID'], ['lead.source', 'Lead source'], ['door.style', 'Door style'],
  ['door.finish', 'Door color or stain'], ['door.glass', 'Glass'], ['door.sidelites', 'Sidelites'],
  ['door.hardware', 'Hardware'], ['door.configuration_summary', 'Configuration summary'],
  ['door.pdf_quote_url', 'PDF quote link'],
] as const
const credentialFields: Record<Provider, Array<{ key: string; label: string; type?: string }>> = {
  opta: [
    { key: 'companyId', label: 'Company ID' }, { key: 'sourceId', label: 'Source ID' },
    { key: 'campaignId', label: 'Campaign ID' }, { key: 'authenticationKey', label: 'Authentication key', type: 'password' },
  ],
  gohighlevel: [
    { key: 'locationId', label: 'Location ID' },
    { key: 'privateIntegrationToken', label: 'Private integration token', type: 'password' },
  ],
  custom_webhook: [
    { key: 'endpointUrl', label: 'HTTPS webhook URL', type: 'url' },
    { key: 'authorizationHeader', label: 'Authorization value', type: 'password' },
  ],
}

function providerLabel(provider: Provider | null) {
  return providers.find((candidate) => candidate.value === provider)?.label ?? 'CRM integration'
}

function rowsFromMapping(mapping: Record<string, string>): MappingRow[] {
  const rows = Object.entries(mapping).map(([destination, source]) => ({ destination, source }))
  return rows.length ? rows : [{ destination: '', source: 'customer.full_name' }]
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
  if (!contentType.includes('application/json')) throw new Error('CRM integration settings could not be loaded. Please try again.')
  const payload = await response.json() as ApiResponse
  if (!response.ok) throw new Error(payload.error || 'CRM integration settings could not be loaded. Please try again.')
  return payload
}

export function DealerCrmIntegrations({ dealerId }: { dealerId: string }) {
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [auditHistory, setAuditHistory] = useState<AuditEntry[]>([])
  const [encryptionConfigured, setEncryptionConfigured] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null)
  const [credentials, setCredentials] = useState<Record<string, string>>({})
  const [mappingRows, setMappingRows] = useState<MappingRow[]>([{ destination: '', source: 'customer.full_name' }])

  const load = useCallback(async () => {
    try {
      const payload = await authenticatedRequest(`/api/dealer-crm-integrations?dealerId=${encodeURIComponent(dealerId)}`)
      setIntegrations(payload.integrations ?? [])
      setAuditHistory(payload.auditHistory ?? [])
      setEncryptionConfigured(payload.encryptionConfigured === true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'CRM integration settings could not be loaded. Please try again.')
    } finally { setIsLoading(false) }
  }, [dealerId])

  useEffect(() => {
    const request = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(request)
  }, [load])

  const editingIntegration = useMemo(
    () => integrations.find((integration) => integration.provider === editingProvider) ?? null,
    [editingProvider, integrations],
  )

  function beginEdit(provider: Provider) {
    const integration = integrations.find((candidate) => candidate.provider === provider)
    setEditingProvider(provider)
    setCredentials({})
    setMappingRows(rowsFromMapping(integration?.fieldMapping ?? {}))
    setError('')
    setNotice('')
  }

  function cancelEdit() {
    setEditingProvider(null)
    setCredentials({})
    setError('')
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!editingProvider || isSaving) return
    setIsSaving(true)
    setError('')
    setNotice('')
    const fieldMapping: Record<string, string> = {}
    for (const row of mappingRows) {
      const destination = row.destination.trim()
      if (!destination) continue
      if (fieldMapping[destination]) {
        setError('Each CRM destination field must be unique.')
        setIsSaving(false)
        return
      }
      fieldMapping[destination] = row.source
    }
    const credentialUpdate = Object.fromEntries(Object.entries(credentials).filter(([, value]) => value.trim()))
    try {
      const payload = await authenticatedRequest('/api/dealer-crm-integrations', {
        method: 'POST',
        body: JSON.stringify({ action: 'save', dealerId, provider: editingProvider, state: 'disabled', fieldMapping, credentials: credentialUpdate }),
      })
      setIntegrations(payload.integrations ?? [])
      setAuditHistory(payload.auditHistory ?? [])
      setEncryptionConfigured(payload.encryptionConfigured === true)
      setNotice(payload.notice ?? 'CRM integration settings saved.')
      setEditingProvider(null)
      setCredentials({})
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'CRM integration settings could not be saved. Please try again.')
    } finally { setIsSaving(false) }
  }

  return (
    <section id="crm-integrations" className="content-card dealer-management-card crm-integrations" aria-labelledby="crm-integrations-title">
      <div className="content-card__header crm-integrations__header">
        <div><p className="eyebrow">Lead delivery</p><h2 id="crm-integrations-title">CRM Integrations</h2><p>Configure dealer-specific CRM credentials and field mappings. Delivery remains disabled during setup.</p></div>
        <span className="status-badge status-badge--inactive">Delivery disabled</span>
      </div>
      {!encryptionConfigured && !isLoading && <div className="portal-alert" role="alert">Secure credential storage is not configured. Metadata can be reviewed, but credentials cannot be saved.</div>}
      {error && <div className="portal-alert" role="alert">{error}</div>}
      {notice && <div className="portal-alert portal-alert--success" role="status">{notice}</div>}
      {isLoading ? <div className="data-state">Loading CRM integrations…</div> : (
        <div className="crm-provider-grid">
          {providers.map((provider) => {
            const integration = integrations.find((candidate) => candidate.provider === provider.value)
            return <article className="crm-provider-card" key={provider.value}>
              <div className="crm-provider-card__heading"><div><h3>{provider.label}</h3><p>{provider.description}</p></div><span className={`status-badge ${integration?.state === 'live' ? 'status-badge--active' : 'status-badge--inactive'}`}>{integration ? `${integration.state.charAt(0).toUpperCase()}${integration.state.slice(1)}` : 'Not configured'}</span></div>
              <dl className="crm-provider-card__meta"><div><dt>Credentials</dt><dd>{integration?.hasCredentials ? 'Saved securely' : 'Not saved'}</dd></div><div><dt>Last updated</dt><dd>{integration ? new Date(integration.updatedAt).toLocaleString() : '—'}</dd></div></dl>
              <button className="button button--outline" type="button" onClick={() => beginEdit(provider.value)}>{integration ? 'Edit Integration' : 'Add Integration'}</button>
            </article>
          })}
        </div>
      )}

      {editingProvider && <form className="crm-integration-editor" onSubmit={(event) => void save(event)}>
        <div className="crm-integration-editor__heading"><div><p className="eyebrow">{editingIntegration ? 'Edit integration' : 'New integration'}</p><h3>{providerLabel(editingProvider)}</h3></div><button className="button button--ghost" type="button" onClick={cancelEdit}>Cancel</button></div>
        <div className="form-grid crm-integration-editor__settings"><label>Provider<input value={providerLabel(editingProvider)} disabled /></label><label>Status<select value="disabled" disabled><option value="disabled">Disabled</option><option disabled>Test — available in a future phase</option><option disabled>Live — unavailable</option></select></label></div>
        <fieldset><legend>Secure credentials</legend><p>{editingIntegration?.hasCredentials ? 'Credentials are saved. Leave every field blank to keep them, or complete all fields to rotate them.' : 'Complete all fields to save credentials securely.'}</p><div className="form-grid">
          {credentialFields[editingProvider].map((field) => <label key={field.key}>{field.label}<input type={field.type ?? 'text'} autoComplete="off" value={credentials[field.key] ?? ''} onChange={(event) => setCredentials((current) => ({ ...current, [field.key]: event.target.value }))} placeholder={editingIntegration?.hasCredentials ? 'Leave blank to keep saved value' : ''} /></label>)}
        </div></fieldset>
        <fieldset><legend>Field mappings</legend><p>Map a provider destination field to an approved HGI lead value. Provider field names must be confirmed before delivery is enabled.</p><div className="crm-mapping-list">
          {mappingRows.map((row, index) => <div className="crm-mapping-row" key={`${index}-${row.destination}`}><label>CRM destination field<input value={row.destination} maxLength={120} placeholder="Example: contact.email" onChange={(event) => setMappingRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, destination: event.target.value } : item))} /></label><label>HGI lead field<select value={row.source} onChange={(event) => setMappingRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, source: event.target.value } : item))}>{sources.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button className="button button--ghost" type="button" disabled={mappingRows.length === 1} onClick={() => setMappingRows((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</button></div>)}
        </div><button className="button button--outline" type="button" disabled={mappingRows.length >= 40} onClick={() => setMappingRows((current) => [...current, { destination: '', source: 'customer.full_name' }])}>Add Field Mapping</button></fieldset>
        <div className="crm-integration-editor__notice"><strong>No delivery will occur.</strong><span>Test and Live activation, outbound requests, and background delivery are not included in this phase.</span></div>
        <div className="page-actions"><button className="button button--outline" type="button" onClick={cancelEdit}>Cancel</button><button className="button button--primary" type="submit" disabled={isSaving || (!encryptionConfigured && Object.values(credentials).some(Boolean))}>{isSaving ? 'Saving securely…' : 'Save Disabled Integration'}</button></div>
      </form>}

      {auditHistory.length > 0 && <div className="crm-audit-history"><h3>Recent configuration history</h3><ul>{auditHistory.slice(0, 8).map((entry) => <li key={entry.id}><span><strong>{providerLabel(entry.provider)}</strong> · {entry.action.replaceAll('_', ' ')}</span><time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString()}</time></li>)}</ul></div>}
    </section>
  )
}
