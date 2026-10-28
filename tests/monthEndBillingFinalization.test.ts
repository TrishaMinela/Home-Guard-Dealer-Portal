import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migrationUrl = new URL('../supabase/migrations/20261029020000_add_month_end_billing_finalization.sql', import.meta.url)
const panelUrl = new URL('../src/components/InternalBillingPanel.tsx', import.meta.url)

test('month-end readiness enforces complete, attributable provider coverage', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  assert.match(sql, /generate_series\(p_period_start, v_period_end - 1/)
  assert.match(sql, /provider_coverage_incomplete/)
  assert.match(sql, /provider_conflicts_unresolved/)
  assert.match(sql, /provider_data_inconsistent/)
  assert.match(sql, /billing_account_inactive/)
  assert.match(sql, /pricing_missing/)
  assert.match(sql, /pricing_overlap/)
  assert.match(sql, /billing_period_exists/)
  assert.match(sql, /month_not_complete/)
  assert.match(sql, /export_project_id='proj_haRRNxvf4CVwa2jHugJ762SM'/)
  assert.match(sql, /scope_verification='export_project_id'/)
})

test('explicit zero-cost provider days count as covered', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  const missingCoverageQuery = sql.match(/select coalesce\(jsonb_agg[\s\S]*?if jsonb_array_length\(v_missing_dates\)/)?.[0] ?? ''
  assert.match(missingCoverageQuery, /not exists/)
  assert.match(missingCoverageQuery, /ai_provider_cost_daily/)
  assert.doesNotMatch(missingCoverageQuery, /actual_cost_usd\s*>\s*0/)
})

test('finalization is atomic, locked, auditable, and creates no payment artifacts', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  assert.match(sql, /pg_advisory_xact_lock/)
  assert.match(sql, /billing_month_end_readiness/)
  assert.match(sql, /insert into public\.billing_periods/)
  assert.match(sql, /insert into public\.billing_provider_period_costs/)
  assert.match(sql, /insert into public\.billing_charge_summaries/)
  assert.match(sql, /insert into public\.billing_audit_log/)
  assert.doesNotMatch(sql, /insert into public\.billing_(?:invoices|invoice_items|payment_references|stripe)/)
  assert.doesNotMatch(sql, /force|override/i)
})

test('integer-safe charge calculation is based on provider micros and basis points', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  assert.match(sql, /round\(v_provider_cost \* 1000000\)::bigint/)
  assert.match(sql, /v_provider_cost_micros::numeric \* \(10000 \+ v_pricing\.markup_basis_points\) \/ 100000000/)
})

test('only internal billing admins can check or finalize a month', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  assert.equal((sql.match(/if not public\.is_billing_internal_admin\(\)/g) ?? []).length, 2)
  assert.match(sql, /revoke all on function public\.billing_month_end_readiness\(uuid,date\) from public,anon/)
  assert.match(sql, /revoke all on function public\.finalize_month_end_billing\(uuid,date\) from public,anon/)
})

test('internal UI exposes readiness but has no force-finalize path', async () => {
  const panel = await readFile(panelUrl, 'utf8')
  assert.match(panel, /Month-End Billing/)
  assert.match(panel, /billing_month_end_readiness/)
  assert.match(panel, /finalize_month_end_billing/)
  assert.match(panel, /disabled={!readiness\.ready/)
  assert.match(panel, /No invoice or payment was created/)
  assert.doesNotMatch(panel, /force finalize/i)
})
