import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { passwordChangeError } from '../utils/passwordRules'
import { passwordResetRedirectUrl } from '../utils/passwordResetRedirect'
import { PasswordField } from './PasswordField'

type ChangePasswordFormProps = {
  email: string
}

export function ChangePasswordForm({ email }: ChangePasswordFormProps) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isSendingReset, setIsSendingReset] = useState(false)

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')
    const validation = passwordChangeError(currentPassword, password, confirmation)
    if (validation) {
      setError(validation)
      return
    }
    if (!email) {
      setError('We could not confirm the email on this account. Use the reset link instead.')
      return
    }

    setIsSaving(true)
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    })
    if (reauthError) {
      setIsSaving(false)
      setError(reauthError.code === 'invalid_credentials'
        ? 'The current password is incorrect.'
        : 'We could not confirm your current password. Please try again.')
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({ password })
    setIsSaving(false)
    if (updateError) {
      setError('We could not change your password. Please try again.')
      return
    }
    setCurrentPassword('')
    setPassword('')
    setConfirmation('')
    setMessage('Your password has been changed.')
  }

  async function sendResetLink() {
    setError('')
    setMessage('')
    if (!email) {
      setError('We could not confirm the email on this account.')
      return
    }
    setIsSendingReset(true)
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: passwordResetRedirectUrl(),
    })
    setIsSendingReset(false)
    if (resetError) {
      setError('We could not send a reset link right now. Please try again.')
      return
    }
    setMessage('A password reset link has been sent to your email.')
  }

  return (
    <div className="password-change">
      <p>Change the password for {email || 'your account'}. You will enter the current password once before the new one is saved.</p>
      <form className="password-change__form" onSubmit={(event) => void changePassword(event)}>
        <PasswordField id="current-password" label="Current password" autoComplete="current-password" value={currentPassword} onChange={setCurrentPassword} disabled={isSaving} />
        <PasswordField id="new-password" label="New password" autoComplete="new-password" value={password} onChange={setPassword} disabled={isSaving} />
        <PasswordField id="confirm-password" label="Confirm new password" autoComplete="new-password" value={confirmation} onChange={setConfirmation} disabled={isSaving} />
        <p className="invite-password-note">Use at least 10 characters, including a letter and a number.</p>
        <div aria-live="polite">
          {error && <p className="message message--error" role="alert">{error}</p>}
          {message && <p className="message message--success" role="status">{message}</p>}
        </div>
        <button className="button button--primary" type="submit" disabled={isSaving || isSendingReset}>
          {isSaving ? 'Saving...' : 'Change password'}
        </button>
      </form>
      <button className="button button--outline" type="button" onClick={() => void sendResetLink()} disabled={isSaving || isSendingReset || !email}>
        {isSendingReset ? 'Sending...' : 'Email me a reset link'}
      </button>
    </div>
  )
}
