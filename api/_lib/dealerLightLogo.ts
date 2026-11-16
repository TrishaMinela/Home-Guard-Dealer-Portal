import sharp from 'sharp'

const MAX_SOURCE_BYTES = 5 * 1024 * 1024
const KNOCKOUT_DELTA = 0.12
const INTERNAL_EDGE_DELTA = 0.18

export type GeneratedWhiteLogo = {
  png: Buffer
  usable: boolean
}

export function validatePrimaryLogoUrl(value: string, dealerId: string, supabaseUrl: string): URL {
  const logoUrl = new URL(value)
  const expectedOrigin = new URL(supabaseUrl).origin
  const expectedPrefix = `/storage/v1/object/public/dealer-logos/${dealerId}/logo.`
  if (logoUrl.origin !== expectedOrigin || !decodeURIComponent(logoUrl.pathname).startsWith(expectedPrefix)) {
    throw new Error('Primary logo is not an approved dealer-logo asset.')
  }
  return logoUrl
}

function relativeLuminance(red: number, green: number, blue: number) {
  const linearize = (channel: number) => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linearize(red) + 0.7152 * linearize(green) + 0.0722 * linearize(blue)
}

function boxBlur(source: Float32Array, width: number, height: number, radius: number, mask: Uint8Array) {
  const horizontal = new Float32Array(width * height)
  const horizontalCount = new Float32Array(width * height)
  const blurred = new Float32Array(width * height)

  for (let y = 0; y < height; y += 1) {
    let sum = 0
    let count = 0
    const row = y * width
    for (let x = -radius; x < width; x += 1) {
      const add = x + radius
      if (add < width && mask[row + add]) {
        sum += source[row + add]
        count += 1
      }
      const remove = x - radius - 1
      if (remove >= 0 && mask[row + remove]) {
        sum -= source[row + remove]
        count -= 1
      }
      if (x >= 0) {
        horizontal[row + x] = sum
        horizontalCount[row + x] = count
      }
    }
  }

  for (let x = 0; x < width; x += 1) {
    let sum = 0
    let count = 0
    for (let y = -radius; y < height; y += 1) {
      const add = y + radius
      if (add < height) {
        sum += horizontal[add * width + x]
        count += horizontalCount[add * width + x]
      }
      const remove = y - radius - 1
      if (remove >= 0) {
        sum -= horizontal[remove * width + x]
        count -= horizontalCount[remove * width + x]
      }
      if (y >= 0) blurred[y * width + x] = count ? sum / count : source[y * width + x]
    }
  }

  return blurred
}

function maskEdges(mask: Uint8Array, width: number, height: number) {
  let edges = 0
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x
      if (x + 1 < width && mask[index] !== mask[index + 1]) edges += 1
      if (y + 1 < height && mask[index] !== mask[index + width]) edges += 1
    }
  }
  return edges
}

function boundingFill(mask: Uint8Array, width: number, height: number) {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  let count = 0
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue
      count += 1
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  if (count === 0) return { count, fill: 0, width: 0, height: 0 }
  return {
    count,
    fill: count / ((maxX - minX + 1) * (maxY - minY + 1)),
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  }
}

function isReadableLightLogo(
  foreground: Uint8Array,
  kept: Uint8Array,
  luminance: Float32Array,
  width: number,
  height: number,
) {
  const foregroundFill = boundingFill(foreground, width, height)
  const keptFill = boundingFill(kept, width, height)
  if (foregroundFill.count === 0 || keptFill.count === 0) return false

  const knockoutRatio = (foregroundFill.count - keptFill.count) / foregroundFill.count
  const outputEdges = maskEdges(kept, width, height)
  const edgeDensity = outputEdges / keptFill.count
  let internalEdges = 0
  let preservedInternalEdges = 0
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x
      if (!foreground[index]) continue
      if (x + 1 < width && foreground[index + 1]) {
        if (Math.abs(luminance[index] - luminance[index + 1]) > INTERNAL_EDGE_DELTA) internalEdges += 1
        if (kept[index] !== kept[index + 1]) preservedInternalEdges += 1
      }
      if (y + 1 < height && foreground[index + width]) {
        if (Math.abs(luminance[index] - luminance[index + width]) > INTERNAL_EDGE_DELTA) internalEdges += 1
        if (kept[index] !== kept[index + width]) preservedInternalEdges += 1
      }
    }
  }

  const nearSolidSilhouette = knockoutRatio < 0.06 && (
    (keptFill.fill >= 0.75 && edgeDensity < 0.15)
    || (keptFill.fill >= 0.92 && outputEdges <= (2 * (keptFill.width + keptFill.height)) + 4)
  )
  const interiorSurvival = preservedInternalEdges / Math.max(internalEdges, 1)
  const lostInterior = internalEdges > Math.max(24, foregroundFill.count * 0.05)
    && interiorSurvival < 0.3
    && knockoutRatio < 0.06

  return !nearSolidSilhouette && !lostInterior
}

export async function generateWhiteLogo(source: Buffer): Promise<GeneratedWhiteLogo> {
  if (!source.length || source.length > MAX_SOURCE_BYTES) throw new Error('Primary logo size is invalid.')
  const { data, info } = await sharp(source, { limitInputPixels: 24_000_000 })
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const width = info.width
  const height = info.height
  const luminance = new Float32Array(width * height)
  const foreground = new Uint8Array(width * height)
  let hasTransparency = false
  for (let offset = 3; offset < data.length; offset += 4) {
    if (data[offset] < 250) {
      hasTransparency = true
      break
    }
  }

  const corners = [0, (width - 1) * 4, (width * (height - 1)) * 4, (width * height - 1) * 4]
  const background = corners.reduce((channels, offset) => {
    channels[0] += data[offset]
    channels[1] += data[offset + 1]
    channels[2] += data[offset + 2]
    return channels
  }, [0, 0, 0]).map((channel) => channel / corners.length)

  for (let offset = 0, index = 0; offset < data.length; offset += 4, index += 1) {
    luminance[index] = relativeLuminance(data[offset], data[offset + 1], data[offset + 2])
    if (hasTransparency) {
      foreground[index] = data[offset + 3] >= 16 ? 1 : 0
    } else {
      const distance = Math.hypot(
        data[offset] - background[0],
        data[offset + 1] - background[1],
        data[offset + 2] - background[2],
      )
      foreground[index] = distance > 18 ? 1 : 0
    }
  }

  const radius = Math.min(96, Math.max(2, Math.round(Math.min(width, height) * 0.16)))
  const localLuminance = boxBlur(luminance, width, height, radius, foreground)
  const kept = new Uint8Array(width * height)
  const output = Buffer.alloc(data.length)

  for (let offset = 0, index = 0; offset < data.length; offset += 4, index += 1) {
    if (!foreground[index]) continue
    const lighterThanSurroundings = luminance[index] - localLuminance[index] > KNOCKOUT_DELTA
    if (lighterThanSurroundings) continue
    kept[index] = 1
    output[offset] = 255
    output[offset + 1] = 255
    output[offset + 2] = 255
    if (hasTransparency) {
      output[offset + 3] = data[offset + 3]
    } else {
      const distance = Math.hypot(
        data[offset] - background[0],
        data[offset + 1] - background[1],
        data[offset + 2] - background[2],
      )
      output[offset + 3] = Math.max(0, Math.min(255, Math.round((distance - 10) * 4)))
    }
  }

  const png = await sharp(output, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer()
  return { png, usable: isReadableLightLogo(foreground, kept, luminance, width, height) }
}
