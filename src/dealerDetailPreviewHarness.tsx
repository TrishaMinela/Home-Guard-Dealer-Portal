import type { ComponentProps } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AdminDealerMarketingTools } from './components/AdminDealerMarketingTools'
import { DealerCrmIntegrations } from './components/DealerCrmIntegrations'
import { DealerUserAccess } from './components/DealerUserAccess'
import { DoorBuilderLeadWebhook } from './components/DoorBuilderLeadWebhook'
import { AdminMarketingBannersPage } from './pages/AdminMarketingBannersPage'
import { AdminBrandingStudioRoute } from './pages/BrandingStudioPage'
import { DealerDetailPage } from './pages/DealerDetailPage'
import { EditDealerPage } from './pages/EditDealerPage'
import type { AdminDealer } from './types/admin'
import './App.css'
import './styles/dealerDetail.css'

const dealer = {
  id: '6f2c1a40-8b1e-4d3a-9c77-1a2b3c4d5e6f',
  company_name: 'Harbor & Pine Windows',
  slug: 'harbor-pine',
  primary_contact_name: 'Avery Lane',
  email: 'avery@harborpine.example',
  phone: '555-0148',
  logo_url: 'https://example.com/original.png',
  logo_light_url: 'https://example.com/white.png',
  logo_black_url: null,
  logo_header_variant: 'original',
  logo_pages_variant: 'white',
  website: 'https://harborpine.example',
  address: '18 Harbor Street',
  city: 'Portland',
  state: 'ME',
  zip: '04101',
  primary_color: '#0F6E6E',
  secondary_color: '#111827',
  heading_font_family: 'Inter',
  body_font_family: null,
  is_active: true,
  created_at: '2023-03-12T15:00:00.000Z',
  requested_slug: null,
  slug_request_status: null,
  slug_requested_at: null,
} satisfies AdminDealer

const webhookPreview: ComponentProps<typeof DoorBuilderLeadWebhook>['preview'] = {
  encryptionConfigured: true,
  webhook: {
    status: 'configured',
    maskedUrl: 'https://hooks.zapier.com/hooks/catch/••••/••••',
    updatedAt: '2025-01-16T15:00:00.000Z',
    lastSuccessAt: '2025-11-20T18:04:00.000Z',
    lastSuccessHttpStatus: 200,
    lastFailureAt: null,
    lastFailureHttpStatus: null,
    lastTestAt: '2025-11-18T12:00:00.000Z',
    lastTestHttpStatus: 200,
  },
  audit: [
    {
      id: 'audit-1',
      action: 'test',
      maskedUrl: 'https://hooks.zapier.com/hooks/catch/••••/••••',
      httpStatus: 200,
      createdAt: '2025-11-18T12:00:00.000Z',
    },
  ],
}

const crmPreview: ComponentProps<typeof DealerCrmIntegrations>['preview'] = {
  encryptionConfigured: true,
  optaDeliveryAvailable: false,
  integrations: [
    {
      id: 'crm-opta',
      dealerId: dealer.id,
      provider: 'opta',
      state: 'test',
      fieldMapping: { email: 'customer.email' },
      hasCredentials: true,
      createdAt: '2024-06-01T00:00:00.000Z',
      updatedAt: '2025-01-16T00:00:00.000Z',
    },
  ],
}

const userPreview: ComponentProps<typeof DealerUserAccess>['previewUsers'] = [
  {
    name: 'Avery Lane',
    email: 'avery@harborpine.example',
    status: 'active',
    role: 'dealer_admin',
    accessGrantedAt: '2024-04-02T15:00:00.000Z',
    invitedAt: null,
    lastSignInAt: '2025-11-02T14:10:00.000Z',
  },
  {
    name: 'Jordan Blake',
    email: 'jordan@harborpine.example',
    status: 'active',
    role: 'member',
    accessGrantedAt: '2024-08-19T15:00:00.000Z',
    invitedAt: null,
    lastSignInAt: '2025-10-28T09:40:00.000Z',
  },
]

const marketingPreview: ComponentProps<typeof AdminDealerMarketingTools>['previewDealer'] = dealer

export function DealerDetailPreviewHarness() {
  return (
    <MemoryRouter initialEntries={[`/admin/dealers/${dealer.id}`]}>
      <div className="portal-shell dd-preview-shell">
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
                  canManageDealerUsers
                  canManageDealerCredentials
                  webhookPreview={webhookPreview}
                  crmPreview={crmPreview}
                  marketingPreview={marketingPreview}
                  userPreview={userPreview}
                />
              }
            />
            <Route path="/admin/dealers/:dealerId/edit" element={<EditDealerPage dealers={[dealer]} isLoading={false} error="" onSaved={() => {}} />} />
            <Route path="/admin/dealers/:dealerId/branding" element={<AdminBrandingStudioRoute dealers={[dealer]} onDealerUpdated={() => {}} />} />
            <Route path="/admin/dealers" element={<div className="page-content"><h1>Dealers</h1></div>} />
            <Route path="/admin/marketing-banners" element={<AdminMarketingBannersPage dealers={[dealer]} />} />
          </Routes>
        </main>
      </div>
    </MemoryRouter>
  )
}
