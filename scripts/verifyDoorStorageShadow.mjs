import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const EXPECTED_PROJECT_REF = 'udbcnpjtwhmjzpjjhoph'
const EXPECTED_MANIFEST_CHECKSUM = 'ae1c3c8d284069750cf5de896f43f0552c8bfc2e88da36318f6885bdeb1454f8'
const EXPECTED_BUCKET = 'door-catalog-assets'
const scriptDirectory = fileURLToPath(new URL('.', import.meta.url))
const manifestPath = resolve(scriptDirectory, '../docs/inventory/door-storage-manifest.json')

function argument(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function canonical(value) {
  return JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right)))
      : item,
  )
}

function projectRefFromUrl(url) {
  const hostname = new URL(url).hostname
  return hostname.endsWith('.supabase.co') ? hostname.split('.')[0] : null
}

function imageMetadata(path) {
  const output = execFileSync('/usr/bin/sips', [
    '-g', 'pixelWidth', '-g', 'pixelHeight', '-g', 'hasAlpha', '-g', 'format', path,
  ], { encoding: 'utf8' })
  const value = (key) => output.match(new RegExp(`\\s${key}: (.+)`))?.[1]?.trim()
  const width = Number(value('pixelWidth'))
  const height = Number(value('pixelHeight'))
  if (!Number.isFinite(width) || !Number.isFinite(height)) throw new Error(`Could not decode image metadata: ${path}`)
  return {
    width,
    height,
    hasAlpha: value('hasAlpha') === 'yes',
    format: value('format'),
    aspectRatio: width / height,
  }
}

const sourceRoot = resolve(argument('--source-root') ?? process.env.DOOR_BUILDER_ROOT ?? '/Users/trishaminela/Door-Builder')
const downloadRoot = resolve(argument('--download-root') ?? `${tmpdir()}/hgi-door-storage-shadow`)
const reportPath = argument('--report') ? resolve(argument('--report')) : null
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const { manifestChecksum, manifestChecksumAlgorithm, ...checksumPayload } = manifest
const computedManifestChecksum = sha256(canonical(checksumPayload))

if (manifestChecksumAlgorithm !== 'sha256' || manifestChecksum !== EXPECTED_MANIFEST_CHECKSUM || computedManifestChecksum !== EXPECTED_MANIFEST_CHECKSUM) {
  throw new Error('Manifest checksum does not match the verified Step 2 checksum.')
}
if (manifest.target?.projectRef !== EXPECTED_PROJECT_REF || manifest.target?.production !== false) throw new Error('Manifest is not scoped to HGI Portal Dev.')
if (manifest.storageBucket !== EXPECTED_BUCKET || manifest.entries.length !== 159) throw new Error('Unexpected bucket or active manifest count.')

const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceRoleKey) throw new Error('Server-only DEV Supabase credentials are required.')
if (projectRefFromUrl(supabaseUrl) !== EXPECTED_PROJECT_REF) throw new Error('SUPABASE_URL does not target HGI Portal Dev.')

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})
mkdirSync(downloadRoot, { recursive: true })

const results = []
for (const entry of manifest.entries) {
  const localPath = resolve(sourceRoot, entry.sourceFile)
  const localBytes = readFileSync(localPath)
  const { data, error } = await supabase.storage.from(EXPECTED_BUCKET).download(entry.proposedObjectPath)
  if (error || !data) throw new Error(`Missing Storage object: ${entry.proposedObjectPath}`)
  const storageBytes = Buffer.from(await data.arrayBuffer())
  const storagePath = resolve(downloadRoot, entry.proposedObjectPath)
  mkdirSync(dirname(storagePath), { recursive: true })
  writeFileSync(storagePath, storageBytes)

  const localChecksum = sha256(localBytes)
  const storageChecksum = sha256(storageBytes)
  if (localChecksum !== entry.checksumSha256 || storageChecksum !== entry.checksumSha256) throw new Error(`Checksum mismatch: ${entry.currentPath}`)
  const localMetadata = imageMetadata(localPath)
  const storageMetadata = imageMetadata(storagePath)
  if (JSON.stringify(localMetadata) !== JSON.stringify(storageMetadata)) throw new Error(`Decoded metadata mismatch: ${entry.currentPath}`)

  results.push({
    assetId: entry.databaseReference.assetId,
    currentPath: entry.currentPath,
    storageObjectPath: entry.proposedObjectPath,
    assetTypes: entry.assetTypes,
    doorStyleCodes: entry.doorStyleCodes,
    series: entry.series,
    grainsOrSurfaces: entry.grainsOrSurfaces,
    reused: entry.reused,
    reuseCount: entry.reuseCount,
    bytes: entry.fileSize,
    checksumSha256: entry.checksumSha256,
    metadata: localMetadata,
  })
}

const report = {
  target: manifest.target,
  catalogRevision: manifest.catalogRevision,
  manifestChecksum: computedManifestChecksum,
  verifiedAt: new Date().toISOString(),
  sourceRoot,
  downloadRoot,
  totals: {
    assets: results.length,
    bytes: results.reduce((sum, result) => sum + result.bytes, 0),
    checksumMatches: results.length,
    dimensionMatches: results.length,
    alphaMatches: results.length,
    aspectRatioMatches: results.length,
    formatMatches: results.length,
    mismatches: 0,
  },
  excluded: { reviewOverlays: manifest.reviewedOverlays.length, unboundPreviewSlabs: manifest.unboundReview.length },
  results,
}

if (reportPath) {
  mkdirSync(dirname(reportPath), { recursive: true })
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
}

console.log('Door Storage shadow verification passed.')
console.log(`Target: HGI Portal Dev (${EXPECTED_PROJECT_REF})`)
console.log(`Assets compared: ${report.totals.assets}`)
console.log(`Bytes compared: ${report.totals.bytes}`)
console.log(`Checksum matches: ${report.totals.checksumMatches}`)
console.log(`Dimension matches: ${report.totals.dimensionMatches}`)
console.log(`Alpha matches: ${report.totals.alphaMatches}`)
console.log(`Aspect-ratio matches: ${report.totals.aspectRatioMatches}`)
console.log(`Mismatches: ${report.totals.mismatches}`)
console.log(`Downloaded comparison copies: ${downloadRoot}`)
console.log('Read-only remote behavior: this script implements Storage download only.')
