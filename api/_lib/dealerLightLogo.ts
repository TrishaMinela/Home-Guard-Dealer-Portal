import sharp from 'sharp'

const MAX_SOURCE_BYTES = 5 * 1024 * 1024
const MAX_DIMENSION = 2048

export function validatePrimaryLogoUrl(value: string, dealerId: string, supabaseUrl: string): URL {
  const logoUrl = new URL(value)
  const expectedOrigin = new URL(supabaseUrl).origin
  const expectedPrefix = `/storage/v1/object/public/dealer-logos/${dealerId}/logo.`
  if (logoUrl.origin !== expectedOrigin || !decodeURIComponent(logoUrl.pathname).startsWith(expectedPrefix)) {
    throw new Error('Primary logo is not an approved dealer-logo asset.')
  }
  return logoUrl
}

export async function generateWhiteLogo(source: Buffer): Promise<Buffer> {
  if (!source.length || source.length > MAX_SOURCE_BYTES) throw new Error('Primary logo size is invalid.')
  const { data, info } = await sharp(source, { limitInputPixels: 24_000_000 })
    .rotate()
    .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const output = Buffer.alloc(data.length)
  let hasTransparency = false
  for (let offset = 3; offset < data.length; offset += 4) {
    if (data[offset] < 250) { hasTransparency = true; break }
  }

  const corners = [0, (info.width - 1) * 4, (info.width * (info.height - 1)) * 4, (info.width * info.height - 1) * 4]
  const background = corners.reduce((channels, offset) => {
    channels[0] += data[offset]
    channels[1] += data[offset + 1]
    channels[2] += data[offset + 2]
    return channels
  }, [0, 0, 0]).map((channel) => channel / corners.length)

  for (let offset = 0; offset < data.length; offset += 4) {
    output[offset] = 255
    output[offset + 1] = 255
    output[offset + 2] = 255
    if (hasTransparency) {
      output[offset + 3] = data[offset + 3]
    } else {
      const distance = Math.sqrt(
        (data[offset] - background[0]) ** 2
        + (data[offset + 1] - background[1]) ** 2
        + (data[offset + 2] - background[2]) ** 2,
      )
      output[offset + 3] = Math.max(0, Math.min(255, Math.round((distance - 10) * 4)))
    }
  }

  return sharp(output, { raw: info }).png({ compressionLevel: 9 }).toBuffer()
}
