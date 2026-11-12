import { bannerCompositePlan, imageNeedsCors, type BannerCompositePlan, type BannerPlacement } from './placement.ts'

export type RenderedBanner = BannerCompositePlan & {
  canvas: HTMLCanvasElement
}

export function loadDrawableImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    if (imageNeedsCors(url, window.location.origin)) image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('The banner image could not be loaded.'))
    image.src = url
  })
}

export async function renderMarketingBanner(input: {
  canvas: HTMLCanvasElement
  templateUrl: string
  logoUrl: string | null
  placement: BannerPlacement
  format: 'png' | 'jpeg'
}): Promise<BannerCompositePlan> {
  const template = await loadDrawableImage(input.templateUrl)
  const logo = input.logoUrl ? await loadDrawableImage(input.logoUrl) : null
  const plan = bannerCompositePlan({
    placement: input.placement,
    imageWidth: template.naturalWidth,
    imageHeight: template.naturalHeight,
    logoWidth: logo?.naturalWidth ?? 0,
    logoHeight: logo?.naturalHeight ?? 0,
    scale: 1,
  })
  const canvas = input.canvas
  canvas.width = template.naturalWidth
  canvas.height = template.naturalHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas rendering is unavailable.')
  context.clearRect(0, 0, canvas.width, canvas.height)
  if (input.format === 'jpeg') {
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
  }
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(template, 0, 0, canvas.width, canvas.height)
  if (logo && plan.logo.width > 0 && plan.logo.height > 0) {
    context.drawImage(logo, plan.logo.x, plan.logo.y, plan.logo.width, plan.logo.height)
  }
  return plan
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('The banner file could not be created.'))
    }, type, quality)
  })
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export async function exportMarketingBanner(input: {
  templateUrl: string
  logoUrl: string
  placement: BannerPlacement
  filename: string
  format: 'png' | 'jpeg'
}): Promise<BannerCompositePlan> {
  const canvas = document.createElement('canvas')
  const plan = await renderMarketingBanner({ ...input, canvas })
  const blob = await canvasBlob(
    canvas,
    input.format === 'jpeg' ? 'image/jpeg' : 'image/png',
    input.format === 'jpeg' ? 0.92 : undefined,
  )
  downloadBlob(blob, input.filename)
  return plan
}
