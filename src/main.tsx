import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const root = document.getElementById('root')!
const devHarness = import.meta.env.DEV ? window.location.hash : ''
if (devHarness === '#appearance-harness' || devHarness === '#profile-nav-harness' || devHarness === '#admin-nav-harness' || devHarness === '#disable-dealer-harness' || devHarness === '#dealer-detail-preview') {
  const load = devHarness === '#dealer-detail-preview'
    ? import('./dealerDetailPreviewHarness.tsx').then(({ DealerDetailPreviewHarness }) => <DealerDetailPreviewHarness />)
    : devHarness === '#disable-dealer-harness'
    ? import('./disableDealerHarness.tsx').then(({ DisableDealerHarness }) => <DisableDealerHarness />)
    : devHarness === '#admin-nav-harness'
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
