import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { HexColorPicker } from 'react-colorful'
import {
  choiceForValue,
  describeAppearanceValue,
  parseHexInput,
  resolveAppearanceValue,
  type AppearanceValue,
  type PickerChoice,
} from '../utils/doorBuilderAppearance'

type Props = {
  id: string
  label: string
  value: AppearanceValue | null
  brand: { primary: string; secondary: string }
  open: boolean
  onOpenChange: (open: boolean) => void
  onChange: (value: AppearanceValue | null) => void
}

const CHOICES: Array<{ choice: PickerChoice; label: string }> = [
  { choice: 'inherit', label: 'Default' },
  { choice: 'primary', label: 'Primary' },
  { choice: 'secondary', label: 'Secondary' },
  { choice: 'white', label: 'White' },
  { choice: 'black', label: 'Black' },
  { choice: 'custom', label: 'Custom' },
]

function choiceValue(choice: PickerChoice, currentHex: string): AppearanceValue | null {
  if (choice === 'inherit') return null
  if (choice === 'primary') return 'primary'
  if (choice === 'secondary') return 'secondary'
  if (choice === 'white') return '#ffffff'
  if (choice === 'black') return '#000000'
  return currentHex
}

function placePopover(anchor: DOMRect, width: number, height: number) {
  const margin = 8
  let left = anchor.left
  let top = anchor.bottom + margin
  if (left + width > window.innerWidth - margin) left = window.innerWidth - width - margin
  if (left < margin) left = margin
  if (top + height > window.innerHeight - margin) top = Math.max(margin, anchor.top - height - margin)
  return { top, left }
}

export function AppearanceColorControl({ id, label, value, brand, open, onOpenChange, onChange }: Props) {
  const labelId = useId()
  const dialogId = useId()
  const errorId = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const resolved = resolveAppearanceValue(value, brand)
  const pickerHex = resolved ?? brand.primary
  const [hexDraft, setHexDraft] = useState(resolved ?? '')
  const [hexError, setHexError] = useState('')
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const [placed, setPlaced] = useState(false)
  const choice = choiceForValue(value)

  useEffect(() => {
    if (document.activeElement === inputRef.current) return
    setHexDraft(resolved ?? '')
    setHexError('')
  }, [resolved, value])

  useLayoutEffect(() => {
    if (!open || !buttonRef.current || !popoverRef.current) return
    const place = () => {
      if (!buttonRef.current || !popoverRef.current) return
      const box = popoverRef.current.getBoundingClientRect()
      if (box.height < 40) return
      setPosition(placePopover(buttonRef.current.getBoundingClientRect(), box.width, box.height))
      setPlaced(true)
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  if (!open && placed) setPlaced(false)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (popoverRef.current?.contains(target) || buttonRef.current?.contains(target)) return
      onOpenChange(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open, onOpenChange])

  const close = () => {
    onOpenChange(false)
    buttonRef.current?.focus()
  }

  const applyHex = (raw: string) => {
    setHexDraft(raw)
    const parsed = parseHexInput(raw)
    if (!parsed.ok) {
      setHexError(parsed.error)
      return
    }
    setHexError('')
    onChange(parsed.hex)
  }

  const onPopoverKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close()
    }
  }

  const swatch = resolved ?? 'transparent'
  const popover = open ? createPortal(
    <div
      ref={popoverRef}
      id={dialogId}
      className="appearance-popover"
      data-placed={placed ? 'true' : 'false'}
      role="dialog"
      aria-label={`${label} color`}
      style={{ top: position.top, left: position.left }}
      onKeyDown={onPopoverKeyDown}
    >
      <div className="appearance-popover__choices" role="radiogroup" aria-label={`${label} source`}>
        {CHOICES.map((option) => (
          <button
            key={option.choice}
            type="button"
            role="radio"
            aria-checked={choice === option.choice}
            className={choice === option.choice ? 'is-selected' : ''}
            onClick={() => {
              setHexError('')
              onChange(choiceValue(option.choice, pickerHex))
              if (option.choice === 'custom') inputRef.current?.focus()
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="appearance-popover__stage" data-testid={`${id}-picker`}>
        <HexColorPicker
          color={pickerHex}
          onChange={(next) => {
            setHexError('')
            setHexDraft(next.toLowerCase())
            onChange(next.toLowerCase())
          }}
        />
        <span className="appearance-popover__preview" style={{ background: pickerHex }} aria-hidden="true" />
      </div>
      <label className="appearance-popover__hex" htmlFor={`${id}-hex`}>
        HEX
        <input
          ref={inputRef}
          id={`${id}-hex`}
          value={hexDraft}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-invalid={hexError ? true : undefined}
          aria-describedby={hexError ? errorId : undefined}
          onChange={(event) => applyHex(event.target.value)}
        />
      </label>
      {hexError && <p id={errorId} className="appearance-popover__error" role="alert">{hexError}</p>}
      <button className="button button--primary appearance-popover__done" type="button" onClick={close}>Done</button>
    </div>,
    document.body,
  ) : null

  return (
    <div className="appearance-color">
      <span id={labelId}>{label}</span>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        className="appearance-color__trigger"
        aria-labelledby={labelId}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        onClick={() => onOpenChange(!open)}
      >
        <span className={`appearance-color__swatch ${resolved ? '' : 'is-inherit'}`} style={resolved ? { background: swatch } : undefined} />
        <span>{describeAppearanceValue(value, brand)}</span>
      </button>
      {popover}
    </div>
  )
}
