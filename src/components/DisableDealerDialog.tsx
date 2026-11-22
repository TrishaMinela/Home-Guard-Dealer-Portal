import { useEffect, useId, useRef, type RefObject } from 'react'
import { createPortal } from 'react-dom'

type Props = {
  open: boolean
  companyName: string
  isUpdating: boolean
  onCancel: () => void
  onConfirm: () => void
  returnFocusRef: RefObject<HTMLButtonElement | null>
}

function scrollingAncestor() {
  return document.querySelector<HTMLElement>('.portal-main')
}

export function DisableDealerDialog({ open, companyName, isUpdating, onCancel, onConfirm, returnFocusRef }: Props) {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const updatingRef = useRef(isUpdating)
  const cancelRefCallback = useRef(onCancel)

  useEffect(() => {
    updatingRef.current = isUpdating
    cancelRefCallback.current = onCancel
  }, [isUpdating, onCancel])

  useEffect(() => {
    if (!open) return
    const trigger = returnFocusRef.current
    cancelRef.current?.focus({ preventScroll: true })
    const scroller = scrollingAncestor()
    const scrollTop = scroller?.scrollTop ?? window.scrollY
    const previousBodyOverflow = document.body.style.overflow
    const pinScroll = () => {
      if (scroller && scroller.scrollTop !== scrollTop) scroller.scrollTop = scrollTop
    }
    const blockWheel = (event: WheelEvent) => event.preventDefault()
    if (scroller) scroller.addEventListener('scroll', pinScroll)
    document.addEventListener('wheel', blockWheel, { passive: false })
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (!updatingRef.current) cancelRefCallback.current()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const items = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input, select, textarea')]
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus({ preventScroll: true })
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus({ preventScroll: true })
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousBodyOverflow
      document.removeEventListener('wheel', blockWheel)
      if (scroller) {
        scroller.removeEventListener('scroll', pinScroll)
        scroller.scrollTop = scrollTop
      } else {
        window.scrollTo(0, scrollTop)
      }
      const restoreFocus = () => trigger?.focus({ preventScroll: true })
      restoreFocus()
      window.requestAnimationFrame(restoreFocus)
    }
  }, [open, returnFocusRef])

  if (!open) return null

  return createPortal(
    <div
      className="disable-dealer-modal"
      onMouseDown={(event) => {
        if (event.target !== event.currentTarget) return
        event.preventDefault()
      }}
      onClick={(event) => {
        if (isUpdating || event.target !== event.currentTarget) return
        onCancel()
      }}
    >
      <div
        ref={dialogRef}
        className="disable-dealer-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <h2 id={titleId}>Disable {companyName}?</h2>
        <p id={descriptionId}>This dealer will remain in Home Guard records, but will be marked inactive.</p>
        <div className="disable-dealer-modal__actions">
          <button ref={cancelRef} className="button button--outline" type="button" onClick={onCancel}>Cancel</button>
          <button className="button button--danger" type="button" disabled={isUpdating} onClick={onConfirm}>{isUpdating ? 'Disabling...' : 'Disable'}</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
