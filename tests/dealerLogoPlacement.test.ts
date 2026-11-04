import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('dealer logo placement migration defaults safely and enforces allowed values', async () => {
  const migration = await readFile(new URL('../supabase/migrations/20261105000000_add_dealer_logo_placement.sql', import.meta.url), 'utf8')
  assert.match(migration, /logo_placement text not null default 'hero'/)
  assert.match(migration, /check \(logo_placement in \('header', 'hero'\)\)/)
  assert.match(migration, /role = 'dealer_admin'/)
  assert.match(migration, /grant execute on function public\.update_my_dealer_logo_placement\(uuid, text\) to authenticated/)
})

test('branding UI exposes explicit Header and Hero choices without changing the Portal shell', async () => {
  const component = await readFile(new URL('../src/components/DealerLogoPlacementSettings.tsx', import.meta.url), 'utf8')
  const dealerPage = await readFile(new URL('../src/pages/DealerCompanyProfilePage.tsx', import.meta.url), 'utf8')
  const adminPage = await readFile(new URL('../src/pages/DealerDetailPage.tsx', import.meta.url), 'utf8')
  assert.match(component, /Dealer Logo Placement/)
  assert.match(component, /value="header"/)
  assert.match(component, /value="hero"/)
  assert.match(dealerPage, /update_my_dealer_logo_placement/)
  assert.match(adminPage, /update\(\{ logo_placement: placement \}\)/)
  assert.doesNotMatch(component, /PortalLayout|portal-sidebar/i)
})
