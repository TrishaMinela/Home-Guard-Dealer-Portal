import { useEffect, useState, type FormEvent } from 'react'
import type { User } from '@supabase/supabase-js'
import { BrowserRouter } from 'react-router-dom'
import { AdminLayout } from './components/AdminLayout'
import { LoginPage } from './components/LoginPage'
import { PortalLayout } from './components/PortalLayout'
import { useAccountAccess } from './hooks/useAccountAccess'
import { supabase } from './lib/supabase'
import './App.css'

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoadingSession, setIsLoadingSession] = useState(true)
  const [isSigningIn, setIsSigningIn] = useState(false)
  const {
    access,
    isLoading: isLoadingAccess,
    updateDealer,
  } = useAccountAccess(user)

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
      setIsLoadingSession(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setIsLoadingSession(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setIsSigningIn(true)

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError) {
      setError(signInError.message)
    }

    setIsSigningIn(false)
  }

  async function handleSignOut() {
    setError('')
    const { error: signOutError } = await supabase.auth.signOut()

    if (signOutError) {
      setError(signOutError.message)
    }
  }

  if (isLoadingSession) {
    return <div className="app-status">Loading portal...</div>
  }

  if (!user) {
    return (
      <LoginPage
        email={email}
        password={password}
        error={error}
        isSigningIn={isSigningIn}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onSubmit={handleSignIn}
      />
    )
  }

  if (isLoadingAccess) {
    return <div className="app-status">Loading account...</div>
  }

  if (!access || access.type === 'none') {
    return (
      <main className="access-state">
        <section className="access-state__card">
          <div className="brand-mark" aria-hidden="true">
            HG
          </div>
          <h1>Home Guard Dealer Portal</h1>
          <p className="message message--error">
            {access?.message ?? 'Unable to verify your account access.'}
          </p>
          <p className="account-email">Signed in as: {user.email}</p>
          {error && <p className="message message--error">{error}</p>}
          <button className="button button--primary" onClick={handleSignOut}>
            Sign Out
          </button>
        </section>
      </main>
    )
  }

  if (access.type === 'admin') {
    return (
      <BrowserRouter>
        <AdminLayout
          email={user.email ?? ''}
          signOutError={error}
          onSignOut={handleSignOut}
        />
      </BrowserRouter>
    )
  }

  return (
    <BrowserRouter>
      <PortalLayout
        dealer={access.dealer}
        email={user.email ?? ''}
        signOutError={error}
        onSignOut={handleSignOut}
        onDealerUpdated={updateDealer}
      />
    </BrowserRouter>
  )
}

export default App
