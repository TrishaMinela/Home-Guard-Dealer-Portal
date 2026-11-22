import { useId, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { APPEARANCE_BLACK, APPEARANCE_WHITE, type AppearanceValue } from '../utils/doorBuilderAppearance'

type Props = {
  id: string
  label: string
  value: AppearanceValue | null
  onChange: (value: AppearanceValue | null) => void
}

const CHOICES: Array<{ id: 'black' | 'white' | 'default'; label: string; value: AppearanceValue | null }> = [
  { id: 'black', label: 'Black', value: APPEARANCE_BLACK },
  { id: 'white', label: 'White', value: APPEARANCE_WHITE },
  { id: 'default', label: 'Default', value: null },
]

function selectedChoice(value: AppearanceValue | null) {
  if (value === APPEARANCE_BLACK) return 'black'
  if (value === APPEARANCE_WHITE) return 'white'
  if (value == null) return 'default'
  return null
}

export function AppearanceTextControl({ id, label, value, onChange }: Props) {
  const labelId = useId()
  const selected = selectedChoice(value)
  const inheriting = value == null

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const current = CHOICES.findIndex((choice) => choice.id === selected)
    const start = current >= 0 ? current : 0
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft' && event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1
    const next = CHOICES[(start + direction + CHOICES.length) % CHOICES.length]
    onChange(next.value)
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-choice="${next.id}"]`)?.focus()
  }

  return (
    <div className="appearance-color">
      <span id={labelId}>{label}</span>
      <div id={id} className="appearance-color__control appearance-text" role="radiogroup" aria-labelledby={labelId} onKeyDown={onKeyDown}>
        {CHOICES.map((choice) => (
          <button
            key={choice.id}
            type="button"
            role="radio"
            data-choice={choice.id}
            aria-checked={selected === choice.id}
            className={selected === choice.id ? 'is-selected' : ''}
            onClick={() => onChange(choice.value)}
          >
            {choice.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        className={`appearance-color__default${inheriting ? ' is-inactive' : ''}`}
        aria-disabled={inheriting}
        disabled={inheriting}
        onClick={() => onChange(null)}
      >
        Default
      </button>
    </div>
  )
}
