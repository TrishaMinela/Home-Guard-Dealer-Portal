import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('webhook migration applies, hides the secret, and rolls back on ephemeral Postgres', () => {
  const database = `webhook_mig_${process.pid}`
  const psql = (args: string[], databaseName = 'postgres') => execFileSync(
    'sudo',
    ['-u', 'postgres', 'psql', '-d', databaseName, '-v', 'ON_ERROR_STOP=1', '-q', ...args],
    { encoding: 'utf8' },
  )
  psql(['-c', `drop database if exists ${database} with (force)`])
  psql(['-c', `create database ${database}`])
  try {
    const output = psql(['-f', 'tests/sql/doorBuilderWebhookMigrationHarness.sql'], database)
    assert.equal(output.includes('ciphertext'), false)
    assert.match(readMigration(), /Do not use supabase db push/)
  } finally {
    psql(['-c', `drop database if exists ${database} with (force)`])
  }
})

function readMigration() {
  return readFileSync('supabase/migrations/20261120190000_add_dealer_door_builder_webhooks.sql', 'utf8')
}
