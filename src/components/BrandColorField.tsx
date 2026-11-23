import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { HexColorPicker } from 'react-colorful'
import { parseHexInput } from '../utils/doorBuilderAppearance'
import '../styles/appearanceControls.css'

type Props = {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
}

const PRESETS = ['#ffffff', '#000000', '#235176', '#8ebb53', '#0d666c']

export function BrandColorField({ id, label, value, onChange }: Props) {
  const dialogId = useId()
  const errorId = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [hexDraft, setHexDraft] = useState(value)
  const [hexError, setHexError] = useState('')
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const [placed, setPlaced] = useState(false)
  const pickerHex = /^#[0-9a-f]{6}$/i.test(value) ? value : '#235176'

  useLayoutEffect(() => {
    if (!open || !buttonRef.current || !popoverRef.current) return
    const place = () => {
      if (!buttonRef.current || !popoverRef.current) return
      const anchor = buttonRef.current.getBoundingClientRect()
      const box = popoverRef.current.getBoundingClientRect()
      const margin = 8
      let left = anchor.left
      let top = anchor.bottom + margin
      if (left + box.width > window.innerWidth - margin) left = window.innerWidth - box.width - margin
      if (top + box.height > window.innerHeight - margin) top = Math.max(margin, anchor.top - box.height - margin)
      setPosition({ top, left })
      setPlaced(true)
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (popoverRef.current?.contains(target) || buttonRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const apply = (next: string) => {
    setHexDraft(next)
    const parsed = parseHexInput(next)
    if (!parsed.ok) {
      setHexError(parsed.error)
      return
    }
    setHexError('')
    onChange(parsed.hex)
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      buttonRef.current?.focus()
    }
  }

  const popover = open ? createPortal(
    <div ref={popoverRef} id={dialogId} className="appearance-popover" data-placed={placed ? 'true' : 'false'} role="dialog" aria-label={`${label} color`} style={{ top: position.top, left: position.left }} onKeyDown={onKeyDown}>
      <div className="appearance-popover__choices" role="group" aria-label={`${label} presets`}>
        {PRESETS.map((preset) => (
          <button key={preset} type="button" className={value.toLowerCase() === preset ? 'is-selected' : ''} onClick={() => apply(preset)}>{preset === '#ffffff' ? 'White' : preset === '#000000' ? 'Black' : preset}</button>
        ))}
      </div>
      <div className="appearance-popover__stage">
        <HexColorPicker color={pickerHex} onChange={(next) => apply(next.toLowerCase())} />
        <span className="appearance-popover__preview" style={{ background: pickerHex }} aria-hidden="true" />
      </div>
      <label className="appearance-popover__hex" htmlFor={`${id}-hex`}>
        HEX
        <input id={`${id}-hex`} value={hexDraft} spellCheck={false} aria-invalid={hexError ? true : undefined} aria-describedby={hexError ? errorId : undefined} onChange={(event) => apply(event.target.value)} />
      </label>
      {hexError && <p id={errorId} className="appearance-popover__error" role="alert">{hexError}</p>}
      <button className="button button--primary appearance-popover__done" type="button" onClick={() => setOpen(false)}>Done</button>
    </div>,
    document.body,
  ) : null

  return (
    <div className="appearance-color studio-brand__color">
      <span>{label}</span>
      <button ref={buttonRef} id={id} type="button" className="appearance-color__trigger" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? dialogId : undefined} onClick={() => { setHexDraft(value); setHexError(''); setOpen((current) => !current) }}>
        <span className="appearance-color__swatch" style={{ background: pickerHex }} />
        <span>{value || 'Choose a color'}</span>
      </button>
      {popover}
    </div>
  )
}
