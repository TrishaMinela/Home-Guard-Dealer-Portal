import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync('supabase/migrations/20261029050000_add_hgi_invoice_rules.sql','utf8')
const clientHook = readFileSync('src/hooks/useClientBilling.ts','utf8')
const docs = readFileSync('docs/billing/invoice-rules.md','utf8')
const voidMigration = readFileSync('supabase/migrations/20261029051000_add_hgi_invoice_void_action.sql','utf8')

test('invoice issuance is internal, finalized-only, race-safe, and Net 15',()=>{
  assert.match(migration,/is_billing_internal_admin\(\)/)
  assert.match(migration,/billing_period_not_finalized/)
  assert.match(migration,/charge_summary_not_finalized/)
  assert.match(migration,/pg_advisory_xact_lock/)
  assert.match(migration,/HGI-%s-%s/)
  assert.match(migration,/v_due_at:=v_issued_at\+interval '15 days'/)
  assert.match(migration,/invoice_already_exists/)
})

test('invoice snapshots only finalized client charges and applies no tax or pricing',()=>{
  assert.match(migration,/v_summary\.ai_usage_charge_cents/)
  assert.match(migration,/'AI Usage Charges',1/)
  assert.match(migration,/'not_configured',null/)
  assert.doesNotMatch(migration,/markup_basis_points|provider_cost_micros/)
  assert.doesNotMatch(clientHook,/provider|markup|pricing|basis_points|stripe/i)
})

test('issued invoice fields are immutable and void preserves history',()=>{
  assert.match(migration,/Issued invoice financial and identity fields are immutable/)
  assert.match(migration,/Issued invoices cannot be deleted; void them instead/)
  assert.match(migration,/Void invoices cannot be reopened/)
  assert.match(voidMigration,/is_billing_internal_admin\(\)/)
  assert.match(voidMigration,/billing_invoice_voided/)
  assert.match(docs,/Stripe, payment collection, and real invoice creation remain disabled/)
})
