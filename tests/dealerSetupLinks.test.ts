import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { dealerSetupChecklist, dealerSetupDestination, dealerSetupDestinations } from '../src/features/dealer-setup/checklist.ts'

const savedDealer = {
  company_name: 'Northstar',
  slug: 'northstar',
  primary_contact_name: 'Alex',
  email: 'alex@northstar.example',
  phone: '555-0100',
  address: '1 Main',
  city: 'Austin',
  state: 'TX',
  zip: '78701',
  logo_url: 'https://cdn.example/original.png',
  logo_light_url: 'https://cdn.example/white.png',
  logo_black_url: 'https://cdn.example/black.png',
  logo_header_variant: 'original',
  logo_pages_variant: 'white',
  primary_color: '#0d666c',
  secondary_color: '#f8d30e',
  heading_font_family: 'Montserrat',
}

test('every checklist item maps to one destination or an explicit non-link', () => {
  const items = dealerSetupChecklist(savedDealer)
  assert.deepEqual(items.map((item) => item.id), Object.keys(dealerSetupDestinations))
  const expected = {
    'company-details': ['company-name', 'company', 'Company Details', 'company-name'],
    'door-builder-url': ['dealer-slug', 'company', 'Company Details', 'dealer-slug'],
    'dealer-admin': ['dealer-users', 'dealer-users', 'Dealer Users / Access'],
    'logo-original': ['logo-original', 'branding-studio', 'Branding Studio', undefined, 'logos'],
    'logo-white': ['logo-white', 'branding-studio', 'Branding Studio', undefined, 'logos'],
    'logo-black': ['logo-black', 'branding-studio', 'Branding Studio', undefined, 'logos'],
    'homepage-logo': ['homepage-logo-selection', 'branding-studio', 'Branding Studio', undefined, 'placement'],
    'pages-logo': ['pages-logo-selection', 'branding-studio', 'Branding Studio', undefined, 'placement'],
    colors: ['door-builder-appearance', 'branding-studio', 'Branding Studio', undefined, 'colors'],
    typography: ['heading-font-family', 'branding-studio', 'Branding Studio', undefined, 'typography'],
    marketing: ['marketing-tools', 'marketing-tools', 'Marketing Tools'],
    crm: ['crm-integrations', 'crm-integrations', 'CRM Integrations'],
  } as const
  for (const [id, [anchorId, sectionId, tabLabel, focusId]] of Object.entries(expected)) {
    const destination = dealerSetupDestination(id)
    assert.ok(destination, id)
    assert.equal(destination.anchorId, anchorId, id)
    assert.equal(destination.sectionId, sectionId, id)
    assert.equal(destination.tabLabel, tabLabel, id)
    if (focusId) assert.equal(destination.editFocusId, focusId, id)
    const studio = (expected as Record<string, readonly (string | undefined)[]>)[id][4]
    if (studio) assert.equal(destination.studioSection, studio, id)
  }
  for (const id of ['workflows', 'lead-routing']) {
    assert.equal(dealerSetupDestination(id), null, id)
  }
})

test('opening a destination does not change checklist completion', () => {
  const before = dealerSetupChecklist(savedDealer)
  for (const item of before) dealerSetupDestination(item.id)
  const after = dealerSetupChecklist(savedDealer)
  assert.deepEqual(after, before)
  const component = readFileSync('src/components/DealerSetupChecklist.tsx', 'utf8')
  assert.match(component, /Go to \$\{destination\.tabLabel\}: \$\{destination\.targetLabel\}/)
  assert.match(component, /does not mark it complete/)
  assert.doesNotMatch(component, /status:\s*'ready'|setStatus|onComplete/)
  assert.match(readFileSync('src/pages/BrandingStudioPage.tsx', 'utf8'), /id="logo-original"/)
  assert.match(readFileSync('src/pages/BrandingStudioPage.tsx', 'utf8'), /id="logo-white"/)
  assert.match(readFileSync('src/pages/BrandingStudioPage.tsx', 'utf8'), /id="logo-black"/)
  assert.match(readFileSync('src/components/DealerSetupChecklist.tsx', 'utf8'), /\/admin\/dealers\/\$\{dealerId\}\/branding\?section=/)
  assert.match(readFileSync('src/components/DealerLogoVariantSettings.tsx', 'utf8'), /homepage-logo-selection/)
  assert.match(readFileSync('src/components/DealerLogoVariantSettings.tsx', 'utf8'), /pages-logo-selection/)
})
