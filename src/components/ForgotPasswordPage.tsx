import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { passwordResetRedirectUrl } from '../utils/passwordResetRedirect'
import { AuthBrand } from './AuthBrand'

const neutralSuccess = 'If an account exists for that email, a password reset link has been sent.'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [hasSubmitted, setHasSubmitted] = useState(false)

  async function sendResetLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSending(true)
    await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: passwordResetRedirectUrl() })
    setIsSending(false)
    setHasSubmitted(true)
  }

  return <main className="invite-page auth-page">
    <section className="invite-card auth-card" aria-live="polite">
      <AuthBrand subtitle="Secure Portal" bordered />

      <div className="invite-state">
        <p className="eyebrow">Account recovery</p>
        <h1>Forgot your password?</h1>
        <p>Enter the email address associated with your Portal account and we’ll send you a secure password reset link.</p>

        {hasSubmitted ? <div className="auth-success" role="status">
          <strong>Check your email</strong>
          <p>{neutralSuccess}</p>
        </div> : <form className="invite-form" onSubmit={(event) => void sendResetLink(event)}>
          <label htmlFor="forgot-email">Email address</label>
          <input id="forgot-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={isSending} required />
          <button className="button button--primary invite-action" type="submit" disabled={isSending}>{isSending ? 'Sending…' : 'Send reset link'}</button>
        </form>}

        <a className="auth-back-link" href="/">Back to sign in</a>
      </div>
    </section>
  </main>
}
