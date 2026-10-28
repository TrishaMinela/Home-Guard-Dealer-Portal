import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const endpoints = [
  'api/openai-admin-verify.ts',
  'api/openai-provider-recovery-dry-run.ts',
  'api/openai-provider-recovery-import.ts',
  'api/openai-provider-sync-run.ts',
]

test('provider and reconciliation endpoints require internal billing authorization', () => {
  for (const path of endpoints) {
    const source = readFileSync(path, 'utf8')
    assert.match(source, /authorizeInternalBillingAdmin/)
    assert.doesNotMatch(source, /authorizeHgiAdmin\(authorization\)/)
  }
})

test('internal authorization requires an authenticated billing principal', () => {
  const source = readFileSync('api/_lib/authorizeHgiAdmin.ts', 'utf8')
  assert.match(source, /supabase\.auth\.getUser\(token\)/)
  assert.match(source, /from\('billing_internal_admins'\)/)
  assert.match(source, /Internal billing administrator access required/)
})
