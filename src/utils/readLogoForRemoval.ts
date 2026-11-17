import { assessBackgroundRemoval, sampleLogoInk, type LogoInkSample } from './logoBackground'

export async function readLogoForRemoval(file: File): Promise<{ confident: boolean; reason: string; png: Blob | null }> {
  if (file.type === 'image/svg+xml') {
    return { confident: false, reason: 'SVG logos are left unchanged.', png: null }
  }
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return { confident: false, reason: 'This browser cannot inspect the logo.', png: null }
  context.drawImage(bitmap, 0, 0)
  bitmap.close()
  const image = context.getImageData(0, 0, canvas.width, canvas.height)
  const result = assessBackgroundRemoval(image.data, canvas.width, canvas.height)
  if (!result.confident) return { confident: false, reason: result.reason, png: null }
  const copy = new Uint8ClampedArray(result.pixels)
  context.putImageData(new ImageData(copy, result.width, result.height), 0, 0)
  const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  return { confident: true, reason: result.reason, png }
}

export async function inspectLogoAgainstSurface(url: string, background: string): Promise<LogoInkSample | null> {
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    const blob = await response.blob()
    if (blob.type === 'image/svg+xml') return { transparent: true, contrasts: true, contrastingShare: 1 }
    const bitmap = await createImageBitmap(blob)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) {
      bitmap.close()
      return null
    }
    context.drawImage(bitmap, 0, 0)
    bitmap.close()
    const image = context.getImageData(0, 0, canvas.width, canvas.height)
    return sampleLogoInk(image.data, canvas.width, canvas.height, background)
  } catch {
    return null
  }
}
