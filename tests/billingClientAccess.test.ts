import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migrationUrl = new URL('../supabase/migrations/20261029030000_harden_billing_client_access.sql', import.meta.url)

test('billing-client account listing is membership scoped and excludes other Portal roles', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  assert.match(sql, /billing_account_users membership/)
  assert.match(sql, /membership\.user_id = \(select auth\.uid\(\)\)/)
  assert.match(sql, /home_guard_admins/)
  assert.match(sql, /billing_internal_admins/)
  assert.match(sql, /dealer_users/)
  assert.match(sql, /account\.is_active/)
  assert.match(sql, /list_billing_client_accounts/)
  assert.match(sql, /revoke all on function public\.list_billing_client_accounts\(\) from public, anon/)
})

test('billing-client routing uses the server-scoped account list and dedicated layout', async () => {
  const [app, access, layout] = await Promise.all([
    readFile(new URL('../src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/hooks/useAccountAccess.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/BillingClientLayout.tsx', import.meta.url), 'utf8'),
  ])
  assert.match(access, /rpc\('list_billing_client_accounts'\)/)
  assert.match(app, /access\.type === 'billing_client'/)
  assert.match(app, /<BillingClientLayout/)
  for (const label of ['Billing Overview', 'AI Usage Charges', 'Billing History']) assert.match(layout, new RegExp(label))
  for (const blocked of ['Dealers', 'Leads', 'Inventory', 'Admin Settings', 'provider', 'pricing']) assert.doesNotMatch(layout, new RegExp(blocked, 'i'))
  assert.match(layout, /Navigate to="\/billing" replace/)
  assert.match(layout, /onSignOut/)
})

test('client queries contain only client-safe billing tables and fields', async () => {
  const source = await readFile(new URL('../src/hooks/useClientBilling.ts', import.meta.url), 'utf8')
  for (const table of ['billing_accounts', 'billing_charge_summaries', 'billing_client_usage_daily', 'billing_invoices']) assert.match(source, new RegExp(table))
  for (const forbidden of ['billing_pricing_versions', 'billing_provider_period_costs', 'ai_provider_', 'ai_generation_usage', 'billing_audit_log', 'stripe_']) assert.doesNotMatch(source, new RegExp(forbidden))
})
