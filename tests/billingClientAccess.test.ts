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
  const [app, access, layout, clientPage] = await Promise.all([
    readFile(new URL('../src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/hooks/useAccountAccess.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/BillingClientLayout.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/BillingClientPage.tsx', import.meta.url), 'utf8'),
  ])
  assert.match(access, /rpc\('list_billing_client_accounts'\)/)
  assert.match(app, /access\.type === 'billing_client'/)
  assert.match(app, /<BillingClientLayout/)
  for (const label of ['Billing Overview', 'AI Usage Charges', 'Billing History', 'Invoices']) assert.match(layout, new RegExp(label))
  for (const blocked of ['Dealers', 'Leads', 'Inventory', 'Admin Settings', 'provider', 'pricing']) assert.doesNotMatch(layout, new RegExp(blocked, 'i'))
  assert.match(layout, /Navigate to="\/billing" replace/)
  assert.match(layout, /onSignOut/)
  assert.match(layout, /view="overview"/)
  assert.match(layout, /view="usage"/)
  assert.match(layout, /view="history"/)
  assert.match(layout, /view="invoices"/)
  assert.match(clientPage, /Not finalized yet/)
  assert.match(clientPage, /No finalized billing period is available yet/)
  assert.match(clientPage, /No billing history yet/)
})

test('client queries contain only client-safe billing tables and fields', async () => {
  const source = await readFile(new URL('../src/hooks/useClientBilling.ts', import.meta.url), 'utf8')
  for (const table of ['billing_accounts', 'billing_charge_summaries', 'billing_client_usage_daily', 'billing_invoices']) assert.match(source, new RegExp(table))
  for (const forbidden of ['billing_pricing_versions', 'billing_provider_period_costs', 'ai_provider_', 'ai_generation_usage', 'billing_audit_log', 'stripe_']) assert.doesNotMatch(source, new RegExp(forbidden))
})

test('client presentation never renders internal billing or AI diagnostics', async () => {
  const source = (await Promise.all([
    readFile(new URL('../src/pages/BillingClientPage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/BillingClientLayout.tsx', import.meta.url), 'utf8'),
  ])).join('\n').toLowerCase()
  for (const forbidden of ['provider cost', 'openai cost', 'basis points', 'markup', 'margin', 'pricing version', 'reconciliation', 'request id', 'token count', 'workflow diagnostic', 'sync status', 'audit trail', 'stripe']) {
    assert.equal(source.includes(forbidden), false, `Client UI includes internal term: ${forbidden}`)
  }
})

test('client layout redirects every admin or unknown direct URL back to billing', async () => {
  const layout = await readFile(new URL('../src/components/BillingClientLayout.tsx', import.meta.url), 'utf8')
  const clientRoutes = layout.match(/<main[\s\S]*?<\/main>/)?.[0] ?? ''
  assert.match(clientRoutes, /path="\/billing"/)
  assert.match(clientRoutes, /path="\/billing\/usage"/)
  assert.match(clientRoutes, /path="\/billing\/history"/)
  assert.match(clientRoutes, /path="\/billing\/invoices"/)
  assert.match(clientRoutes, /path="\*" element={<Navigate to="\/billing" replace/)
  for (const blocked of ['/admin', '/admin/ai-usage', '/admin/billing', '/admin/inventory', '/admin/dealers', '/admin/leads', '/admin/settings']) assert.doesNotMatch(clientRoutes, new RegExp(`path="${blocked}`))
})
