#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'

const SOURCE_REF = 'bslpxnbyndvdrarhwwac'
const DESTINATION_REF = 'udbcnpjtwhmjzpjjhoph'
const OPERATIONAL_TABLES = [
  'dealers',
  'leads',
  'ai_generation_usage',
  'ai_entrance_detection_usage',
]
const AUTH_LINKED_TABLES = ['dealer_users', 'home_guard_admins', 'notification_reads']
const INVENTORY_GUARD_SQL = `select json_build_object(
  'catalog_status', (select status from public.catalog_revisions order by created_at desc limit 1),
  'door_styles', (select count(*) from public.door_styles),
  'door_variants', (select count(*) from public.door_variants),
  'inventory_assets', (select count(*) from public.assets),
  'door_storage_objects', (select count(*) from storage.objects where bucket_id = 'door-catalog-assets'),
  'dev_admins', (select count(*) from public.home_guard_admins),
  'auth_users', (select count(*) from auth.users)
) as guard`

const args = new Set(process.argv.slice(2))
const apply = args.has('--apply')
const reportArg = process.argv.findIndex((value) => value === '--report')
const reportPath = reportArg >= 0 ? process.argv[reportArg + 1] : null
const accessToken = process.env.SUPABASE_ACCESS_TOKEN

if (!accessToken) throw new Error('SUPABASE_ACCESS_TOKEN is required.')
if (args.has('--source-ref') || args.has('--destination-ref')) {
  throw new Error('Project references are fixed in this DEV-only script and cannot be overridden.')
}

const report = {
  mode: apply ? 'apply' : 'dry-run',
  source: { projectRef: SOURCE_REF, readOnly: true },
  destination: { projectRef: DESTINATION_REF },
  inventoryTablesWritten: [],
  tables: {},
  settings: null,
  storage: { bucket: 'dealer-logos', planned: 0, copied: 0, verified: 0, skipped: 0, conflicts: [] },
  inventoryGuardBefore: null,
  inventoryGuardAfter: null,
  errors: [],
}

async function managementFetch(path, options = {}) {
  const response = await fetch(`https://api.supabase.com/v1${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', ...(options.headers ?? {}) },
  })
  if (!response.ok) throw new Error(`Supabase Management API ${response.status}: ${await response.text()}`)
  return response.json()
}

async function projectInfo(ref) {
  const project = await managementFetch(`/projects/${ref}`)
  return { id: project.id, name: project.name, status: project.status }
}

async function serviceKey(ref) {
  const keys = await managementFetch(`/projects/${ref}/api-keys`)
  const key = keys.find((item) => item.name === 'service_role')?.api_key
  if (!key) throw new Error(`No service-role key is available for project ${ref}.`)
  return key
}

async function databaseQuery(ref, query) {
  return managementFetch(`/projects/${ref}/database/query`, { method: 'POST', body: JSON.stringify({ query }) })
}

async function rest(ref, key, table, options = {}) {
  const query = options.query ? `?${options.query}` : ''
  const response = await fetch(`https://${ref}.supabase.co/rest/v1/${table}${query}`, {
    method: options.method ?? 'GET',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: options.prefer ?? 'return=representation',
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  if (!response.ok) throw new Error(`${table} ${response.status}: ${await response.text()}`)
  if (response.status === 204) return []
  const text = await response.text()
  return text ? JSON.parse(text) : []
}

async function selectAll(ref, key, table) {
  return rest(ref, key, table, { query: 'select=*' })
}

function equivalent(a, b) {
  return JSON.stringify(a, Object.keys(a).sort()) === JSON.stringify(b, Object.keys(b).sort())
}

function nonIdentitySettings(row) {
  const values = { ...row }
  delete values.id
  delete values.created_at
  delete values.updated_at
  return values
}

function naturalConflict(table, sourceRow, destinationRows) {
  if (table === 'dealers') return destinationRows.find((row) => row.slug === sourceRow.slug && row.id !== sourceRow.id)
  if (table === 'leads' && sourceRow.submission_id) return destinationRows.find((row) => row.submission_id === sourceRow.submission_id && row.id !== sourceRow.id)
  if (table === 'ai_generation_usage' || table === 'ai_entrance_detection_usage') {
    return destinationRows.find((row) => row.request_id === sourceRow.request_id && row.id !== sourceRow.id)
  }
  return null
}

function rewriteStorageUrl(value) {
  if (typeof value !== 'string') return value
  return value.replace(`https://${SOURCE_REF}.supabase.co/storage/v1/object/public/dealer-logos/`, `https://${DESTINATION_REF}.supabase.co/storage/v1/object/public/dealer-logos/`)
}

async function listStorage(ref, key, prefix = '') {
  const response = await fetch(`https://${ref}.supabase.co/storage/v1/object/list/dealer-logos`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix, limit: 1000, offset: 0, sortBy: { column: 'name', order: 'asc' } }),
  })
  if (!response.ok) throw new Error(`Storage list ${response.status}: ${await response.text()}`)
  const entries = await response.json()
  const files = []
  for (const entry of entries) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.id) files.push({ name, metadata: entry.metadata ?? {} })
    else files.push(...await listStorage(ref, key, name))
  }
  return files
}

async function downloadStorage(ref, key, name) {
  const response = await fetch(`https://${ref}.supabase.co/storage/v1/object/authenticated/dealer-logos/${name}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  if (!response.ok) throw new Error(`Storage download ${name} ${response.status}`)
  return { bytes: new Uint8Array(await response.arrayBuffer()), contentType: response.headers.get('content-type') ?? 'application/octet-stream' }
}

async function uploadStorage(ref, key, name, bytes, contentType) {
  const response = await fetch(`https://${ref}.supabase.co/storage/v1/object/dealer-logos/${name}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': contentType, 'x-upsert': 'false' },
    body: bytes,
  })
  if (!response.ok) throw new Error(`Storage upload ${name} ${response.status}: ${await response.text()}`)
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

async function main() {
  const [sourceProject, destinationProject] = await Promise.all([projectInfo(SOURCE_REF), projectInfo(DESTINATION_REF)])
  if (destinationProject.id !== DESTINATION_REF || !/dev/i.test(destinationProject.name)) throw new Error('Destination is not the expected HGI Portal Dev project.')
  report.source.project = sourceProject
  report.destination.project = destinationProject

  const [sourceKey, destinationKey] = await Promise.all([serviceKey(SOURCE_REF), serviceKey(DESTINATION_REF)])
  const guardBefore = await databaseQuery(DESTINATION_REF, INVENTORY_GUARD_SQL)
  report.inventoryGuardBefore = guardBefore[0]?.guard
  if (report.inventoryGuardBefore?.catalog_status !== 'draft' || Number(report.inventoryGuardBefore?.door_styles) !== 42 || Number(report.inventoryGuardBefore?.door_storage_objects) !== 159) {
    throw new Error('Destination inventory guard failed; no operational data will be copied.')
  }

  const authRows = await databaseQuery(DESTINATION_REF, 'select id from auth.users order by id')
  const destinationAuthIds = new Set(authRows.map((row) => row.id))

  for (const table of OPERATIONAL_TABLES) {
    const [sourceRows, destinationRows] = await Promise.all([selectAll(SOURCE_REF, sourceKey, table), selectAll(DESTINATION_REF, destinationKey, table)])
    const destinationIds = new Set(destinationRows.map((row) => row.id))
    const inserts = []
    const skipped = []
    const conflicts = []
    for (const sourceRow of sourceRows) {
      if (destinationIds.has(sourceRow.id)) { skipped.push({ id: sourceRow.id, reason: 'same primary key already exists' }); continue }
      const conflict = naturalConflict(table, sourceRow, destinationRows)
      if (conflict) { conflicts.push({ id: sourceRow.id, reason: 'natural key belongs to a different destination row' }); continue }
      inserts.push(table === 'dealers' ? { ...sourceRow, logo_url: rewriteStorageUrl(sourceRow.logo_url), logo_light_url: rewriteStorageUrl(sourceRow.logo_light_url) } : sourceRow)
    }
    report.tables[table] = { source: sourceRows.length, destinationBefore: destinationRows.length, planned: inserts.length, copied: 0, skipped, conflicts }
    if (conflicts.length) throw new Error(`${table} has unresolved destination conflicts.`)
    if (apply && inserts.length) {
      const copied = await rest(DESTINATION_REF, destinationKey, table, { method: 'POST', query: 'on_conflict=id', prefer: 'resolution=ignore-duplicates,return=representation', body: inserts })
      report.tables[table].copied = copied.length
    }
  }

  for (const table of AUTH_LINKED_TABLES) {
    const [sourceRows, destinationRows] = await Promise.all([selectAll(SOURCE_REF, sourceKey, table), selectAll(DESTINATION_REF, destinationKey, table)])
    const eligible = sourceRows.filter((row) => destinationAuthIds.has(row.user_id))
    const skipped = sourceRows.filter((row) => !destinationAuthIds.has(row.user_id)).map((row) => ({ id: row.id, reason: 'referenced Auth user does not exist in DEV' }))
    report.tables[table] = { source: sourceRows.length, destinationBefore: destinationRows.length, planned: eligible.length, copied: 0, skipped, conflicts: [] }
    if (apply && eligible.length) {
      const copied = await rest(DESTINATION_REF, destinationKey, table, { method: 'POST', query: 'on_conflict=id', prefer: 'resolution=ignore-duplicates,return=representation', body: eligible })
      report.tables[table].copied = copied.length
    }
  }

  const [sourceSettings, destinationSettings] = await Promise.all([selectAll(SOURCE_REF, sourceKey, 'home_guard_settings'), selectAll(DESTINATION_REF, destinationKey, 'home_guard_settings')])
  if (sourceSettings.length === 1 && destinationSettings.length === 1) {
    const sourceValues = nonIdentitySettings(sourceSettings[0])
    const destinationValues = nonIdentitySettings(destinationSettings[0])
    if (equivalent(sourceValues, destinationValues)) report.settings = { action: 'preserve', reason: 'source and destination values are identical', destinationId: destinationSettings[0].id }
    else {
      report.settings = { action: 'update-existing', destinationId: destinationSettings[0].id, values: sourceValues }
      if (apply) await rest(DESTINATION_REF, destinationKey, 'home_guard_settings', { method: 'PATCH', query: `id=eq.${destinationSettings[0].id}`, body: sourceValues })
    }
  } else throw new Error('Unexpected Home Guard settings cardinality.')

  const [sourceFiles, destinationFiles] = await Promise.all([listStorage(SOURCE_REF, sourceKey), listStorage(DESTINATION_REF, destinationKey)])
  const destinationNames = new Set(destinationFiles.map((file) => file.name))
  report.storage.planned = sourceFiles.length
  for (const sourceFile of sourceFiles) {
    const sourceObject = await downloadStorage(SOURCE_REF, sourceKey, sourceFile.name)
    if (destinationNames.has(sourceFile.name)) {
      const destinationObject = await downloadStorage(DESTINATION_REF, destinationKey, sourceFile.name)
      if (sha256(sourceObject.bytes) !== sha256(destinationObject.bytes)) {
        report.storage.conflicts.push({ name: sourceFile.name, reason: 'destination object differs' })
      } else { report.storage.verified += 1; report.storage.skipped += 1 }
      continue
    }
    if (apply) {
      await uploadStorage(DESTINATION_REF, destinationKey, sourceFile.name, sourceObject.bytes, sourceObject.contentType)
      const uploaded = await downloadStorage(DESTINATION_REF, destinationKey, sourceFile.name)
      if (sha256(sourceObject.bytes) !== sha256(uploaded.bytes)) throw new Error(`Uploaded Storage checksum mismatch: ${sourceFile.name}`)
      report.storage.copied += 1
      report.storage.verified += 1
    }
  }
  if (report.storage.conflicts.length) throw new Error('Dealer logo Storage conflicts require review.')

  const guardAfter = await databaseQuery(DESTINATION_REF, INVENTORY_GUARD_SQL)
  report.inventoryGuardAfter = guardAfter[0]?.guard
  if (!equivalent(report.inventoryGuardBefore, report.inventoryGuardAfter)) throw new Error('Inventory or DEV admin guard changed unexpectedly.')
}

try {
  await main()
} catch (error) {
  report.errors.push(error instanceof Error ? error.message : String(error))
}

if (reportPath) await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
if (report.errors.length) process.exitCode = 1
