import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

type BillingAdmin = {
  email: string
  name: string | null
  status: 'active' | 'pending'
  accessGrantedAt: string
  invitedAt: string | null
  isAccessManager: boolean
}

async function requestAccessManagement(method: 'GET' | 'POST', body?: object) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Your session has expired. Please sign in again.')
  const response = await fetch('/api/billing-access-management', {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const result = await response.json() as { users?: BillingAdmin[]; error?: string }
  if (!response.ok) throw new Error(result.error ?? 'Billing access request failed.')
  return result.users ?? []
}

export function BillingAccessManagementPage() {
  const [users, setUsers] = useState<BillingAdmin[]>([])
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const load = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try { setUsers(await requestAccessManagement('GET')) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to load billing administrators.') }
    finally { setIsLoading(false) }
  }, [])

  useEffect(() => {
    let current = true
    void requestAccessManagement('GET').then((records) => {
      if (current) setUsers(records)
    }).catch((caught: unknown) => {
      if (current) setError(caught instanceof Error ? caught.message : 'Unable to load billing administrators.')
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
      setUsers(await requestAccessManagement('POST', { action: 'grant', email: email.trim() }))
      setSuccess(`Billing access was granted to ${email.trim().toLowerCase()}.`)
      setEmail('')
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to grant billing access.') }
    finally { setIsSaving(false) }
  }

  async function revoke(user: BillingAdmin) {
    if (!window.confirm(`Remove internal billing access for ${user.email}? Their sign-in and other roles will be preserved.`)) return
    setIsSaving(true); setError(''); setSuccess('')
    try {
      setUsers(await requestAccessManagement('POST', { action: 'revoke', email: user.email }))
      setSuccess(`Billing access was removed from ${user.email}.`)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to remove billing access.') }
    finally { setIsSaving(false) }
  }

  return <section className="page-section billing-access-page">
    <div className="page-heading"><div><span className="eyebrow">Billing · Access Management</span><h1>Internal Billing Access</h1><p>Invite School Radius staff or manage access to protected billing administration.</p></div></div>
    {error && <p className="message message--error" role="alert">{error}</p>}
    {success && <p className="message message--success" role="status">{success}</p>}
    <article className="content-card billing-access-grant">
      <div><h2>Add Internal Billing Admin</h2><p>Existing Auth users are reused. New email addresses receive a secure Supabase invitation.</p></div>
      <form onSubmit={(event) => void grant(event)}>
        <label>Email address<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@schoolradius.com" disabled={isSaving} /></label>
        <button className="button button--primary" type="submit" disabled={isSaving}>{isSaving ? 'Saving…' : 'Grant Billing Access'}</button>
      </form>
    </article>
    <article className="content-card">
      <div className="billing-section-heading"><div><span className="eyebrow">Authorized staff</span><h2>Internal Billing Admins</h2></div><button className="button button--secondary" type="button" onClick={() => void load()} disabled={isLoading || isSaving}>Refresh</button></div>
      {isLoading ? <p>Loading billing administrators…</p> : users.length === 0 ? <p>No internal billing administrators are configured.</p> : <div className="table-scroll"><table className="data-table"><thead><tr><th>User</th><th>Status</th><th>Access granted</th><th>Authority</th><th>Action</th></tr></thead><tbody>{users.map((user) => <tr key={user.email}><td><strong>{user.name || user.email}</strong>{user.name && <small>{user.email}</small>}</td><td><span className={`billing-status billing-status--${user.status === 'active' ? 'paid' : 'draft'}`}>{user.status}</span></td><td>{new Date(user.accessGrantedAt).toLocaleString()}</td><td>{user.isAccessManager ? 'Access manager' : 'Billing admin'}</td><td><button className="button button--secondary button--compact" type="button" disabled={isSaving || user.isAccessManager} title={user.isAccessManager ? 'Access-manager billing access is protected.' : undefined} onClick={() => void revoke(user)}>Remove Billing Access</button></td></tr>)}</tbody></table></div>}
    </article>
  </section>
}
