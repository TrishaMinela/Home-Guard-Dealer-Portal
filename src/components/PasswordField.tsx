import { useState } from 'react'

type PasswordFieldProps = {
  id: string
  label: string
  value: string
  autoComplete: string
  onChange: (value: string) => void
  disabled?: boolean
  required?: boolean
}

export function PasswordField({
  id,
  label,
  value,
  autoComplete,
  onChange,
  disabled = false,
  required = true,
}: PasswordFieldProps) {
  const [isVisible, setIsVisible] = useState(false)

  return (
    <>
      <label htmlFor={id}>{label}</label>
      <div className="password-field">
        <input
          id={id}
          type={isVisible ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          required={required}
        />
        <button
          className="password-field__toggle"
          type="button"
          aria-label={isVisible ? 'Hide password' : 'Show password'}
          aria-pressed={isVisible}
          onClick={() => setIsVisible((visible) => !visible)}
        >
          {isVisible ? (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m3 3 18 18" />
              <path d="M10.6 10.7a2 2 0 0 0 2.7 2.7" />
              <path d="M9.9 4.2A10.5 10.5 0 0 1 12 4c5.5 0 9 6 9 6a17.5 17.5 0 0 1-2.1 2.8" />
              <path d="M6.6 6.6C4.3 8.1 3 10 3 10s3.5 6 9 6a9.7 9.7 0 0 0 4.2-.9" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z" />
              <circle cx="12" cy="12" r="2.5" />
            </svg>
          )}
        </button>
      </div>
    </>
  )
}
