import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const EXPECTED_PROJECT_REF = 'udbcnpjtwhmjzpjjhoph'
const EXPECTED_MANIFEST_CHECKSUM = 'ae1c3c8d284069750cf5de896f43f0552c8bfc2e88da36318f6885bdeb1454f8'
const EXPECTED_BUCKET = 'door-catalog-assets'
const scriptDirectory = fileURLToPath(new URL('.', import.meta.url))
const defaultManifest = resolve(scriptDirectory, '../docs/inventory/door-storage-manifest.json')

function argument(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function hasFlag(name) {
  return process.argv.includes(name)
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

function contentType(path) {
  const extension = extname(path).toLowerCase()
  if (extension === '.png') return 'image/png'
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg'
  if (extension === '.webp') return 'image/webp'
  throw new Error(`Unsupported image type: ${path}`)
}

function projectRefFromUrl(url) {
  const hostname = new URL(url).hostname
  return hostname.endsWith('.supabase.co') ? hostname.split('.')[0] : null
}

const upload = hasFlag('--upload')
const dryRun = !upload
const manifestPath = resolve(argument('--manifest') ?? defaultManifest)
const sourceRoot = resolve(argument('--source-root') ?? process.env.DOOR_BUILDER_ROOT ?? '/Users/trishaminela/Door-Builder')
const requestedProjectRef = argument('--project-ref')
const reportPath = argument('--report')

if (upload && requestedProjectRef !== EXPECTED_PROJECT_REF) {
  throw new Error(`Real upload requires --project-ref ${EXPECTED_PROJECT_REF}.`)
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const { manifestChecksum, manifestChecksumAlgorithm, ...checksumPayload } = manifest
const computedManifestChecksum = sha256(canonical(checksumPayload))

if (manifestChecksumAlgorithm !== 'sha256') throw new Error(`Unsupported manifest checksum: ${manifestChecksumAlgorithm}`)
if (manifestChecksum !== EXPECTED_MANIFEST_CHECKSUM || computedManifestChecksum !== EXPECTED_MANIFEST_CHECKSUM) {
  throw new Error(`Manifest checksum mismatch. Expected ${EXPECTED_MANIFEST_CHECKSUM}, received ${computedManifestChecksum}.`)
}
if (manifest.target?.projectRef !== EXPECTED_PROJECT_REF || manifest.target?.production !== false) {
  throw new Error('Manifest is not explicitly scoped to HGI Portal Dev.')
}
if (manifest.catalogRevision?.status !== 'draft') throw new Error('Catalog revision is not DRAFT.')
if (manifest.storageBucket !== EXPECTED_BUCKET) throw new Error(`Unexpected bucket: ${manifest.storageBucket}`)
if (manifest.entries.length !== 159) throw new Error(`Expected 159 bound files, received ${manifest.entries.length}.`)
if (manifest.reviewedOverlays.length !== 2) throw new Error('Expected exactly 2 reviewed overlays.')
if (manifest.unboundReview.length !== 8) throw new Error('Expected exactly 8 unbound review files.')

const scheduled = manifest.entries.filter((entry) => entry.migrationStatus === 'ready')
if (scheduled.length !== manifest.entries.length) throw new Error('A bound entry is not marked ready.')
const destinationPaths = scheduled.map((entry) => entry.proposedObjectPath)
if (destinationPaths.some((path) => !path)) throw new Error('A scheduled entry has no destination path.')
if (new Set(destinationPaths).size !== destinationPaths.length) throw new Error('Destination path collision detected.')

let scheduledBytes = 0
for (const entry of scheduled) {
  if (entry.proposedStorageBucket !== EXPECTED_BUCKET) throw new Error(`Unexpected bucket for ${entry.currentPath}.`)
  const sourceFile = resolve(sourceRoot, entry.sourceFile)
  if (!existsSync(sourceFile)) throw new Error(`Missing source file: ${sourceFile}`)
  const bytes = readFileSync(sourceFile)
  if (statSync(sourceFile).size !== entry.fileSize || bytes.length !== entry.fileSize) {
    throw new Error(`File size mismatch: ${entry.currentPath}`)
  }
  if (sha256(bytes) !== entry.checksumSha256) throw new Error(`Checksum mismatch: ${entry.currentPath}`)
  scheduledBytes += bytes.length
}

const report = {
  mode: dryRun ? 'dry-run' : 'upload',
  targetProjectRef: EXPECTED_PROJECT_REF,
  bucket: EXPECTED_BUCKET,
  catalogRevisionId: manifest.catalogRevision.id,
  catalogRevisionStatus: manifest.catalogRevision.status,
  manifestChecksum: computedManifestChecksum,
  scheduledFiles: scheduled.length,
  scheduledBytes,
  excludedReviewOverlays: manifest.reviewedOverlays.length,
  excludedUnboundFiles: manifest.unboundReview.length,
  destinationCollisions: 0,
  uploaded: 0,
  skippedIdentical: 0,
  conflicts: 0,
  objects: scheduled.map((entry) => ({
    source: entry.currentPath,
    destination: entry.proposedObjectPath,
    bytes: entry.fileSize,
    checksumSha256: entry.checksumSha256,
  })),
}

if (upload) {
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for real upload mode.')
  if (projectRefFromUrl(supabaseUrl) !== EXPECTED_PROJECT_REF) throw new Error('SUPABASE_URL does not target HGI Portal Dev.')

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: revision, error: revisionError } = await supabase
    .from('catalog_revisions')
    .select('id,status')
    .eq('id', manifest.catalogRevision.id)
    .single()
  if (revisionError || revision?.status !== 'draft') throw new Error('The manifest catalog revision is not DRAFT in HGI Portal Dev.')

  for (const entry of scheduled) {
    const sourceBytes = readFileSync(resolve(sourceRoot, entry.sourceFile))
    const { data: existing, error: downloadError } = await supabase.storage
      .from(EXPECTED_BUCKET)
      .download(entry.proposedObjectPath)

    if (!downloadError && existing) {
      const existingBytes = Buffer.from(await existing.arrayBuffer())
      if (sha256(existingBytes) !== entry.checksumSha256 || existingBytes.length !== entry.fileSize) {
        report.conflicts += 1
        throw new Error(`Existing object conflicts with manifest: ${entry.proposedObjectPath}`)
      }
      report.skippedIdentical += 1
      continue
    }

    const { error: uploadError } = await supabase.storage
      .from(EXPECTED_BUCKET)
      .upload(entry.proposedObjectPath, sourceBytes, {
        cacheControl: '31536000',
        contentType: contentType(entry.sourceFile),
        upsert: false,
      })
    if (uploadError) throw new Error(`Upload failed for ${entry.proposedObjectPath}: ${uploadError.message}`)

    const { data: uploaded, error: verificationError } = await supabase.storage
      .from(EXPECTED_BUCKET)
      .download(entry.proposedObjectPath)
    if (verificationError || !uploaded) throw new Error(`Could not verify uploaded object: ${entry.proposedObjectPath}`)
    const uploadedBytes = Buffer.from(await uploaded.arrayBuffer())
    if (sha256(uploadedBytes) !== entry.checksumSha256 || uploadedBytes.length !== entry.fileSize) {
      report.conflicts += 1
      throw new Error(`Post-upload verification failed: ${entry.proposedObjectPath}`)
    }
    report.uploaded += 1
  }
}

if (reportPath) writeFileSync(resolve(reportPath), `${JSON.stringify(report, null, 2)}\n`)

console.log(`Door asset upload ${report.mode} complete.`)
console.log(`Target project: HGI Portal Dev (${report.targetProjectRef})`)
console.log(`Manifest checksum: ${report.manifestChecksum}`)
console.log(`Scheduled: ${report.scheduledFiles} files (${report.scheduledBytes} bytes)`)
console.log(`Excluded: ${report.excludedReviewOverlays} review overlays; ${report.excludedUnboundFiles} unbound files`)
console.log(`Destination collisions: ${report.destinationCollisions}`)
console.log(`Uploaded: ${report.uploaded}; skipped identical: ${report.skippedIdentical}; conflicts: ${report.conflicts}`)
if (dryRun) console.log('DRY RUN ONLY: no Storage or database writes were performed.')
