import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ConfirmationModal } from '../components/ConfirmationModal'
import { supabase } from '../lib/supabase'

type BillingAdmin = {
  email: string
  name: string | null
  status: 'active' | 'pending'
  accessGrantedAt: string
  invitedAt: string | null
  isAccessManager: boolean
}

type BillingClient = {
  email: string
  status: 'active' | 'pending'
  role: 'viewer'
  accessGrantedAt: string
  invitedAt: string | null
}

type PendingRemoval =
  | { kind: 'internal'; user: BillingAdmin }
  | { kind: 'client'; user: BillingClient }

type AccessManagementErrorCode =
  | 'authentication_required'
  | 'permission_denied'
  | 'authorization_unavailable'
  | 'configuration_missing'
  | 'server_failure'
  | 'network_failure'

class AccessManagementError extends Error {
  readonly code: AccessManagementErrorCode
  readonly status: number | undefined

  constructor(
    message: string,
    code: AccessManagementErrorCode,
    status?: number,
  ) {
    super(message)
    this.name = 'AccessManagementError'
    this.code = code
    this.status = status
  }
}

function accessErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof AccessManagementError)) return error instanceof Error ? error.message : fallback
  if (error.code === 'authentication_required') return 'Your session has expired. Please sign in again.'
  if (error.code === 'permission_denied') return 'You do not have permission to manage billing access.'
  if (error.code === 'authorization_unavailable') return 'Billing access authorization is temporarily unavailable. Try again shortly.'
  if (error.code === 'configuration_missing') return 'Billing access management server configuration is incomplete. Contact School Radius support.'
  if (error.code === 'network_failure') return 'Unable to reach billing access management. Check your connection and try again.'
  return 'Billing access management encountered a server error. Try again shortly.'
}

async function requestAccessManagement(method: 'GET' | 'POST', body?: object) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new AccessManagementError('Authentication required.', 'authentication_required', 401)
  let response: Response
  try {
    response = await fetch('/api/billing-access-management', {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new AccessManagementError('Network request failed.', 'network_failure')
  }
  const result = await response.json() as {
    users?: BillingAdmin[]
    clientUsers?: BillingClient[]
    error?: string
    code?: AccessManagementErrorCode
  }
  if (!response.ok) {
    const fallbackCode: AccessManagementErrorCode = response.status === 401
      ? 'authentication_required'
      : response.status === 403
        ? 'permission_denied'
        : 'server_failure'
    throw new AccessManagementError(result.error ?? 'Billing access request failed.', result.code ?? fallbackCode, response.status)
  }
  return { users: result.users ?? [], clientUsers: result.clientUsers ?? [] }
}

export function BillingAccessManagementPage() {
  const [users, setUsers] = useState<BillingAdmin[]>([])
  const [clientUsers, setClientUsers] = useState<BillingClient[]>([])
  const [email, setEmail] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval | null>(null)
  const [confirmationError, setConfirmationError] = useState('')

  const load = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const result = await requestAccessManagement('GET')
      setUsers(result.users); setClientUsers(result.clientUsers)
    }
    catch (caught) { setError(accessErrorMessage(caught, 'Unable to load billing administrators.')) }
    finally { setIsLoading(false) }
  }, [])

  useEffect(() => {
    let current = true
    void requestAccessManagement('GET').then((records) => {
      if (current) { setUsers(records.users); setClientUsers(records.clientUsers) }
    }).catch((caught: unknown) => {
      if (current) setError(accessErrorMessage(caught, 'Unable to load billing administrators.'))
    }).finally(() => {
      if (current) setIsLoading(false)
    })
    return () => { current = false }
  }, [])

  async function grant(event: FormEvent) {
    event.preventDefault()
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError('Enter a valid email address.'); return }
    setIsSaving(true); setError(''); setSuccess('')
    try {
      const result = await requestAccessManagement('POST', { action: 'grant', email: email.trim() })
      setUsers(result.users); setClientUsers(result.clientUsers)
      setSuccess(`Billing access was granted to ${email.trim().toLowerCase()}.`)
      setEmail('')
    } catch (caught) { setError(accessErrorMessage(caught, 'Unable to grant billing access.')) }
    finally { setIsSaving(false) }
  }

  async function revoke(user: BillingAdmin) {
    setIsSaving(true); setError(''); setSuccess('')
    try {
      const result = await requestAccessManagement('POST', { action: 'revoke', email: user.email })
      setUsers(result.users); setClientUsers(result.clientUsers)
      setSuccess(`Billing access was removed from ${user.email}.`)
      setPendingRemoval(null)
    } catch (caught) { setConfirmationError(accessErrorMessage(caught, 'Unable to remove billing access.')) }
    finally { setIsSaving(false) }
  }

  async function grantClient(event: FormEvent) {
    event.preventDefault()
    if (!/^\S+@\S+\.\S+$/.test(clientEmail.trim())) { setError('Enter a valid billing-user email address.'); return }
    setIsSaving(true); setError(''); setSuccess('')
    try {
      const normalizedEmail = clientEmail.trim().toLowerCase()
      const result = await requestAccessManagement('POST', { action: 'grant_client', email: normalizedEmail, role: 'viewer' })
      setUsers(result.users); setClientUsers(result.clientUsers)
      setSuccess(`HGI billing access is configured for ${normalizedEmail}.`)
      setClientEmail('')
    } catch (caught) { setError(accessErrorMessage(caught, 'Unable to grant HGI billing access.')) }
    finally { setIsSaving(false) }
  }

  async function clientAction(user: BillingClient, action: 'revoke_client' | 'resend_client') {
    setIsSaving(true); setError(''); setSuccess('')
    try {
      const result = await requestAccessManagement('POST', { action, email: user.email })
      setUsers(result.users); setClientUsers(result.clientUsers)
      setSuccess(action === 'resend_client' ? `Invitation resent to ${user.email}.` : `HGI billing access removed from ${user.email}.`)
      if (action === 'revoke_client') setPendingRemoval(null)
    } catch (caught) {
      const message = accessErrorMessage(caught, 'Unable to update HGI billing access.')
      if (action === 'revoke_client') setConfirmationError(message)
      else setError(message)
    }
    finally { setIsSaving(false) }
  }

  function requestRemoval(removal: PendingRemoval) {
    setError(''); setSuccess(''); setConfirmationError(''); setPendingRemoval(removal)
  }

  function cancelRemoval() {
    if (isSaving) return
    setPendingRemoval(null); setConfirmationError('')
  }

  function confirmRemoval() {
    if (!pendingRemoval || isSaving) return
    if (pendingRemoval.kind === 'internal') void revoke(pendingRemoval.user)
    else void clientAction(pendingRemoval.user, 'revoke_client')
  }

  return <section className="page-content billing-access-page">
    <header className="page-header page-header--with-action billing-access-header"><div><span className="eyebrow">Billing · Access Management</span><h1>Billing Access</h1><p>Manage internal School Radius billing administrators and approved Home Guard billing viewers.</p></div><button className="button button--outline" type="button" onClick={() => void load()} disabled={isLoading || isSaving}>Refresh access</button></header>
    {error && <p className="message message--error" role="alert">{error}</p>}
    {success && <p className="message message--success" role="status">{success}</p>}
    <article className="content-card billing-access-card">
      <header className="billing-access-card__header"><span className="eyebrow">School Radius</span><h2>Internal Billing Access</h2><p>Grant protected billing administration without adding Home Guard, dealer, client, or access-manager privileges.</p></header>
      <div className="billing-access-card__form"><h3>Add Internal Billing Admin</h3><form onSubmit={(event) => void grant(event)}><label><span>Email address</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@schoolradius.com" disabled={isSaving} /></label><button className="button button--primary" type="submit" disabled={isSaving}>{isSaving ? 'Saving…' : 'Grant Billing Access'}</button></form></div>
      <div className="billing-access-card__list"><div className="billing-access-card__list-heading"><div><h3>Current access</h3><p>School Radius staff with internal billing privileges.</p></div><span>{users.length} {users.length === 1 ? 'user' : 'users'}</span></div>
      {isLoading ? <div className="billing-access-empty"><strong>Loading billing administrators…</strong><p>Checking current protected access.</p></div> : users.length === 0 ? <div className="billing-access-empty"><strong>No internal billing administrators</strong><p>Authorized School Radius staff will appear here after access is granted.</p></div> : <div className="table-scroll"><table className="data-table"><thead><tr><th>User</th><th>Status</th><th>Access granted</th><th>Authority</th><th>Action</th></tr></thead><tbody>{users.map((user) => <tr key={user.email}><td><strong>{user.name || user.email}</strong>{user.name && <small>{user.email}</small>}</td><td><span className={`billing-status billing-status--${user.status === 'active' ? 'paid' : 'draft'}`}>{user.status}</span></td><td>{new Date(user.accessGrantedAt).toLocaleString()}</td><td>{user.isAccessManager ? 'Access manager' : 'Billing admin'}</td><td><button className="button button--outline button--compact" type="button" disabled={isSaving || user.isAccessManager} title={user.isAccessManager ? 'Access-manager billing access is protected.' : undefined} onClick={() => requestRemoval({ kind: 'internal', user })}>Remove Billing Access</button></td></tr>)}</tbody></table></div>}</div>
    </article>
    <article className="content-card billing-access-card">
      <header className="billing-access-card__header"><span className="eyebrow">Home Guard Industries</span><h2>HGI Billing Client Access</h2><p>Invite billing viewers to the assigned HGI account and client-safe billing pages only.</p></header>
      <div className="billing-access-card__form"><h3>Invite Billing User</h3><form className="billing-access-client__form" onSubmit={(event) => void grantClient(event)}><label><span>Email address</span><input type="email" autoComplete="email" value={clientEmail} onChange={(event) => setClientEmail(event.target.value)} placeholder="billing@homeguardindustries.com" disabled={isSaving} /></label><label><span>Role</span><select value="viewer" disabled><option value="viewer">Viewer</option></select></label><button className="button button--primary" type="submit" disabled={isSaving}>{isSaving ? 'Saving…' : 'Invite Billing User'}</button></form></div>
      <div className="billing-access-card__list"><div className="billing-access-card__list-heading"><div><h3>Current access</h3><p>Approved viewers assigned to Home Guard Industries billing.</p></div><span>{clientUsers.length} {clientUsers.length === 1 ? 'user' : 'users'}</span></div>
      {isLoading ? <div className="billing-access-empty"><strong>Loading HGI billing users…</strong><p>Checking current client access.</p></div> : clientUsers.length === 0 ? <div className="billing-access-empty"><strong>No HGI billing users assigned</strong><p>Invited billing viewers will appear here with their account status.</p></div> : <div className="table-scroll"><table className="data-table"><thead><tr><th>Email</th><th>Status</th><th>Role</th><th>Access granted</th><th>Actions</th></tr></thead><tbody>{clientUsers.map((user) => <tr key={user.email}><td><strong>{user.email}</strong></td><td><span className={`billing-status billing-status--${user.status === 'active' ? 'paid' : 'draft'}`}>{user.status}</span></td><td>{user.role}</td><td>{new Date(user.accessGrantedAt).toLocaleString()}</td><td><div className="table-actions">{user.status === 'pending' && <button className="button button--outline button--compact" type="button" disabled={isSaving} onClick={() => void clientAction(user, 'resend_client')}>Resend Invite</button>}<button className="button button--outline button--compact" type="button" disabled={isSaving} onClick={() => requestRemoval({ kind: 'client', user })}>Remove Billing Access</button></div></td></tr>)}</tbody></table></div>}</div>
    </article>
    <ConfirmationModal
      open={Boolean(pendingRemoval)}
      title={pendingRemoval?.kind === 'internal' ? 'Remove billing access?' : 'Remove HGI billing access?'}
      message={pendingRemoval?.kind === 'internal'
        ? 'This user will lose internal billing access. Their sign-in and any other roles will remain unchanged.'
        : 'This user will lose access to Home Guard billing. Their Auth account and billing history will remain unchanged.'}
      target={pendingRemoval?.user.email}
      confirmLabel="Remove Access"
      confirmingLabel="Removing…"
      destructive
      isConfirming={isSaving}
      error={confirmationError}
      onCancel={cancelRemoval}
      onConfirm={confirmRemoval}
    />
  </section>
}
