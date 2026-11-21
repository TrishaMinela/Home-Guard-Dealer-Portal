import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const root = document.getElementById('root')!
if (import.meta.env.DEV && (window.location.hash === '#appearance-harness' || window.location.hash === '#profile-nav-harness')) {
  void import('./appearanceHarness.tsx').then(({ AppearanceHarness, ProfileNavHarness }) => {
    createRoot(root).render(
      <StrictMode>
        {window.location.hash === '#profile-nav-harness'
          ? <ProfileNavHarness canEditAppearance={new URLSearchParams(window.location.search).get('role') === 'admin'} />
          : <AppearanceHarness />}
      </StrictMode>,
    )
  })
} else {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
