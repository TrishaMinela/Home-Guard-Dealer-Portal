import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = fileURLToPath(new URL('.', import.meta.url))
const defaultManifest = resolve(scriptDirectory, '../docs/inventory/door-storage-manifest.json')

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

const manifestPath = resolve(argument('--manifest') ?? defaultManifest)
const sourceRoot = resolve(argument('--source-root') ?? process.env.DOOR_BUILDER_ROOT ?? '/Users/trishaminela/Door-Builder')
const storageRootArgument = argument('--storage-root')
const storageRoot = storageRootArgument ? resolve(storageRootArgument) : null
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const {
  manifestChecksum: expectedManifestChecksum,
  manifestChecksumAlgorithm,
  ...checksumPayload
} = manifest

if (manifestChecksumAlgorithm !== 'sha256') throw new Error(`Unsupported manifest checksum: ${manifestChecksumAlgorithm}`)
const actualManifestChecksum = sha256(canonical(checksumPayload))
if (actualManifestChecksum !== expectedManifestChecksum) {
  throw new Error(`Manifest checksum mismatch: expected ${expectedManifestChecksum}, received ${actualManifestChecksum}`)
}
if (manifest.target?.projectRef !== 'udbcnpjtwhmjzpjjhoph' || manifest.target?.production !== false) {
  throw new Error('Manifest is not explicitly scoped to HGI Portal Dev.')
}
if (manifest.catalogRevision?.status !== 'draft') throw new Error('Catalog revision is not draft.')
if (manifest.entries.length !== 159) throw new Error(`Expected 159 bound files, received ${manifest.entries.length}`)
if (manifest.reviewedOverlays.length !== 2) throw new Error(`Expected 2 reviewed overlays, received ${manifest.reviewedOverlays.length}`)
if (manifest.unboundReview.length !== 8) throw new Error(`Expected 8 unbound review files, received ${manifest.unboundReview.length}`)

const activeEntries = [...manifest.entries, ...manifest.reviewedOverlays]
const objectPaths = activeEntries.map((entry) => entry.proposedObjectPath)
if (new Set(objectPaths).size !== objectPaths.length) throw new Error('Duplicate proposed Storage object paths detected.')

const activeSourcePaths = new Set(activeEntries.map((entry) => entry.currentPath))
for (const entry of manifest.unboundReview) {
  if (entry.activeUploadCandidate !== false || activeSourcePaths.has(entry.currentPath)) {
    throw new Error(`Unbound file incorrectly scheduled for upload: ${entry.currentPath}`)
  }
}

let verifiedSourceBytes = 0
let verifiedStorageBytes = 0
for (const entry of [...activeEntries, ...manifest.unboundReview]) {
  if (!entry.checksumSha256) throw new Error(`Missing checksum: ${entry.currentPath}`)
  const sourceFile = resolve(sourceRoot, entry.sourceFile)
  if (!existsSync(sourceFile)) throw new Error(`Missing source file: ${sourceFile}`)
  const sourceBytes = readFileSync(sourceFile)
  const sourceChecksum = sha256(sourceBytes)
  if (sourceChecksum !== entry.checksumSha256) throw new Error(`Source checksum mismatch: ${entry.currentPath}`)
  if (sourceBytes.length !== entry.fileSize || statSync(sourceFile).size !== entry.fileSize) {
    throw new Error(`Source size mismatch: ${entry.currentPath}`)
  }
  if (entry.databaseReference) {
    if (entry.databaseReference.checksumSha256 !== entry.checksumSha256) throw new Error(`Database checksum mismatch: ${entry.currentPath}`)
    if (entry.databaseReference.byteSize !== entry.fileSize) throw new Error(`Database byte size mismatch: ${entry.currentPath}`)
  }
  if (activeSourcePaths.has(entry.currentPath)) verifiedSourceBytes += sourceBytes.length

  if (storageRoot && entry.proposedObjectPath) {
    const storedFile = resolve(storageRoot, entry.proposedObjectPath)
    if (!existsSync(storedFile)) throw new Error(`Missing downloaded Storage object: ${storedFile}`)
    const storedBytes = readFileSync(storedFile)
    if (sha256(storedBytes) !== entry.checksumSha256) throw new Error(`Storage checksum mismatch: ${entry.proposedObjectPath}`)
    verifiedStorageBytes += storedBytes.length
  }
}

const thumbnailEntries = manifest.entries.filter((entry) => entry.assetTypes.includes('thumbnail')).length
const renderEntries = manifest.entries.filter((entry) => entry.assetTypes.includes('render')).length
const maskEntries = manifest.entries.filter((entry) => entry.assetTypes.includes('mask')).length

console.log('Door Storage manifest verified.')
console.log(`Manifest checksum: ${actualManifestChecksum}`)
console.log(`Bound files: ${manifest.entries.length}`)
console.log(`Thumbnail uses: ${thumbnailEntries}`)
console.log(`Render uses: ${renderEntries}`)
console.log(`Mask uses: ${maskEntries}`)
console.log(`Reviewed overlays: ${manifest.reviewedOverlays.length}`)
console.log(`Unbound review files excluded: ${manifest.unboundReview.length}`)
console.log(`Verified active source bytes: ${verifiedSourceBytes}`)
console.log(`Storage objects verified: ${storageRoot ? activeEntries.length : 0}`)
if (storageRoot) console.log(`Verified Storage bytes: ${verifiedStorageBytes}`)
