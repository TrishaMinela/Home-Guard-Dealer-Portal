export type BannerPlacement = {
  /** Percent of the template width, from the left edge. */
  x: number
  /** Percent of the template height, from the top edge. */
  y: number
  /** Percent of the template width. */
  width: number
  /** Percent of the template height. */
  height: number
  /**
   * Inset inside the rectangle, as a percent of the template's shorter side.
   * The logo is centered and aspect-fit inside the inset area.
   */
  padding: number
  /** Optional cap as a percent of the template width. Null means no extra cap. */
  maxLogoWidth: number | null
  /** Optional cap as a percent of the template height. Null means no extra cap. */
  maxLogoHeight: number | null
}

export type PixelRect = {
  x: number
  y: number
  width: number
  height: number
}

export type DragMode = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const MIN_DRAG_PERCENT = 4

export function placementKey(placement: BannerPlacement): string {
  return [
    placement.x,
    placement.y,
    placement.width,
    placement.height,
    placement.padding,
    placement.maxLogoWidth ?? '',
    placement.maxLogoHeight ?? '',
  ].join(':')
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function editPlacement(current: BannerPlacement, patch: Partial<BannerPlacement>): BannerPlacement {
  const merged = { ...current, ...patch }
  const width = clamp(merged.width, MIN_DRAG_PERCENT, 100)
  const height = clamp(merged.height, MIN_DRAG_PERCENT, 100)
  const padding = clamp(merged.padding, 0, 40)
  const maxLogoWidth = merged.maxLogoWidth == null ? null : clamp(merged.maxLogoWidth, 0.5, 100)
  const maxLogoHeight = merged.maxLogoHeight == null ? null : clamp(merged.maxLogoHeight, 0.5, 100)
  return roundPlacement({
    x: clamp(merged.x, 0, 100 - width),
    y: clamp(merged.y, 0, 100 - height),
    width,
    height,
    padding,
    maxLogoWidth,
    maxLogoHeight,
  })
}

export function roundPlacement(placement: BannerPlacement): BannerPlacement {
  const round = (value: number) => Math.round(value * 100) / 100
  return {
    ...placement,
    x: round(placement.x),
    y: round(placement.y),
    width: round(placement.width),
    height: round(placement.height),
    padding: round(placement.padding),
    maxLogoWidth: placement.maxLogoWidth == null ? null : round(placement.maxLogoWidth),
    maxLogoHeight: placement.maxLogoHeight == null ? null : round(placement.maxLogoHeight),
  }
}

function finiteInRange(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) return null
  return value
}

function optionalCap(value: unknown): number | null | 'invalid' {
  if (value == null) return null
  const cap = finiteInRange(value, 0.5, 100)
  return cap == null ? 'invalid' : cap
}

export function normalizePlacement(value: unknown): BannerPlacement | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const x = finiteInRange(record.x, 0, 100)
  const y = finiteInRange(record.y, 0, 100)
  const width = finiteInRange(record.width, 0.5, 100)
  const height = finiteInRange(record.height, 0.5, 100)
  const padding = finiteInRange(record.padding, 0, 40)
  if (x == null || y == null || width == null || height == null || padding == null) return null
  if (x + width > 100.001 || y + height > 100.001) return null
  const maxLogoWidth = optionalCap(record.maxLogoWidth)
  const maxLogoHeight = optionalCap(record.maxLogoHeight)
  if (maxLogoWidth === 'invalid' || maxLogoHeight === 'invalid') return null
  return { x, y, width, height, padding, maxLogoWidth, maxLogoHeight }
}

export function placementRectPixels(
  placement: BannerPlacement,
  imageWidth: number,
  imageHeight: number,
  scale = 1,
): PixelRect {
  return {
    x: (placement.x / 100) * imageWidth * scale,
    y: (placement.y / 100) * imageHeight * scale,
    width: (placement.width / 100) * imageWidth * scale,
    height: (placement.height / 100) * imageHeight * scale,
  }
}

export function placementPaddingPixels(
  placement: BannerPlacement,
  imageWidth: number,
  imageHeight: number,
  scale = 1,
): number {
  return (placement.padding / 100) * Math.min(imageWidth, imageHeight) * scale
}

export function containLogoRect(input: {
  placement: BannerPlacement
  imageWidth: number
  imageHeight: number
  logoWidth: number
  logoHeight: number
  scale?: number
}): PixelRect {
  const scale = input.scale ?? 1
  const box = placementRectPixels(input.placement, input.imageWidth, input.imageHeight, scale)
  const padding = placementPaddingPixels(input.placement, input.imageWidth, input.imageHeight, scale)
  const innerWidth = Math.max(0, box.width - padding * 2)
  const innerHeight = Math.max(0, box.height - padding * 2)
  let maxWidth = innerWidth
  let maxHeight = innerHeight
  if (input.placement.maxLogoWidth != null) {
    maxWidth = Math.min(maxWidth, (input.placement.maxLogoWidth / 100) * input.imageWidth * scale)
  }
  if (input.placement.maxLogoHeight != null) {
    maxHeight = Math.min(maxHeight, (input.placement.maxLogoHeight / 100) * input.imageHeight * scale)
  }
  const innerX = box.x + padding
  const innerY = box.y + padding
  if (input.logoWidth <= 0 || input.logoHeight <= 0 || maxWidth <= 0 || maxHeight <= 0) {
    return { x: innerX, y: innerY, width: 0, height: 0 }
  }
  // Cap at the preview scale so a logo is never drawn larger than its native pixels.
  const fit = Math.min(maxWidth / input.logoWidth, maxHeight / input.logoHeight, scale)
  const width = input.logoWidth * fit
  const height = input.logoHeight * fit
  return {
    x: innerX + (innerWidth - width) / 2,
    y: innerY + (innerHeight - height) / 2,
    width,
    height,
  }
}

export type BannerCompositePlan = {
  canvasWidth: number
  canvasHeight: number
  logo: PixelRect
}

export function bannerCompositePlan(input: {
  placement: BannerPlacement
  imageWidth: number
  imageHeight: number
  logoWidth: number
  logoHeight: number
  scale?: number
}): BannerCompositePlan {
  const scale = input.scale ?? 1
  return {
    canvasWidth: input.imageWidth * scale,
    canvasHeight: input.imageHeight * scale,
    logo: containLogoRect(input),
  }
}

function dragEdges(mode: DragMode) {
  return {
    n: mode === 'n' || mode === 'ne' || mode === 'nw',
    s: mode === 's' || mode === 'se' || mode === 'sw',
    e: mode === 'e' || mode === 'ne' || mode === 'se',
    w: mode === 'w' || mode === 'nw' || mode === 'sw',
  }
}

export function placementAfterDrag(
  origin: BannerPlacement,
  mode: DragMode,
  dxPercent: number,
  dyPercent: number,
): BannerPlacement {
  let { x, y, width, height } = origin
  if (mode === 'move') {
    x = clamp(x + dxPercent, 0, 100 - width)
    y = clamp(y + dyPercent, 0, 100 - height)
  } else {
    const edges = dragEdges(mode)
    if (edges.w) {
      const nextX = clamp(x + dxPercent, 0, x + width - MIN_DRAG_PERCENT)
      width = width + (x - nextX)
      x = nextX
    }
    if (edges.e) width = clamp(width + dxPercent, MIN_DRAG_PERCENT, 100 - x)
    if (edges.n) {
      const nextY = clamp(y + dyPercent, 0, y + height - MIN_DRAG_PERCENT)
      height = height + (y - nextY)
      y = nextY
    }
    if (edges.s) height = clamp(height + dyPercent, MIN_DRAG_PERCENT, 100 - y)
  }
  return roundPlacement({ ...origin, x, y, width, height })
}

export function nudgeStep(modifiers: { altKey: boolean; shiftKey: boolean }) {
  if (modifiers.altKey) return 0.1
  if (modifiers.shiftKey) return 2
  return 0.5
}

export function imageNeedsCors(url: string, pageOrigin: string): boolean {
  if (url.startsWith('blob:') || url.startsWith('data:')) return false
  try {
    return new URL(url, pageOrigin).origin !== pageOrigin
  } catch {
    return true
  }
}
