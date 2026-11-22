import { useState } from 'react'
import type { AdminDealer } from './types/admin'
import { DoorBuilderAppearanceSettings } from './components/DoorBuilderAppearanceSettings'
import { DealerCompanyProfilePage } from './pages/DealerCompanyProfilePage'
import type { DoorBuilderAppearance } from './utils/doorBuilderAppearance'

const squareLogo = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="500" height="518"><rect width="500" height="518" fill="none"/><rect x="40" y="36" width="420" height="420" rx="24" fill="#235176"/><text x="250" y="270" text-anchor="middle" fill="#fff" font-size="64" font-family="Arial">DER</text></svg>')}`
const wideLogo = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="250" height="104" viewBox="0 0 250 104"><rect width="250" height="104" fill="none"/><text x="8" y="68" fill="#102418" font-size="40" font-family="Arial" font-weight="700">Window Supply</text></svg>')}`

const dealer = {
  id: '00000000-0000-0000-0000-000000000001',
  company_name: 'Diligent Exterior Remodeling',
  slug: 'diligent-exterior-remodeling',
  primary_contact_name: null,
  email: null,
  phone: null,
  logo_url: squareLogo,
  logo_light_url: null,
  logo_secondary_url: wideLogo,
  logo_display: 'dual',
  logo_placement: 'header',
  logo_header_variant: 'original',
  logo_pages_variant: 'original',
  logo_secondary_header_variant: 'original',
  logo_website_url: 'https://diligentexteriorremodeling.com/',
  logo_secondary_website_url: 'https://diligentwindowsupply.example/',
  website: 'https://diligentexteriorremodeling.com/',
  address: null,
  city: null,
  state: null,
  zip: null,
  primary_color: '#235176',
  secondary_color: '#8ebb53',
  is_active: true,
  created_at: '2026-01-01T00:00:00.000Z',
  requested_slug: null,
  slug_request_status: null,
  slug_requested_at: null,
} satisfies AdminDealer

const legacyAppearance: DoorBuilderAppearance = {
  headerBackground: '#112233',
  headerText: '#abcdef',
  headerIcon: '#445566',
  bodyBackground: '#010203',
  previewBackground: '#222222',
  cardBackground: '#fff4d6',
  cardTitle: '#7a1f1f',
  footerText: '#ffd24a',
  footerLink: '#00ff00',
  primaryButtonBackground: '#123456',
}

export function AppearanceHarness() {
  const seeded = new URLSearchParams(window.location.search).get('legacy') === '1' ? legacyAppearance : null
  const [saved, setSaved] = useState<DoorBuilderAppearance | null>(seeded)
  const [reloadKey, setReloadKey] = useState(0)
  return (
    <main>
      <p data-testid="saved-appearance">{JSON.stringify(saved)}</p>
      <DoorBuilderAppearanceSettings
        key={reloadKey}
        dealer={{ ...dealer, door_builder_appearance: saved }}
        mode="admin"
        loadFromServer={false}
        initialAppearance={saved}
        onSave={async (value) => {
          setSaved(value)
        }}
      />
      <button type="button" onClick={() => setReloadKey((value) => value + 1)}>Reload appearance</button>
    </main>
  )
}

export function ProfileNavHarness({ canEditAppearance }: { canEditAppearance: boolean }) {
  return (
    <DealerCompanyProfilePage
      dealer={dealer}
      canEditAppearance={canEditAppearance}
      onDealerUpdated={() => {}}
    />
  )
}
