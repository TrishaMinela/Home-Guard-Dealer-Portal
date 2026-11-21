import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const root = document.getElementById('root')!
const devHarness = import.meta.env.DEV ? window.location.hash : ''
if (devHarness === '#appearance-harness' || devHarness === '#profile-nav-harness' || devHarness === '#admin-nav-harness') {
  const load = devHarness === '#admin-nav-harness'
    ? import('./appearanceAdminHarness.tsx').then(({ AdminNavHarness }) => <AdminNavHarness />)
    : import('./appearanceHarness.tsx').then(({ AppearanceHarness, ProfileNavHarness }) => (
      devHarness === '#profile-nav-harness'
        ? <ProfileNavHarness canEditAppearance={new URLSearchParams(window.location.search).get('role') === 'admin'} />
        : <AppearanceHarness />
    ))
  void load.then((page) => {
    createRoot(root).render(<StrictMode>{page}</StrictMode>)
  })
} else {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
