export type BackgroundRemoval =
  | { confident: false; reason: string }
  | { confident: true; reason: string; pixels: Uint8ClampedArray; width: number; height: number }

export const INK_CONTRAST_RATIO = 3
export const MIN_CONTRASTING_INK_SHARE = 0.3

export type LogoInkSample = {
  transparent: boolean
  contrasts: boolean
  contrastingShare: number
}

const MAX_PIXELS = 4_000_000

function borderStats(data: Uint8ClampedArray, width: number, height: number) {
  const border: number[] = []
  let transparentBorder = 0
  let borderCount = 0
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x > 1 && x < width - 2 && y > 1 && y < height - 2) continue
      borderCount += 1
      const offset = (y * width + x) * 4
      if (data[offset + 3] < 20) transparentBorder += 1
      else if (data[offset + 3] > 220) border.push(offset)
    }
  }
  return { border, borderCount, transparentBorder }
}

/** True when the outer edge is already transparent, matching the removal refusal. */
export function hasTransparentEdge(data: Uint8ClampedArray, width: number, height: number) {
  if (width < 2 || height < 2 || data.length < width * height * 4) return false
  const { borderCount, transparentBorder } = borderStats(data, width, height)
  return borderCount > 0 && transparentBorder / borderCount > 0.3
}

function channelLuminance(red: number, green: number, blue: number) {
  const linearize = (channel: number) => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linearize(red) + 0.7152 * linearize(green) + 0.0722 * linearize(blue)
}

function contrastRatio(first: number, second: number) {
  const lighter = Math.max(first, second)
  const darker = Math.min(first, second)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Contrast of opaque ink against a surface. A logo passes when at least 30% of
 * pixels with alpha >= 128 reach a 3:1 ratio. Edge transparency is required
 * before a file is treated as a transparent variant.
 */
export function sampleLogoInk(data: Uint8ClampedArray, width: number, height: number, background: string): LogoInkSample {
  const empty = { transparent: false, contrasts: false, contrastingShare: 0 }
  const match = /^#([0-9a-f]{6})$/i.exec(background.trim())
  if (!match || width < 2 || height < 2 || data.length < width * height * 4) return empty
  const hex = match[1]
  const backgroundLuminance = channelLuminance(
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  )
  let opaque = 0
  let contrasting = 0
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4
    if (data[offset + 3] < 128) continue
    opaque += 1
    const luminance = channelLuminance(data[offset], data[offset + 1], data[offset + 2])
    if (contrastRatio(luminance, backgroundLuminance) >= INK_CONTRAST_RATIO) contrasting += 1
  }
  const contrastingShare = opaque === 0 ? 0 : contrasting / opaque
  return {
    transparent: hasTransparentEdge(data, width, height),
    contrasts: opaque > 0 && contrastingShare >= MIN_CONTRASTING_INK_SHARE,
    contrastingShare,
  }
}

function distance(data: Uint8ClampedArray, offset: number, color: [number, number, number]) {
  return Math.max(
    Math.abs(data[offset] - color[0]),
    Math.abs(data[offset + 1] - color[1]),
    Math.abs(data[offset + 2] - color[2]),
  )
}

function medianChannel(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

/**
 * Removes a solid white, black, or other uniform background that touches the
 * image edge. Interior colors that are enclosed, including white lettering,
 * stay. A gradient, photo, or already-transparent logo is not changed.
 */
export function assessBackgroundRemoval(data: Uint8ClampedArray, width: number, height: number): BackgroundRemoval {
  if (width < 2 || height < 2 || width * height > MAX_PIXELS || data.length < width * height * 4) {
    return { confident: false, reason: 'This image is not a supported logo size.' }
  }

  const { border, borderCount, transparentBorder } = borderStats(data, width, height)
  if (borderCount === 0 || transparentBorder / borderCount > 0.3) {
    return { confident: false, reason: 'This logo already has a transparent background.' }
  }
  if (border.length < borderCount * 0.7) {
    return { confident: false, reason: 'The edge is not a solid background, so removal is not offered.' }
  }

  const background: [number, number, number] = [
    medianChannel(border.map((offset) => data[offset])),
    medianChannel(border.map((offset) => data[offset + 1])),
    medianChannel(border.map((offset) => data[offset + 2])),
  ]
  const nearWhite = background.every((channel) => channel >= 236)
  const nearBlack = background.every((channel) => channel <= 22)
  const tolerance = nearWhite || nearBlack ? 26 : 14
  const closeBorder = border.filter((offset) => distance(data, offset, background) <= tolerance)
  if (closeBorder.length / border.length < (nearWhite || nearBlack ? 0.9 : 0.96)) {
    return { confident: false, reason: 'The background is not one flat color, so removal is not offered.' }
  }

  const matches = (offset: number) => data[offset + 3] > 16 && distance(data, offset, background) <= tolerance
  const removed = new Uint8Array(width * height)
  const queue: number[] = []
  const seed = (x: number, y: number) => {
    const index = y * width + x
    if (removed[index] || !matches(index * 4)) return
    removed[index] = 1
    queue.push(index)
  }
  for (let x = 0; x < width; x += 1) {
    seed(x, 0)
    seed(x, height - 1)
  }
  for (let y = 0; y < height; y += 1) {
    seed(0, y)
    seed(width - 1, y)
  }
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor] ?? 0
    const x = index % width
    const y = Math.floor(index / width)
    if (x > 0) seed(x - 1, y)
    if (x + 1 < width) seed(x + 1, y)
    if (y > 0) seed(x, y - 1)
    if (y + 1 < height) seed(x, y + 1)
  }

  const pixels = new Uint8ClampedArray(data)
  let cleared = 0
  for (let index = 0; index < removed.length; index += 1) {
    if (!removed[index]) continue
    cleared += 1
    const offset = index * 4
    pixels[offset + 3] = 0
  }
  if (cleared < width * height * 0.05) {
    return { confident: false, reason: 'No solid outer background was found.' }
  }

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x
      if (removed[index]) continue
      const touchesRemoved = removed[index - 1] || removed[index + 1] || removed[index - width] || removed[index + width]
      if (!touchesRemoved) continue
      const offset = index * 4
      const gap = distance(pixels, offset, background)
      if (gap <= tolerance || gap > tolerance * 2.4) continue
      pixels[offset + 3] = Math.round(255 * (gap - tolerance) / tolerance)
    }
  }

  return {
    confident: true,
    reason: nearWhite ? 'Flat white background.' : nearBlack ? 'Flat black background.' : 'Flat background color.',
    pixels,
    width,
    height,
  }
}
