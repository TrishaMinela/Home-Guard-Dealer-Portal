#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'

const EXPECTED_PROJECT_REF = 'udbcnpjtwhmjzpjjhoph'
const EXPECTED_OPENAI_PROJECT = 'proj_haRRNxvf4CVwa2jHugJ762SM'
const EXPECTED_ACTIVITY_SHA256 = '4acf54f8d6fccb21e1adbc00cc9fed1330109d6463b06a9b584d066f4628b9b7'
const EXPECTED_COST_SHA256 = 'dcfbcd5c12f6556ff72be49757916da3adc07fcaef247396c0020769c6d8c4c4'
const EXPECTED_START = '2026-10-05T00:00:00+00:00'
const EXPECTED_END = '2026-10-23T00:00:00+00:00'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const valueAfter = (flag) => {
  const index = args.indexOf(flag)
  return index >= 0 ? args[index + 1] : null
}
const activityPath = resolve(valueAfter('--activity') ?? '/Users/trishaminela/Downloads/activity_2026-10-05_2026-10-22.csv')
const costPath = resolve(valueAfter('--cost') ?? '/Users/trishaminela/Downloads/cost_2026-10-05_2026-10-22.csv')
const reportPath = valueAfter('--report') ? resolve(valueAfter('--report')) : null
const requestedRef = valueAfter('--project-ref') ?? EXPECTED_PROJECT_REF

if (requestedRef !== EXPECTED_PROJECT_REF) throw new Error(`This script is locked to HGI Portal Dev (${EXPECTED_PROJECT_REF}).`)
if (args.includes('--dry-run') && apply) throw new Error('Choose either dry-run or apply mode, not both.')

function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { field += '"'; index += 1 }
      else if (character === '"') quoted = false
      else field += character
    } else if (character === '"') quoted = true
    else if (character === ',') { row.push(field); field = '' }
    else if (character === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = '' }
    else field += character
  }
  if (field || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row) }
  const [headers, ...values] = rows.filter((candidate) => candidate.some((value) => value !== ''))
  return values.map((candidate) => Object.fromEntries(headers.map((header, index) => [header, candidate[index] ?? ''])))
}

const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const number = (value) => value === '' || value == null ? 0 : Number(value)
const integer = (value) => Math.round(number(value))
const isoDay = (value) => value.slice(0, 10)
const withUtcOffset = (value) => /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}+00:00`
const canonicalJson = (value) => JSON.stringify(value, Object.keys(value).sort())

function modelMetadata(providerModel) {
  if (providerModel === 'gpt-image-2.5-sunburst') return { telemetryModel: providerModel, operationType: 'image_generation' }
  if (providerModel === 'gpt-5.4-mini-2026-03-17') return { telemetryModel: 'gpt-5.4-mini', operationType: 'entrance_analysis' }
  if (providerModel === 'gpt-4o-mini-2024-07-18') return { telemetryModel: 'gpt-4o-mini', operationType: 'unclassified' }
  throw new Error(`Unexpected model in official Activity export: ${providerModel}`)
}

function calculatedCost(row) {
  if (row.provider_model === 'gpt-image-2.5-sunburst') {
    return (row.text_input_tokens * 5 + row.image_input_tokens * 8 + row.image_output_tokens * 30) / 1_000_000
  }
  if (row.provider_model === 'gpt-5.4-mini-2026-03-17') {
    return ((row.input_tokens - row.cached_input_tokens) * 0.75 + row.cached_input_tokens * 0.075 + row.output_tokens * 4.5) / 1_000_000
  }
  if (row.provider_model === 'gpt-4o-mini-2024-07-18') {
    return (row.input_tokens * 0.15 + row.output_tokens * 0.6) / 1_000_000
  }
  return null
}

async function localEnvironment() {
  const values = { ...process.env }
  try {
    const text = await readFile(resolve('.env.local'), 'utf8')
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (!match || values[match[1]]) continue
      values[match[1]] = match[2].replace(/^['"]|['"]$/g, '')
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  return values
}

async function fetchAll(baseUrl, key, table, select, startColumn) {
  const query = new URLSearchParams({ select })
  query.append(startColumn, `gte.${EXPECTED_START}`)
  query.append(startColumn, `lt.${EXPECTED_END}`)
  query.set('order', `${startColumn}.asc`)
  const response = await fetch(`${baseUrl}/rest/v1/${table}?${query}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  if (!response.ok) throw new Error(`${table} read failed (${response.status}): ${await response.text()}`)
  return response.json()
}

async function insertRows(baseUrl, key, table, rows) {
  if (!rows.length) return
  const response = await fetch(`${baseUrl}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(rows),
  })
  if (!response.ok) throw new Error(`${table} insert failed (${response.status}): ${await response.text()}`)
}

async function fetchReconciliationRows(baseUrl, key, table, select) {
  const response = await fetch(`${baseUrl}/rest/v1/${table}?select=${encodeURIComponent(select)}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  if (!response.ok) throw new Error(`${table} read failed (${response.status}): ${await response.text()}`)
  return response.json()
}

function prepareIdempotentInsert(candidates, existing, naturalKey) {
  const byNaturalKey = new Map(existing.map((row) => [naturalKey(row), row]))
  const inserts = []
  const skipped = []
  for (const candidate of candidates) {
    const current = byNaturalKey.get(naturalKey(candidate))
    if (!current) { inserts.push(candidate); continue }
    if (current.source_row_sha256 !== candidate.source_row_sha256) {
      throw new Error(`Existing reconciliation row conflicts with official source at ${naturalKey(candidate)}.`)
    }
    skipped.push(candidate.source_row_sha256)
  }
  return { inserts, skipped }
}

function telemetryKey(date, model) { return `${date}|${model}` }

async function main() {
  const [activityText, costText, environment] = await Promise.all([
    readFile(activityPath, 'utf8'),
    readFile(costPath, 'utf8'),
    localEnvironment(),
  ])
  const activityHash = sha256(activityText)
  const costHash = sha256(costText)
  if (activityHash !== EXPECTED_ACTIVITY_SHA256) throw new Error(`Activity checksum mismatch: ${activityHash}`)
  if (costHash !== EXPECTED_COST_SHA256) throw new Error(`Cost checksum mismatch: ${costHash}`)

  let baseUrl = environment.SUPABASE_URL?.replace(/\/+$/, '')
  let serviceKey = environment.SUPABASE_SERVICE_ROLE_KEY
  if ((!baseUrl || !serviceKey) && environment.SUPABASE_ACCESS_TOKEN) {
    const response = await fetch(`https://api.supabase.com/v1/projects/${EXPECTED_PROJECT_REF}/api-keys`, {
      headers: { Authorization: `Bearer ${environment.SUPABASE_ACCESS_TOKEN}` },
    })
    if (!response.ok) throw new Error(`Could not resolve the HGI Portal Dev server credential (${response.status}).`)
    const keys = await response.json()
    baseUrl = `https://${EXPECTED_PROJECT_REF}.supabase.co`
    serviceKey = keys.find((item) => item.name === 'service_role')?.api_key
  }
  if (!baseUrl || !serviceKey) {
    throw new Error('Provide local server-only Supabase credentials or SUPABASE_ACCESS_TOKEN; browser VITE variables are not sufficient.')
  }
  const targetRef = new URL(baseUrl).hostname.split('.')[0]
  if (targetRef !== EXPECTED_PROJECT_REF) throw new Error(`Supabase target ${targetRef} is not HGI Portal Dev.`)

  const rawActivity = parseCsv(activityText).filter((row) => row.project_id)
  const rawCost = parseCsv(costText)
  const projectIds = [...new Set(rawActivity.map((row) => row.project_id))]
  if (projectIds.length !== 1 || projectIds[0] !== EXPECTED_OPENAI_PROJECT) {
    throw new Error(`Activity export project scope is not the expected HGI project: ${projectIds.join(', ')}`)
  }
  if (rawActivity.some((row) => row.start_time_iso < EXPECTED_START || row.end_time_iso > EXPECTED_END)) {
    throw new Error('Activity export contains a row outside the approved UTC window.')
  }
  if (rawCost.length !== 18 || rawCost[0]?.start_time_iso !== '2026-10-05T00:00:00' || rawCost.at(-1)?.end_time_iso !== '2026-10-23T00:00:00') {
    throw new Error('Cost export does not cover every approved UTC day from October 5 through October 22.')
  }

  const activityRows = rawActivity.map((source) => {
    const metadata = modelMetadata(source.model)
    const row = {
      provider: 'openai',
      provider_project_id: source.project_id,
      usage_date: isoDay(source.start_time_iso),
      period_start_at: source.start_time_iso,
      period_end_at: source.end_time_iso,
      provider_model: source.model,
      telemetry_model: metadata.telemetryModel,
      operation_type: metadata.operationType,
      request_count: integer(source.num_model_requests),
      input_tokens: integer(source.input_tokens),
      output_tokens: integer(source.output_tokens),
      cached_input_tokens: integer(source.input_cached_tokens),
      text_input_tokens: integer(source.input_text_tokens),
      text_output_tokens: integer(source.output_text_tokens),
      image_input_tokens: integer(source.input_image_tokens),
      image_output_tokens: integer(source.output_image_tokens),
      calculated_estimated_cost_usd: null,
      source_file_name: basename(activityPath),
      source_file_sha256: activityHash,
    }
    row.calculated_estimated_cost_usd = calculatedCost(row)
    row.source_row_sha256 = sha256(canonicalJson(row))
    return row
  })

  const activityByDate = new Map()
  for (const row of activityRows) activityByDate.set(row.usage_date, (activityByDate.get(row.usage_date) ?? 0) + row.calculated_estimated_cost_usd)
  const costRows = rawCost.map((source) => {
    const usageDate = isoDay(source.start_time_iso)
    const actualCost = number(source.amount_value)
    const activityCost = activityByDate.get(usageDate) ?? 0
    if (Math.abs(actualCost - activityCost) > 0.000000001) {
      throw new Error(`Cost scope does not reconcile to HGI activity on ${usageDate}: ${actualCost} vs ${activityCost}`)
    }
    const row = {
      provider: 'openai',
      reconciled_project_id: EXPECTED_OPENAI_PROJECT,
      export_project_id: source.project_id || null,
      usage_date: usageDate,
      period_start_at: withUtcOffset(source.start_time_iso),
      period_end_at: withUtcOffset(source.end_time_iso),
      actual_cost_usd: actualCost,
      currency: source.amount_currency || 'usd',
      scope_verification: source.project_id ? 'export_project_id' : 'daily_activity_exact_match',
      source_file_name: basename(costPath),
      source_file_sha256: costHash,
    }
    row.source_row_sha256 = sha256(canonicalJson(row))
    return row
  })

  const [generationRows, entranceRows] = await Promise.all([
    fetchAll(baseUrl, serviceKey, 'ai_generation_usage', 'created_at,model,status,input_tokens,output_tokens,estimated_cost_usd,provider_request_id', 'created_at'),
    fetchAll(baseUrl, serviceKey, 'ai_entrance_detection_usage', 'created_at,model,status,input_tokens,output_tokens,estimated_cost_usd,provider_request_id', 'created_at'),
  ])
  const recorded = new Map()
  for (const row of [...generationRows, ...entranceRows]) {
    const key = telemetryKey(isoDay(row.created_at), row.model)
    recorded.set(key, (recorded.get(key) ?? 0) + 1)
  }
  const daily = activityRows.map((row) => {
    const recordedRequestCount = recorded.get(telemetryKey(row.usage_date, row.telemetry_model)) ?? 0
    return {
      usageDate: row.usage_date,
      providerModel: row.provider_model,
      operationType: row.operation_type,
      providerRequestCount: row.request_count,
      recordedRequestCount,
      historicalAggregateRequestCount: Math.max(row.request_count - recordedRequestCount, 0),
      reconciledRequestCount: Math.max(row.request_count, recordedRequestCount),
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      calculatedEstimatedCostUsd: row.calculated_estimated_cost_usd,
    }
  })

  const totals = {
    providerRequests: activityRows.reduce((sum, row) => sum + row.request_count, 0),
    recordedRequestRows: generationRows.length + entranceRows.length,
    historicalAggregateRequests: daily.reduce((sum, row) => sum + row.historicalAggregateRequestCount, 0),
    reconciledRequests: daily.reduce((sum, row) => sum + row.reconciledRequestCount, 0),
    generationRows: generationRows.length,
    entranceRows: entranceRows.length,
    providerActualCostUsd: costRows.reduce((sum, row) => sum + row.actual_cost_usd, 0),
    providerActivityCalculatedCostUsd: activityRows.reduce((sum, row) => sum + row.calculated_estimated_cost_usd, 0),
    existingInternalEstimatedCostUsd: [...generationRows, ...entranceRows].reduce((sum, row) => sum + number(row.estimated_cost_usd), 0),
  }
  totals.providerActualCostUsd = Number(totals.providerActualCostUsd.toFixed(10))
  totals.providerActivityCalculatedCostUsd = Number(totals.providerActivityCalculatedCostUsd.toFixed(10))
  totals.existingInternalEstimatedCostUsd = Number(totals.existingInternalEstimatedCostUsd.toFixed(10))
  const models = Object.fromEntries([...new Set(activityRows.map((row) => row.provider_model))].sort().map((model) => [
    model,
    activityRows.filter((row) => row.provider_model === model).reduce((sum, row) => sum + row.request_count, 0),
  ]))
  if (totals.providerRequests !== 300 || totals.reconciledRequests !== 300 || totals.historicalAggregateRequests !== 218) {
    throw new Error(`Unexpected reconciliation totals: ${JSON.stringify(totals)}`)
  }
  if (Math.abs(totals.providerActualCostUsd - 16.41474045) > 0.000000001) throw new Error('Provider cost total does not match the official export.')

  let applyPlan = { activity: { insert: activityRows.length, skip: 0 }, cost: { insert: costRows.length, skip: 0 } }
  if (apply) {
    const [existingActivity, existingCost] = await Promise.all([
      fetchReconciliationRows(baseUrl, serviceKey, 'ai_provider_activity_daily', 'provider,provider_project_id,usage_date,provider_model,source_row_sha256'),
      fetchReconciliationRows(baseUrl, serviceKey, 'ai_provider_cost_daily', 'provider,reconciled_project_id,usage_date,currency,source_row_sha256'),
    ])
    const activityPlan = prepareIdempotentInsert(
      activityRows,
      existingActivity,
      (row) => `${row.provider}|${row.provider_project_id}|${row.usage_date}|${row.provider_model}`,
    )
    const costPlan = prepareIdempotentInsert(
      costRows,
      existingCost,
      (row) => `${row.provider}|${row.reconciled_project_id}|${row.usage_date}|${row.currency}`,
    )
    applyPlan = {
      activity: { insert: activityPlan.inserts.length, skip: activityPlan.skipped.length },
      cost: { insert: costPlan.inserts.length, skip: costPlan.skipped.length },
    }
    await insertRows(baseUrl, serviceKey, 'ai_provider_activity_daily', activityPlan.inserts)
    await insertRows(baseUrl, serviceKey, 'ai_provider_cost_daily', costPlan.inserts)
  }

  const report = {
    mode: apply ? 'apply' : 'dry-run',
    target: { name: 'HGI Portal Dev', projectRef: targetRef },
    utcWindow: { startInclusive: EXPECTED_START, endExclusive: EXPECTED_END },
    sources: {
      activity: { path: activityPath, sha256: activityHash, rows: activityRows.length },
      cost: { path: costPath, sha256: costHash, rows: costRows.length },
    },
    openAiProjectId: EXPECTED_OPENAI_PROJECT,
    models,
    totals,
    daily,
    applyPlan,
    writesPerformed: apply && (applyPlan.activity.insert > 0 || applyPlan.cost.insert > 0),
    limitations: [
      'Aggregate exports contain no individual provider request IDs or workflow IDs.',
      'Success, failure, environment, latency, and retry relationships cannot be reconstructed.',
      'The five legacy gpt-4o-mini calls remain unclassified because the export does not identify their endpoint.',
      'Provider actual cost remains separate from calculated internal estimates.',
    ],
  }
  if (reportPath) await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
