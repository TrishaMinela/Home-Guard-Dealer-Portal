import type { FormEvent } from 'react'

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
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            required
          />

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
