import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import test from 'node:test'

function psql(database: string, sql: string) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn('sudo', ['-u', 'postgres', 'psql', '-d', database, '-v', 'ON_ERROR_STOP=1', '-q', '-t', '-A'], { stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    child.stdout.on('data', (chunk) => { out += chunk })
    child.stderr.on('data', (chunk) => { err += chunk })
    child.on('close', (code) => code === 0 ? resolve(out.trim()) : reject(new Error(err || out)))
    child.stdin.end(sql)
  })
}

function psqlFile(database: string, file: string) {
  return psql(database, `\\i ${file}`)
}

test('local Postgres enforces routing, RLS, and one concurrent dealer claim', { timeout: 30_000 }, async () => {
  const database = 'zip_lead_routing_test'
  await psql('postgres', `drop database if exists ${database}`)
  await psql('postgres', `create database ${database}`)
  await psqlFile(database, 'tests/sql/zip_lead_routing_harness.sql')
  await psqlFile(database, 'supabase/migrations/20261117160000_add_zip_lead_routing.sql')
  await psqlFile(database, 'tests/sql/zip_lead_routing_scenarios.sql')

  const located = await psql(database, `
    select cases.id || '|' || cases.proposed_dealer_id || '|22222222-2222-4222-8222-222222222222'
    from public.lead_routing_cases cases
    join public.leads leads on leads.id = cases.lead_id
    where leads.email = 'concurrent@example.com'
  `)
  const [caseId, dealerId, actorId] = located.split('|')
  assert.ok(caseId && dealerId && actorId)
  const claimSql = `select public.lead_routing_claim_dealer_send('${caseId}', '${actorId}', '${dealerId}')->>'result'`
  const firstPromise = psql(database, `begin; ${claimSql}; select pg_sleep(1); commit;`)
  await new Promise((resolve) => setTimeout(resolve, 200))
  const second = await psql(database, claimSql)
  const first = (await firstPromise).split('\n')[0]
  assert.deepEqual([first, second].sort(), ['claimed', 'in_progress'])
  const attempts = await psql(database, `select count(*) from public.lead_notification_attempts where lead_id = (select lead_id from public.lead_routing_cases where id = '${caseId}') and channel = 'dealer_email'`)
  assert.equal(attempts, '1')
  const attemptId = await psql(database, `select id from public.lead_notification_attempts where idempotency_key = 'dealer-email:' || (select lead_id from public.lead_routing_cases where id = '${caseId}') || ':' || '${dealerId}'`)
  const completed = await psql(database, `select public.lead_routing_complete_dealer_send('${attemptId}', 'succeeded', null, null)->>'result'`)
  const repeated = await psql(database, `select public.lead_routing_complete_dealer_send('${attemptId}', 'succeeded', null, null)->>'result'`)
  assert.equal(completed, 'completed')
  assert.equal(repeated, 'already_complete')

  await psqlFile(database, 'supabase/rollbacks/20261117160000_add_zip_lead_routing_rollback.sql')
  const remaining = await psql(database, `select to_regclass('public.lead_routing_cases')`)
  assert.equal(remaining, '')
  await psql('postgres', `drop database if exists ${database}`)
})
