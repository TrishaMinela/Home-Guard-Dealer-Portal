import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const root = document.getElementById('root')!
if (import.meta.env.DEV && window.location.hash === '#appearance-harness') {
  void import('./appearanceHarness.tsx').then(({ AppearanceHarness }) => {
    createRoot(root).render(
      <StrictMode>
        <AppearanceHarness />
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
