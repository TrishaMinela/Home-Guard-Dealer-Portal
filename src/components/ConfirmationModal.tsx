import { useEffect, useId, useRef } from 'react'

type Props = {
  open: boolean
  title: string
  message: string
  target?: string
  confirmLabel: string
  confirmingLabel?: string
  cancelLabel?: string
  destructive?: boolean
  isConfirming?: boolean
  error?: string
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmationModal({
  open,
  title,
  message,
  target,
  confirmLabel,
  confirmingLabel = 'Working…',
  cancelLabel = 'Cancel',
  destructive = false,
  isConfirming = false,
  error = '',
  onCancel,
  onConfirm,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const cancelButton = useRef<HTMLButtonElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (open && !element.open) {
      previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      element.showModal()
      document.body.classList.add('has-dialog')
      window.requestAnimationFrame(() => cancelButton.current?.focus())
    } else if (!open && element.open) {
      element.close()
    }
  }, [open])

  useEffect(() => () => document.body.classList.remove('has-dialog'), [])

  function close() {
    if (isConfirming) return
    onCancel()
  }

  return <dialog
    ref={dialog}
    className="confirmation-dialog"
    aria-labelledby={titleId}
    aria-describedby={descriptionId}
    onCancel={(event) => { event.preventDefault(); close() }}
    onClose={() => {
      document.body.classList.remove('has-dialog')
      previousFocus.current?.focus()
    }}
    onClick={(event) => {
      if (isConfirming || event.target !== event.currentTarget) return
      const rect = event.currentTarget.getBoundingClientRect()
      const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom
      if (outside) close()
    }}
  >
    <div className={`confirmation-dialog__icon${destructive ? ' confirmation-dialog__icon--danger' : ''}`} aria-hidden="true">!</div>
    <div className="confirmation-dialog__copy">
      <h2 id={titleId}>{title}</h2>
      <p id={descriptionId}>{message}</p>
      {target && <p className="confirmation-dialog__target">{target}</p>}
      {error && <p className="message message--error confirmation-dialog__error" role="alert">{error}</p>}
    </div>
    <div className="confirmation-dialog__actions">
      <button ref={cancelButton} className="button button--outline" type="button" disabled={isConfirming} onClick={close}>{cancelLabel}</button>
      <button className={`button ${destructive ? 'button--danger' : 'button--primary'}`} type="button" disabled={isConfirming} onClick={onConfirm}>{isConfirming ? confirmingLabel : confirmLabel}</button>
    </div>
  </dialog>
}
