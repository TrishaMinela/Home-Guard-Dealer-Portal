import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { AdminDealer } from './types/admin'
import { DealerDetailPage } from './pages/DealerDetailPage'
import './App.css'

const dealer = {
  id: '00000000-0000-0000-0000-000000000001',
  company_name: 'Diligent Exterior Remodeling',
  slug: 'diligent-exterior-remodeling',
  primary_contact_name: 'Avery Lane',
  email: 'avery@diligent.example',
  phone: '555-0100',
  logo_url: null,
  logo_light_url: null,
  website: 'https://diligent.example',
  address: '10 Main Street',
  city: 'Savannah',
  state: 'GA',
  zip: '31401',
  primary_color: '#235176',
  secondary_color: '#8ebb53',
  is_active: true,
  created_at: '2026-01-01T00:00:00.000Z',
  requested_slug: null,
  slug_request_status: null,
  slug_requested_at: null,
} satisfies AdminDealer

export function DisableDealerHarness() {
  return (
    <MemoryRouter initialEntries={[`/admin/dealers/${dealer.id}`]}>
      <div className="portal-shell">
        <main className="portal-main">
          <Routes>
            <Route
              path="/admin/dealers/:dealerId"
              element={
                <DealerDetailPage
                  dealers={[dealer]}
                  isLoading={false}
                  error=""
                  successMessage=""
                  onDealerUpdated={() => {}}
                  onClearSuccess={() => {}}
                  canManageDealerUsers={false}
                  canManageDealerCredentials={false}
                />
              }
            />
          </Routes>
        </main>
      </div>
    </MemoryRouter>
  )
}
