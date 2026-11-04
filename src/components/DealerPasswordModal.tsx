import { useEffect, useId, useRef, useState, type FormEvent } from 'react'

type Props = {
  open: boolean
  email: string
  isSaving: boolean
  error: string
  onCancel: () => void
  onSubmit: (password: string) => void
}

export function DealerPasswordModal({ open, email, isSaving, error, onCancel, onSubmit }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const passwordInput = useRef<HTMLInputElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const descriptionId = useId()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [validation, setValidation] = useState('')

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (open && !element.open) {
      previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      element.showModal()
      document.body.classList.add('has-dialog')
      window.requestAnimationFrame(() => passwordInput.current?.focus())
    } else if (!open && element.open) element.close()
  }, [open])

  useEffect(() => () => document.body.classList.remove('has-dialog'), [])

  function close() {
    if (!isSaving) { setPassword(''); setConfirmation(''); setValidation(''); onCancel() }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (password.length < 6) { setValidation('Password must be at least 6 characters.'); return }
    if (password !== confirmation) { setValidation('Passwords do not match.'); return }
    setValidation('')
    onSubmit(password)
  }

  return <dialog ref={dialog} className="confirmation-dialog dealer-password-dialog" aria-labelledby={titleId} aria-describedby={descriptionId}
    onCancel={(event) => { event.preventDefault(); close() }}
    onClose={() => { document.body.classList.remove('has-dialog'); previousFocus.current?.focus() }}>
    <div className="confirmation-dialog__icon" aria-hidden="true">•••</div>
    <form onSubmit={submit}>
      <div className="confirmation-dialog__copy">
        <h2 id={titleId}>Set password for dealer user</h2>
        <p id={descriptionId}>Set a new Portal password. The current password cannot be viewed, and dealer access will not change.</p>
        <p className="confirmation-dialog__target">{email}</p>
        <label className="dealer-password-field"><span>New password</span><input ref={passwordInput} type="password" autoComplete="new-password" value={password} disabled={isSaving} onChange={(event) => setPassword(event.target.value)} /></label>
        <label className="dealer-password-field"><span>Confirm password</span><input type="password" autoComplete="new-password" value={confirmation} disabled={isSaving} onChange={(event) => setConfirmation(event.target.value)} /></label>
        {(validation || error) && <p className="message message--error confirmation-dialog__error" role="alert">{validation || error}</p>}
      </div>
      <div className="confirmation-dialog__actions">
        <button className="button button--outline" type="button" disabled={isSaving} onClick={close}>Cancel</button>
        <button className="button button--primary" type="submit" disabled={isSaving}>{isSaving ? 'Setting Password…' : 'Set Password'}</button>
      </div>
    </form>
  </dialog>
}
