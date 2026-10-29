import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

type InviteStep = 'loading' | 'welcome' | 'password' | 'ready' | 'existing' | 'invalid'

function invitationSignal(): boolean {
  const search = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  return search.get('type') === 'invite'
    || hash.get('type') === 'invite'
    || (hash.has('access_token') && hash.has('refresh_token'))
}

function invitationError(): boolean {
  const search = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  return Boolean(search.get('error') || search.get('error_code') || hash.get('error') || hash.get('error_code'))
}

function clearInviteUrl(): void {
  window.history.replaceState({}, document.title, '/auth/invite')
}

async function authorizedDestination(userId: string): Promise<string | null> {
  const { data: admin } = await supabase.from('home_guard_admins').select('id').eq('user_id', userId).maybeSingle()
  if (admin) return '/admin'

  const { data: billingAccounts } = await supabase.rpc('list_billing_client_accounts')
  if (billingAccounts?.length) return '/billing'

  const { data: dealer } = await supabase.from('dealer_users').select('dealer_id').eq('user_id', userId).limit(1).maybeSingle()
  return dealer ? '/dashboard' : null
}

export function InviteSetupPage() {
  const inviteSignal = useRef(invitationSignal())
  const isUpdatingPassword = useRef(false)
  const [step, setStep] = useState<InviteStep>(() => invitationError() ? 'invalid' : 'loading')
  const [session, setSession] = useState<Session | null>(null)
  const [destination, setDestination] = useState('/billing')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    let current = true

    async function handleSession(nextSession: Session | null) {
      if (!current) return
      if (isUpdatingPassword.current) return
      setSession(nextSession)
      if (!nextSession) {
        setStep('invalid')
        return
      }

      const nextDestination = await authorizedDestination(nextSession.user.id)
      if (!current) return
      setDestination(nextDestination ?? '/')
      setStep(inviteSignal.current ? 'welcome' : 'existing')
      clearInviteUrl()
    }

    if (invitationError()) {
      clearInviteUrl()
      return () => { current = false }
    }

    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) {
        if (current) setStep('invalid')
        return
      }
      void handleSession(data.session)
    })

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (nextSession) void handleSession(nextSession)
    })

    return () => {
      current = false
      authListener.subscription.unsubscribe()
    }
  }, [])

  async function completeSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (!session || !inviteSignal.current) {
      setStep('invalid')
      return
    }
    if (password.length < 10 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      setError('Use at least 10 characters, including a letter and a number.')
      return
    }
    if (password !== confirmation) {
      setError('Passwords do not match.')
      return
    }

    setIsSaving(true)
    isUpdatingPassword.current = true
    const { error: updateError } = await supabase.auth.updateUser({ password })
    isUpdatingPassword.current = false
    setIsSaving(false)
    if (updateError) {
      setError('We could not complete your account setup. Request a new invitation or try again.')
      return
    }
    const nextDestination = await authorizedDestination(session.user.id)
    setDestination(nextDestination ?? '/')
    setPassword('')
    setConfirmation('')
    inviteSignal.current = false
    setStep('ready')
  }

  function goToPortal() {
    window.location.assign(destination)
  }

  return <main className="invite-page">
    <section className="invite-card" aria-live="polite">
      <div className="brand-lockup invite-brand">
        <div className="brand-mark" aria-hidden="true">HG</div>
        <div><span className="brand-name">Home Guard</span><span className="brand-subtitle">Secure Portal</span></div>
      </div>

      {step === 'loading' && <div className="invite-state"><p className="eyebrow">Secure invitation</p><h1>Verifying your invitation…</h1><p>Please wait while we securely prepare your Portal access.</p></div>}

      {step === 'welcome' && <div className="invite-state">
        <p className="eyebrow">You've been invited</p>
        <h1>Set up your Portal access</h1>
        <p>You've been invited to access secure Home Guard Industries billing information.</p>
        <div className="invite-benefits"><span>Your account will give you access to:</span><ul><li>Billing Overview</li><li>AI Usage Charges</li><li>Billing History</li></ul></div>
        <button className="button button--primary invite-action" type="button" onClick={() => setStep('password')}>Continue</button>
      </div>}

      {step === 'password' && <div className="invite-state">
        <p className="eyebrow">Account security</p>
        <h1>Create your password</h1>
        <p>Choose a secure password to finish setting up your Home Guard Portal access.</p>
        <form className="invite-form" onSubmit={(event) => void completeSetup(event)}>
          <label htmlFor="invite-password">New password</label>
          <input id="invite-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={isSaving} required />
          <label htmlFor="invite-password-confirmation">Confirm password</label>
          <input id="invite-password-confirmation" type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={isSaving} required />
          <p className="invite-password-note">Use at least 10 characters, including a letter and a number.</p>
          {error && <p className="message message--error" role="alert">{error}</p>}
          <button className="button button--primary invite-action" type="submit" disabled={isSaving}>{isSaving ? 'Completing setup…' : 'Complete Account Setup'}</button>
        </form>
      </div>}

      {step === 'ready' && <div className="invite-state">
        <p className="eyebrow">Setup complete</p><h1>Your account is ready</h1><p>Your secure Portal access has been set up successfully.</p>
        <button className="button button--primary invite-action" type="button" onClick={goToPortal}>Go to Billing Portal</button>
      </div>}

      {step === 'existing' && <div className="invite-state">
        <p className="eyebrow">Account ready</p><h1>Your Portal account is already configured</h1><p>Continue using your existing password and authorized Portal access.</p>
        <button className="button button--primary invite-action" type="button" onClick={goToPortal}>Continue to Portal</button>
      </div>}

      {step === 'invalid' && <div className="invite-state">
        <p className="eyebrow">Invitation unavailable</p><h1>This invitation is no longer valid.</h1><p>It may have expired or already been used. Please ask your Portal administrator to send a new invitation.</p>
        <a className="button button--outline invite-action" href="/">Return to Portal Sign In</a>
      </div>}
    </section>
  </main>
}
