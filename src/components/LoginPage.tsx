import { useState, type FormEvent } from 'react'

type LoginPageProps = {
  email: string
  password: string
  error: string
  isSigningIn: boolean
  onEmailChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

export function LoginPage({
  email,
  password,
  error,
  isSigningIn,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}: LoginPageProps) {
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            HG
          </div>
          <div>
            <span className="brand-name">Home Guard</span>
            <span className="brand-subtitle">Dealer Portal</span>
          </div>
        </div>

        <div className="login-card__intro">
          <p className="eyebrow">Dealer access</p>
          <h1>Welcome back</h1>
          <p>Sign in to continue to your Home Guard dealer portal.</p>
        </div>

        <form className="login-form" onSubmit={onSubmit}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            required
          />

          <label htmlFor="password">Password</label>
          <div className="password-field">
            <input
              id="password"
              type={isPasswordVisible ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              required
            />
            <button
              className="password-field__toggle"
              type="button"
              aria-label={isPasswordVisible ? 'Hide password' : 'Show password'}
              aria-pressed={isPasswordVisible}
              onClick={() => setIsPasswordVisible((visible) => !visible)}
            >
              {isPasswordVisible ? (
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

          <div className="form-message" aria-live="polite">
            {error && <p className="message message--error">{error}</p>}
          </div>

          <button
            className="button button--primary button--full"
            type="submit"
            disabled={isSigningIn}
          >
            {isSigningIn ? 'Signing In...' : 'Sign In'}
          </button>
        </form>
      </section>
    </main>
  )
}
