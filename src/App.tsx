import { useEffect, useState, type FormEvent } from 'react'
import type { User } from '@supabase/supabase-js'
import { BrowserRouter } from 'react-router-dom'
import { LoginPage } from './components/LoginPage'
import { PortalLayout } from './components/PortalLayout'
import { supabase } from './lib/supabase'
import './App.css'

type Dealer = {
  company_name: string
}

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [dealer, setDealer] = useState<Dealer | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [membershipMessage, setMembershipMessage] = useState('')
  const [isLoadingSession, setIsLoadingSession] = useState(true)
  const [isLoadingDealer, setIsLoadingDealer] = useState(false)
  const [isSigningIn, setIsSigningIn] = useState(false)

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

  useEffect(() => {
    let isCurrent = true

    async function loadDealer(authenticatedUser: User) {
      setDealer(null)
      setMembershipMessage('')
      setIsLoadingDealer(true)

      const { data: membership, error: membershipError } = await supabase
        .from('dealer_users')
        .select('dealer_id')
        .eq('user_id', authenticatedUser.id)
        .limit(1)
        .maybeSingle()

      if (!isCurrent) return

      if (membershipError) {
        setMembershipMessage('Unable to load your dealer membership.')
        setIsLoadingDealer(false)
        return
      }

      if (!membership) {
        setMembershipMessage(
          'Your account is signed in, but it is not associated with a dealer.',
        )
        setIsLoadingDealer(false)
        return
      }

      const { data: dealerRecord, error: dealerError } = await supabase
        .from('dealers')
        .select('company_name')
        .eq('id', membership.dealer_id)
        .single()

      if (!isCurrent) return

      if (dealerError) {
        setMembershipMessage('Unable to load your dealer information.')
      } else {
        setDealer(dealerRecord)
      }

      setIsLoadingDealer(false)
    }

    if (user) {
      void loadDealer(user)
    }

    return () => {
      isCurrent = false
    }
  }, [user])

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

  if (isLoadingDealer) {
    return <div className="app-status">Loading dealer...</div>
  }

  if (!dealer) {
    return (
      <main className="access-state">
        <section className="access-state__card">
          <div className="brand-mark" aria-hidden="true">
            HG
          </div>
          <h1>Home Guard Dealer Portal</h1>
          <p className="message message--error">{membershipMessage}</p>
          <p className="account-email">Signed in as: {user.email}</p>
          {error && <p className="message message--error">{error}</p>}
          <button className="button button--primary" onClick={handleSignOut}>
            Sign Out
          </button>
        </section>
      </main>
    )
  }

  return (
    <BrowserRouter>
      <PortalLayout
        dealerName={dealer.company_name}
        email={user.email ?? ''}
        signOutError={error}
        onSignOut={handleSignOut}
      />
    </BrowserRouter>
  )
}

export default App
