import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const EXPECTED_PROJECT_REF = 'udbcnpjtwhmjzpjjhoph'
const EXPECTED_MANIFEST_CHECKSUM = 'ae1c3c8d284069750cf5de896f43f0552c8bfc2e88da36318f6885bdeb1454f8'
const EXPECTED_BUCKET = 'door-catalog-assets'
const scriptDirectory = fileURLToPath(new URL('.', import.meta.url))
const manifestPath = resolve(scriptDirectory, '../docs/inventory/door-storage-manifest.json')

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

let verifiedBytes = 0
for (const entry of manifest.entries) {
  const { data, error } = await supabase.storage.from(EXPECTED_BUCKET).download(entry.proposedObjectPath)
  if (error || !data) throw new Error(`Missing Storage object: ${entry.proposedObjectPath}`)
  const bytes = Buffer.from(await data.arrayBuffer())
  if (bytes.length !== entry.fileSize) throw new Error(`Storage size mismatch: ${entry.proposedObjectPath}`)
  if (sha256(bytes) !== entry.checksumSha256) throw new Error(`Storage checksum mismatch: ${entry.proposedObjectPath}`)
  verifiedBytes += bytes.length
}

console.log('Remote door Storage verification passed.')
console.log(`Target: HGI Portal Dev (${EXPECTED_PROJECT_REF})`)
console.log(`Manifest checksum: ${computedManifestChecksum}`)
console.log(`Objects verified: ${manifest.entries.length}`)
console.log(`Bytes verified: ${verifiedBytes}`)
console.log(`Review overlays excluded: ${manifest.reviewedOverlays.length}`)
console.log(`Unbound files excluded: ${manifest.unboundReview.length}`)
console.log('Read-only verification: no upload, update, or delete operation is implemented by this script.')
