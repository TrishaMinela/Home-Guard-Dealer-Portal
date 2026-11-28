import type { FormEvent } from 'react'
import { AuthBrand } from './AuthBrand'
import { PasswordField } from './PasswordField'

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
        <AuthBrand subtitle="Dealer Portal" />

        <div className="login-card__intro">
          <p className="eyebrow">Portal access</p>
          <h1>Welcome back</h1>
          <p>Sign in to the Home Guard portal. Dealers and Home Guard staff use this page.</p>
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

          <PasswordField
            id="password"
            label="Password"
            autoComplete="current-password"
            value={password}
            onChange={onPasswordChange}
            disabled={isSigningIn}
          />
          <a className="login-form__forgot" href="/auth/forgot-password">Forgot password?</a>

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
