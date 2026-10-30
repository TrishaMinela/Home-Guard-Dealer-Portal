import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { authorizedDestination } from '../utils/authorizedDestination'

type ResetStep = 'loading' | 'password' | 'success' | 'no_access' | 'access_error' | 'invalid'

function recoverySignal(): boolean {
  const search = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  return search.get('type') === 'recovery'
    || hash.get('type') === 'recovery'
    || search.has('code')
    || (hash.has('access_token') && hash.has('refresh_token'))
}

function recoveryError(): boolean {
  const search = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  return Boolean(search.get('error') || search.get('error_code') || hash.get('error') || hash.get('error_code'))
}

function clearRecoveryUrl(): void {
  window.history.replaceState({}, document.title, '/auth/reset-password')
}

export function ResetPasswordPage() {
  const hasRecoverySignal = useRef(recoverySignal())
  const recoveryEventReceived = useRef(false)
  const isUpdatingPassword = useRef(false)
  const [step, setStep] = useState<ResetStep>(() => recoveryError() ? 'invalid' : 'loading')
  const [session, setSession] = useState<Session | null>(null)
  const [destination, setDestination] = useState('/')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    let current = true

    function acceptRecoverySession(nextSession: Session | null) {
      if (!current || isUpdatingPassword.current) return
      if (!nextSession || (!hasRecoverySignal.current && !recoveryEventReceived.current)) {
        setStep('invalid')
        return
      }
      setSession(nextSession)
      setStep('password')
      clearRecoveryUrl()
    }

    if (recoveryError()) {
      clearRecoveryUrl()
      return () => { current = false }
    }

    const { data: authListener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'PASSWORD_RECOVERY') recoveryEventReceived.current = true
      if (event === 'PASSWORD_RECOVERY' || (hasRecoverySignal.current && nextSession)) acceptRecoverySession(nextSession)
    })

    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!current) return
      if (sessionError || !hasRecoverySignal.current) {
        setStep('invalid')
        return
      }
      acceptRecoverySession(data.session)
    })

    return () => {
      current = false
      authListener.subscription.unsubscribe()
    }
  }, [])

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (!session) {
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
      setError('We could not update your password. Request a new reset link and try again.')
      return
    }

    try {
      const nextDestination = await authorizedDestination(session.user.id)
      if (!nextDestination) {
        setStep('no_access')
        return
      }
      setDestination(nextDestination)
    } catch {
      setStep('access_error')
      return
    }
    setPassword('')
    setConfirmation('')
    hasRecoverySignal.current = false
    setStep('success')
  }

  return <main className="invite-page auth-page">
    <section className="invite-card auth-card" aria-live="polite">
      <div className="brand-lockup invite-brand">
        <div className="brand-mark" aria-hidden="true">HG</div>
        <div><span className="brand-name">Home Guard</span><span className="brand-subtitle">Secure Portal</span></div>
      </div>

      {step === 'loading' && <div className="invite-state"><p className="eyebrow">Secure recovery</p><h1>Verifying your reset link…</h1><p>Please wait while we securely prepare your password reset.</p></div>}

      {step === 'password' && <div className="invite-state">
        <p className="eyebrow">Account recovery</p>
        <h1>Create a new password</h1>
        <p>Choose a secure password for your Home Guard Portal account.</p>
        <form className="invite-form" onSubmit={(event) => void updatePassword(event)}>
          <label htmlFor="reset-password">New password</label>
          <input id="reset-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={isSaving} required />
          <label htmlFor="reset-password-confirmation">Confirm password</label>
          <input id="reset-password-confirmation" type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={isSaving} required />
          <p className="invite-password-note">Use at least 10 characters, including a letter and a number.</p>
          {error && <p className="message message--error" role="alert">{error}</p>}
          <button className="button button--primary invite-action" type="submit" disabled={isSaving}>{isSaving ? 'Updating…' : 'Update Password'}</button>
        </form>
      </div>}

      {step === 'success' && <div className="invite-state">
        <p className="eyebrow">Password updated</p>
        <h1>Password updated</h1>
        <p>Your password has been changed successfully.</p>
        <button className="button button--primary invite-action" type="button" onClick={() => window.location.assign(destination)}>Continue to Portal</button>
      </div>}

      {step === 'no_access' && <div className="invite-state">
        <p className="eyebrow">Password updated</p>
        <h1>Your password has been updated.</h1>
        <p>This account does not currently have authorized Portal access. Contact your Portal administrator for assistance.</p>
        <a className="button button--outline invite-action" href="/">Return to Portal Sign In</a>
      </div>}

      {step === 'access_error' && <div className="invite-state">
        <p className="eyebrow">Password updated</p>
        <h1>Your password has been updated.</h1>
        <p>We could not verify your Portal access right now. Return to sign in and try again.</p>
        <a className="button button--outline invite-action" href="/">Return to Portal Sign In</a>
      </div>}

      {step === 'invalid' && <div className="invite-state">
        <p className="eyebrow">Reset link unavailable</p>
        <h1>This password reset link is no longer valid.</h1>
        <p>It may have expired or already been used.</p>
        <a className="button button--primary invite-action" href="/auth/forgot-password">Request a new reset link</a>
        <a className="auth-back-link" href="/">Back to sign in</a>
      </div>}
    </section>
  </main>
}
