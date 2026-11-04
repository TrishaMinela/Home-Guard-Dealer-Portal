import { useEffect, useState, type FormEvent } from 'react'
import { ConfirmationModal } from './ConfirmationModal'
import { DealerPasswordModal } from './DealerPasswordModal'
import { supabase } from '../lib/supabase'

type DealerUser = {
  name: string
  email: string
  status: 'active' | 'pending'
  role: string
  accessGrantedAt: string
  invitedAt: string | null
  lastSignInAt: string | null
}

async function requestDealerAccess(dealerId: string, body?: object) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Your session has expired. Please sign in again.')
  const response = await fetch(body ? '/api/dealer-user-access' : `/api/dealer-user-access?dealerId=${encodeURIComponent(dealerId)}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify({ dealerId, ...body }) : undefined,
  })
  const result = await response.json() as { users?: DealerUser[]; notice?: string; warning?: string; error?: string }
  if (!response.ok) throw new Error(result.error ?? 'Dealer access request failed.')
  return { users: result.users ?? [], notice: result.notice, warning: result.warning }
}

export function DealerUserAccess({ dealerId, sectionId, canSetPassword = false }: { dealerId: string; sectionId?: string; canSetPassword?: boolean }) {
  const [users, setUsers] = useState<DealerUser[]>([])
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [pendingRemoval, setPendingRemoval] = useState<DealerUser | null>(null)
  const [pendingPasswordConfirmation, setPendingPasswordConfirmation] = useState<DealerUser | null>(null)
  const [passwordTarget, setPasswordTarget] = useState<DealerUser | null>(null)
  const [passwordError, setPasswordError] = useState('')

  useEffect(() => {
    let current = true
    void requestDealerAccess(dealerId).then((result) => {
      if (current) setUsers(result.users)
    }).catch((caught: unknown) => {
      if (current) setError(caught instanceof Error ? caught.message : 'Unable to load dealer users.')
    }).finally(() => {
      if (current) setLoading(false)
    })
    return () => { current = false }
  }, [dealerId])

  async function grant(event: FormEvent) {
    event.preventDefault()
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError('Enter a valid email address.'); return }
    setSaving(true); setError(''); setSuccess('')
    try {
      const result = await requestDealerAccess(dealerId, { action: 'grant', email: email.trim().toLowerCase() })
      setUsers(result.users); setSuccess(result.notice ?? 'Dealer access was granted.')
      if (result.warning) setError(result.warning)
      setEmail('')
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to grant dealer access.') }
    finally { setSaving(false) }
  }

  async function update(user: DealerUser, action: 'revoke' | 'resend') {
    setSaving(true); setError(''); setSuccess('')
    try {
      const result = await requestDealerAccess(dealerId, { action, email: user.email })
      setUsers(result.users); setSuccess(result.notice ?? 'Dealer access was updated.')
      if (result.warning) setError(result.warning)
      if (action === 'revoke') setPendingRemoval(null)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to update dealer access.') }
    finally { setSaving(false) }
  }

  async function setPassword(password: string) {
    if (!passwordTarget) return
    setSaving(true); setPasswordError(''); setError(''); setSuccess('')
    try {
      const result = await requestDealerAccess(dealerId, { action: 'set-password', email: passwordTarget.email, password })
      setUsers(result.users); setSuccess(result.notice ?? 'Password updated successfully.'); setPasswordTarget(null)
    } catch (caught) { setPasswordError(caught instanceof Error ? caught.message : 'Unable to update this password.') }
    finally { setSaving(false) }
  }

  return <>
    <section className="content-card billing-access-card dealer-user-access" id={sectionId}>
      <header className="billing-access-card__header"><p className="eyebrow">Dealer security</p><h2>Dealer Users</h2><p>Current users assigned to this dealer. Access managers can add existing accounts or send the secure Portal invitation to new users.</p></header>
      {error && <p className="message message--error" role="alert">{error}</p>}
      {success && <p className="message message--success" role="status">{success}</p>}
      <div className="billing-access-card__form"><h3>Add Dealer User</h3><form onSubmit={(event) => void grant(event)}><label><span>Email address</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="user@example.com" disabled={saving} /></label><button className="button button--primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add Dealer User'}</button></form></div>
      <div className="billing-access-card__list"><div className="billing-access-card__list-heading"><div><h3>Current Access</h3><p>Membership is scoped only to this dealer.</p></div><span>{users.length} {users.length === 1 ? 'user' : 'users'}</span></div>
      {loading ? <div className="billing-access-empty"><strong>Loading dealer users…</strong></div> : users.length === 0 ? <div className="billing-access-empty"><strong>No dealer users assigned</strong><p>Add an existing account or invite a new dealer user.</p></div> : <div className="table-scroll"><table className="data-table"><thead><tr><th>Name / email</th><th>Account</th><th>Role</th><th>Access granted</th><th>Last sign-in</th><th>Invitation</th><th>Actions</th></tr></thead><tbody>{users.map((user) => <tr key={user.email}><td>{user.name && <span>{user.name}</span>}<strong>{user.email}</strong></td><td><span className={`billing-status billing-status--${user.status === 'active' ? 'paid' : 'draft'}`}>{user.status}</span></td><td>{user.role.replaceAll('_', ' ')}</td><td>{new Date(user.accessGrantedAt).toLocaleString()}</td><td>{user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleString() : 'Never'}</td><td>{user.status === 'pending' ? user.invitedAt ? `Sent ${new Date(user.invitedAt).toLocaleDateString()}` : 'Pending setup' : 'Complete'}</td><td><div className="table-actions">{user.status === 'pending' && <button className="button button--outline button--compact" type="button" disabled={saving} onClick={() => void update(user, 'resend')}>Resend Invite</button>}{canSetPassword && <button className="button button--outline button--compact" type="button" disabled={saving} onClick={() => setPendingPasswordConfirmation(user)}>Set Password</button>}<button className="button button--outline button--compact" type="button" disabled={saving} onClick={() => setPendingRemoval(user)}>Remove Dealer Access</button></div></td></tr>)}</tbody></table></div>}</div>
    </section>
    <ConfirmationModal open={Boolean(pendingRemoval)} title="Remove dealer access?" message="This user will lose access to this dealer. Their sign-in and any other legitimate roles will remain unchanged." target={pendingRemoval?.email} confirmLabel="Remove Access" confirmingLabel="Removing…" destructive isConfirming={saving} onCancel={() => { if (!saving) setPendingRemoval(null) }} onConfirm={() => { if (pendingRemoval) void update(pendingRemoval, 'revoke') }} />
    <ConfirmationModal open={Boolean(pendingPasswordConfirmation)} title="Change dealer user password?" message="This replaces the user’s current Portal password. Their dealer access and other account permissions will remain unchanged." target={pendingPasswordConfirmation?.email} confirmLabel="Continue" onCancel={() => setPendingPasswordConfirmation(null)} onConfirm={() => { setPasswordTarget(pendingPasswordConfirmation); setPendingPasswordConfirmation(null); setPasswordError('') }} />
    {passwordTarget && <DealerPasswordModal open email={passwordTarget.email} isSaving={saving} error={passwordError} onCancel={() => { setPasswordTarget(null); setPasswordError('') }} onSubmit={(password) => void setPassword(password)} />}
  </>
}
