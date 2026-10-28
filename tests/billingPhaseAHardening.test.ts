import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migrationUrl = new URL('../supabase/migrations/20261027000000_create_ai_billing_foundation.sql', import.meta.url)
const cutoverUrl = new URL('../supabase/policy-cutovers/20261027010000_restrict_ai_telemetry_to_internal_billing_admins.sql', import.meta.url)
const appliedCutoverUrl = new URL('../supabase/migrations/20261029040000_restrict_ai_telemetry_to_internal_billing_admins.sql', import.meta.url)

test('foundation does not cut over existing AI policies', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  assert.doesNotMatch(sql, /drop policy[^;]+ai_(generation|entrance|visualization|provider|admin)/i)
  assert.doesNotMatch(sql, /create or replace function public\.resolve_ai_admin_issue/i)
})

test('billing tenant integrity and finalized immutability are database enforced', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  assert.match(sql, /foreign key \(pricing_version_id,billing_account_id\)/)
  assert.match(sql, /foreign key \(billing_period_id,billing_account_id\)/)
  assert.match(sql, /exclude using gist/)
  assert.match(sql, /protect_finalized_billing_period/)
  assert.match(sql, /protect_finalized_daily_usage/)
})

test('provider identifiers are isolated from client base tables', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  const accounts = sql.match(/create table public\.billing_accounts \(([\s\S]*?)\n\);/)?.[1] ?? ''
  const invoices = sql.match(/create table public\.billing_invoices \(([\s\S]*?)\n\);/)?.[1] ?? ''
  assert.doesNotMatch(accounts, /stripe_/i)
  assert.doesNotMatch(invoices, /stripe_|hosted_invoice|invoice_pdf/i)
  assert.match(sql, /create table public\.billing_stripe_accounts/)
  assert.match(sql, /create table public\.billing_stripe_invoices/)
})

test('reviewed cutover source matches the applied least-privilege boundary', async () => {
  const [source, applied] = await Promise.all([readFile(cutoverUrl, 'utf8'), readFile(appliedCutoverUrl, 'utf8')])
  assert.match(source, /Applied through the matching timestamped migration/)
  assert.match(applied, /is_billing_internal_admin/)
  assert.doesNotMatch(applied, /resolve_ai_admin_issue|drop policy .*AI admin issues/i)
})

test('billing client has a dedicated layout and membership-scoped account list', async () => {
  const [app, access, adminLayout, layout, hook] = await Promise.all([
    readFile(new URL('../src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/hooks/useAccountAccess.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/AdminLayout.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/BillingClientLayout.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/hooks/useClientBilling.ts', import.meta.url), 'utf8'),
  ])
  assert.match(app, /access\.type === 'billing_client'/)
  assert.match(access, /list_billing_client_accounts/)
  assert.match(layout, /Billing Overview/)
  assert.doesNotMatch(layout, /Dealers|All Leads|Inventory|Admin Settings/)
  assert.doesNotMatch(hook, /\.limit\(1\)|billing_account_users/)
  assert.match(adminLayout, /AI Usage & Billing[^\n]+internalOnly: true/)
  assert.match(adminLayout, /isInternalBillingAdmin \? <AdminBillingPage showInternalDetails \/>/)
  assert.match(adminLayout, /path="\/admin\/ai-usage" element={<AdminAiUsagePage showInternalDetails={isInternalBillingAdmin} \/>}/)
})
