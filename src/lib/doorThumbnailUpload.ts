export const DOOR_ASSET_BUCKET = 'door-catalog-assets'
export const MAX_DOOR_ASSET_BYTES = 10 * 1024 * 1024
export const ALLOWED_DOOR_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const

export type PreparedDoorThumbnail = {
  file: File
  previewUrl: string
  width: number
  height: number
  checksum: string
  warning: string
  hasTransparency: boolean
}

function safeSegment(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'door-style'
}

async function inspectImage(file: File) {
  const url = URL.createObjectURL(file)
  try {
    return await new Promise<{ width: number; height: number; hasTransparency: boolean }>((resolve, reject) => {
      const image = new Image()
      image.onload = () => {
        const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
        const context = canvas.getContext('2d', { willReadFrequently: true })
        context?.drawImage(image, 0, 0)
        let hasTransparency = false
        if (context && file.type !== 'image/jpeg') {
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
          for (let index = 3; index < pixels.length; index += 4) if (pixels[index] < 255) { hasTransparency = true; break }
        }
        resolve({ width: image.naturalWidth, height: image.naturalHeight, hasTransparency })
      }
      image.onerror = () => reject(new Error('The selected file is not a valid image.'))
      image.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function prepareDoorThumbnail(file: File): Promise<PreparedDoorThumbnail> {
  if (!ALLOWED_DOOR_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_DOOR_IMAGE_TYPES)[number])) throw new Error('Choose a PNG, JPEG, or WebP image.')
  if (file.size === 0) throw new Error('The selected image is empty.')
  if (file.size > MAX_DOOR_ASSET_BYTES) throw new Error('The selected image exceeds the 10 MiB limit.')
  const { width, height, hasTransparency } = await inspectImage(file)
  if (!width || !height) throw new Error('The selected image has invalid dimensions.')
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  const checksum = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return {
    file,
    previewUrl: URL.createObjectURL(file),
    width,
    height,
    checksum,
    warning: width < 160 || height < 160 ? 'This image is unusually small and may look soft in the Door Builder.' : '',
    hasTransparency,
  }
}

export async function prepareDoorCatalogAsset(file: File, input: { role: 'slab_render' | 'mask'; expectedWidth: number | null; expectedHeight: number | null }) {
  const prepared = await prepareDoorThumbnail(file)
  if (input.role === 'mask') {
    if (!['image/png', 'image/webp'].includes(file.type)) { URL.revokeObjectURL(prepared.previewUrl); throw new Error('Masks must be PNG or WebP so transparency can be preserved.') }
    if (!prepared.hasTransparency) { URL.revokeObjectURL(prepared.previewUrl); throw new Error('The replacement mask must contain transparent pixels.') }
    if (input.expectedWidth && input.expectedHeight && (prepared.width !== input.expectedWidth || prepared.height !== input.expectedHeight)) {
      URL.revokeObjectURL(prepared.previewUrl); throw new Error(`This mask must remain ${input.expectedWidth} × ${input.expectedHeight}px.`)
    }
  }
  return prepared
}

export function buildDoorThumbnailObjectPath(input: {
  revisionId: string
  styleCode: string
  contentVersion: number
  checksum: string
  filename: string
  mimeType: string
}) {
  const extension = input.mimeType === 'image/png' ? 'png' : input.mimeType === 'image/webp' ? 'webp' : 'jpg'
  return `revisions/${input.revisionId}/styles/${safeSegment(input.styleCode)}/thumbnails/v${input.contentVersion}/${input.checksum.slice(0, 12)}-${safeSegment(input.filename.replace(/\.[^.]+$/, ''))}.${extension}`
}

export function buildDoorAssetObjectPath(input: {
  revisionId: string
  styleCode: string
  role: 'slab_render' | 'mask'
  context: string
  contentVersion: number
  checksum: string
  filename: string
  mimeType: string
}) {
  const extension = input.mimeType === 'image/png' ? 'png' : input.mimeType === 'image/webp' ? 'webp' : 'jpg'
  const roleFolder = input.role === 'slab_render' ? 'renders' : 'masks'
  return `revisions/${input.revisionId}/styles/${safeSegment(input.styleCode)}/${roleFolder}/${safeSegment(input.context)}/v${input.contentVersion}/${input.checksum.slice(0, 12)}-${safeSegment(input.filename.replace(/\.[^.]+$/, ''))}.${extension}`
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`
}
