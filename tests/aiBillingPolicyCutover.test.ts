import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync('supabase/migrations/20261029040000_restrict_ai_telemetry_to_internal_billing_admins.sql', 'utf8')
const recovery = readFileSync('supabase/recovery/20261027010100_restore_home_guard_ai_access.sql', 'utf8')
const prepared = readFileSync('supabase/policy-cutovers/20261027010000_restrict_ai_telemetry_to_internal_billing_admins.sql', 'utf8')

const rawTables = [
  'ai_generation_usage',
  'ai_entrance_detection_usage',
  'ai_visualization_workflows',
  'ai_provider_activity_daily',
  'ai_provider_cost_daily',
]

test('cutover restricts every raw AI/provider table to internal billing admins', () => {
  for (const table of rawTables) {
    assert.match(migration, new RegExp(`on public\\.${table} for select to authenticated[\\s\\S]*?is_billing_internal_admin\\(\\)`, 'i'))
  }
  assert.equal((migration.match(/create policy "Internal billing admins can read/g) ?? []).length, 5)
})

test('operational AI issues and resolver remain on the Home Guard admin path', () => {
  for (const sql of [migration, prepared]) {
    assert.doesNotMatch(sql, /drop policy .*AI admin issues/i)
    assert.doesNotMatch(sql, /create or replace function public\.resolve_ai_admin_issue/i)
  }
})

test('forward recovery restores exactly the five previous raw read policies', () => {
  for (const table of rawTables) assert.match(recovery, new RegExp(`on public\\.${table}`))
  assert.equal((recovery.match(/create policy "Home Guard admins can read/g) ?? []).length, 5)
  assert.doesNotMatch(recovery, /ai_admin_issues|resolve_ai_admin_issue/i)
})
