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
}

function safeSegment(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'door-style'
}

async function readDimensions(file: File) {
  const url = URL.createObjectURL(file)
  try {
    return await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
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
  const { width, height } = await readDimensions(file)
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
  }
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

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`
}
