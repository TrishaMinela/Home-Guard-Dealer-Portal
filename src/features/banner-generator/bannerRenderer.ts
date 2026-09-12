import type { DealerAccount } from '../../types/account'
import type { BannerSize, BannerTemplate } from './bannerTemplates'

type RenderBannerOptions = {
  canvas: HTMLCanvasElement
  dealer: DealerAccount
  size: BannerSize
  template: BannerTemplate
  visualizerUrl: string
}

function safeColor(value: string | null, fallback: string) {
  return value && /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(value.trim()) ? value.trim() : fallback
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = url
  })
}

function fitText(context: CanvasRenderingContext2D, text: string, maxWidth: number, startingSize: number, weight = 700) {
  let size = startingSize
  do {
    context.font = `${weight} ${size}px Montserrat, Arial, sans-serif`
    if (context.measureText(text).width <= maxWidth) return size
    size -= 1
  } while (size > 10)
  return size
}

function fitWrappedText(context: CanvasRenderingContext2D, text: string, maxWidth: number, maxHeight: number, startingSize: number, maxLines = 3) {
  for (let size = startingSize; size >= 8; size -= 1) {
    context.font = `700 ${size}px Montserrat, Arial, sans-serif`
    const words = text.trim().split(/\s+/)
    const lines: string[] = []
    for (const word of words) {
      const candidate = lines.length ? `${lines[lines.length - 1]} ${word}` : word
      if (context.measureText(candidate).width <= maxWidth) {
        if (lines.length) lines[lines.length - 1] = candidate
        else lines.push(candidate)
      } else {
        lines.push(word)
      }
    }
    const lineHeight = size * 1.15
    const fitsWidth = lines.every((line) => context.measureText(line).width <= maxWidth)
    if (lines.length <= maxLines && lines.length * lineHeight <= maxHeight && fitsWidth) {
      return { size, lineHeight, lines }
    }
  }
  return { size: 8, lineHeight: 9.2, lines: [text] }
}

function drawDealerName(context: CanvasRenderingContext2D, name: string, x: number, y: number, width: number, height: number, color: string, startingSize: number) {
  const fitted = fitWrappedText(context, name, width, height, startingSize)
  context.fillStyle = color
  context.font = `700 ${fitted.size}px Montserrat, Arial, sans-serif`
  fitted.lines.forEach((line, index) => {
    context.fillText(line, x, y + fitted.size + index * fitted.lineHeight)
  })
}

function drawContainedImage(context: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight)
  const drawWidth = image.naturalWidth * scale
  const drawHeight = image.naturalHeight * scale
  context.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight)
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath()
  context.roundRect(x, y, width, height, radius)
  context.fill()
}

async function render1200x300Banner(
  context: CanvasRenderingContext2D,
  dealer: DealerAccount,
  template: BannerTemplate,
  visualizerUrl: string,
  primary: string,
  secondary: string,
) {
  const urlText = visualizerUrl.replace('https://', '')
  const poweredText = 'Powered by Home Guard Industries'
  const isLight = template.id === 'signature-light'
  const isBold = template.id === 'bold-brand'
  const foreground = isLight ? '#101718' : '#ffffff'
  const logoUrl = isLight ? dealer.logo_url : dealer.logo_light_url || dealer.logo_url
  const logo = logoUrl ? await loadImage(logoUrl) : null

  if (isLight) {
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, 1200, 300)
    context.fillStyle = primary
    context.fillRect(0, 0, 18, 300)
    context.fillStyle = secondary
    context.fillRect(0, 288, 1200, 12)

    if (logo) drawContainedImage(context, logo, 48, 42, 230, 64)
    else drawDealerName(context, dealer.company_name, 48, 38, 230, 70, foreground, 22)

    context.fillStyle = foreground
    const headlineSize = fitText(context, template.headline, 500, 46)
    context.font = `700 ${headlineSize}px Montserrat, Arial, sans-serif`
    context.fillText(template.headline, 330, 112)
    const subheadSize = fitText(context, template.subhead, 500, 22, 500)
    context.font = `500 ${subheadSize}px Montserrat, Arial, sans-serif`
    context.fillText(template.subhead, 330, 153)

    context.fillStyle = primary
    roundedRect(context, 925, 91, 220, 66, 11)
    context.fillStyle = '#ffffff'
    context.textAlign = 'center'
    context.font = '700 18px Montserrat, Arial, sans-serif'
    context.fillText('Start Designing', 1035, 132)
    context.textAlign = 'left'

    context.fillStyle = foreground
    context.globalAlpha = 0.72
    context.font = '600 13px Montserrat, Arial, sans-serif'
    context.fillText(urlText, 48, 266)
    context.textAlign = 'right'
    context.fillText(poweredText, 1145, 266)
  } else if (isBold) {
    const gradient = context.createLinearGradient(0, 0, 1200, 300)
    gradient.addColorStop(0, primary)
    gradient.addColorStop(1, '#071f22')
    context.fillStyle = gradient
    context.fillRect(0, 0, 1200, 300)
    context.fillStyle = secondary
    context.beginPath()
    context.arc(1110, 24, 250, 0, Math.PI * 2)
    context.fill()

    if (logo) drawContainedImage(context, logo, 52, 30, 245, 66)
    else drawDealerName(context, dealer.company_name, 52, 27, 245, 72, foreground, 22)

    context.fillStyle = foreground
    const headlineSize = fitText(context, template.headline, 670, 43)
    context.font = `700 ${headlineSize}px Montserrat, Arial, sans-serif`
    context.fillText(template.headline, 52, 157)
    const subheadSize = fitText(context, template.subhead, 650, 21, 500)
    context.font = `500 ${subheadSize}px Montserrat, Arial, sans-serif`
    context.fillText(template.subhead, 52, 198)

    context.fillStyle = secondary
    roundedRect(context, 790, 112, 245, 66, 11)
    context.fillStyle = '#101718'
    context.textAlign = 'center'
    context.font = '700 18px Montserrat, Arial, sans-serif'
    context.fillText('Start Designing', 912.5, 153)
    context.textAlign = 'left'

    context.fillStyle = foreground
    context.globalAlpha = 0.76
    context.font = '600 13px Montserrat, Arial, sans-serif'
    context.fillText(urlText, 52, 270)
    context.textAlign = 'right'
    context.fillText(poweredText, 1142, 270)
  } else {
    context.fillStyle = primary
    context.fillRect(0, 0, 770, 300)
    context.fillStyle = secondary
    context.fillRect(770, 0, 430, 300)

    if (logo) drawContainedImage(context, logo, 50, 32, 235, 64)
    else drawDealerName(context, dealer.company_name, 50, 29, 235, 70, foreground, 22)

    context.fillStyle = foreground
    const headlineSize = fitText(context, template.headline, 650, 47)
    context.font = `700 ${headlineSize}px Montserrat, Arial, sans-serif`
    context.fillText(template.headline, 50, 158)
    const subheadSize = fitText(context, template.subhead, 630, 21, 500)
    context.font = `500 ${subheadSize}px Montserrat, Arial, sans-serif`
    context.fillText(template.subhead, 50, 199)

    context.fillStyle = '#101718'
    roundedRect(context, 842, 99, 286, 70, 12)
    context.fillStyle = '#ffffff'
    context.textAlign = 'center'
    context.font = '700 19px Montserrat, Arial, sans-serif'
    context.fillText('Start Designing', 985, 142)
    context.font = '600 12px Montserrat, Arial, sans-serif'
    context.fillStyle = '#101718'
    context.fillText(poweredText, 985, 264)
    context.textAlign = 'left'

    context.fillStyle = foreground
    context.globalAlpha = 0.78
    context.font = '600 13px Montserrat, Arial, sans-serif'
    context.fillText(urlText, 50, 270)
  }

  context.textAlign = 'left'
  context.globalAlpha = 1
}

export async function renderBanner({ canvas, dealer, size, template, visualizerUrl }: RenderBannerOptions) {
  canvas.width = size.width
  canvas.height = size.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas rendering is unavailable.')

  const primary = safeColor(dealer.primary_color, '#0d666c')
  const secondary = safeColor(dealer.secondary_color, '#f8d30e')
  const compact = size.height <= 100
  const square = size.height >= size.width * 0.75
  const padding = compact
    ? size.height * 0.14
    : square
      ? Math.max(24, size.width * 0.055)
      : Math.max(24, Math.min(36, size.width * 0.04))
  const dark = template.theme === 'dark'

  context.clearRect(0, 0, size.width, size.height)

  if (size.id === '1200x300') {
    await render1200x300Banner(context, dealer, template, visualizerUrl, primary, secondary)
    return
  }

  context.fillStyle = dark ? primary : '#ffffff'
  context.fillRect(0, 0, size.width, size.height)

  if (template.theme === 'light') {
    context.fillStyle = primary
    context.fillRect(0, 0, Math.max(8, size.width * 0.018), size.height)
    context.fillStyle = secondary
    context.fillRect(0, size.height - Math.max(6, size.height * 0.04), size.width, Math.max(6, size.height * 0.04))
  } else if (template.theme === 'dark') {
    const gradient = context.createLinearGradient(0, 0, size.width, size.height)
    gradient.addColorStop(0, primary)
    gradient.addColorStop(1, '#071f22')
    context.fillStyle = gradient
    context.fillRect(0, 0, size.width, size.height)
    context.fillStyle = secondary
    context.beginPath()
    context.arc(size.width * 0.9, size.height * 0.08, Math.max(size.width, size.height) * 0.22, 0, Math.PI * 2)
    context.fill()
  } else {
    context.fillStyle = primary
    context.fillRect(0, 0, square ? size.width : size.width * 0.64, size.height)
    context.fillStyle = secondary
    context.fillRect(square ? 0 : size.width * 0.64, square ? size.height * 0.72 : 0, square ? size.width : size.width * 0.36, square ? size.height * 0.28 : size.height)
  }

  const foreground = template.theme === 'light' ? '#101718' : '#ffffff'
  const logoUrl = template.theme === 'light' ? dealer.logo_url : dealer.logo_light_url || dealer.logo_url
  const logo = logoUrl ? await loadImage(logoUrl) : null
  const logoWidth = compact ? size.width * 0.17 : square ? size.width * 0.34 : size.width * 0.2
  const logoHeight = compact ? size.height * 0.58 : square ? size.height * 0.12 : size.height * 0.2

  if (logo) {
    const inset = Math.max(2, Math.min(logoWidth, logoHeight) * 0.06)
    drawContainedImage(context, logo, padding + inset, padding + inset, logoWidth - inset * 2, logoHeight - inset * 2)
  } else {
    drawDealerName(context, dealer.company_name, padding, padding, logoWidth, logoHeight, foreground, compact ? 15 : Math.max(16, size.width * 0.022))
  }

  if (compact) {
    const zoneGap = Math.max(10, size.width * 0.018)
    const textX = padding + logoWidth + zoneGap
    const buttonWidth = size.width * 0.19
    const buttonX = size.width - padding - buttonWidth
    const headlineWidth = buttonX - zoneGap - textX
    context.fillStyle = foreground
    const headlineSize = fitText(context, template.headline, headlineWidth, 24)
    context.font = `700 ${headlineSize}px Montserrat, Arial, sans-serif`
    context.fillText(template.headline, textX, size.height * 0.46)
    const subheadSize = fitText(context, template.subhead, headlineWidth, Math.max(9, size.height * 0.11), 500)
    context.font = `500 ${subheadSize}px Montserrat, Arial, sans-serif`
    context.fillText(template.subhead, textX, size.height * 0.69)
    context.fillStyle = template.theme === 'light' ? primary : secondary
    roundedRect(context, buttonX, size.height * 0.26, buttonWidth, size.height * 0.48, size.height * 0.12)
    context.fillStyle = template.theme === 'light' ? '#ffffff' : '#101718'
    context.textAlign = 'center'
    context.font = `700 ${Math.max(9, size.height * 0.12)}px Montserrat, Arial, sans-serif`
    context.fillText('Start Designing', buttonX + buttonWidth / 2, size.height * 0.56)
    context.textAlign = 'left'
    return
  }

  const textWidth = square ? size.width - padding * 2 : size.width * 0.58
  context.fillStyle = foreground
  const headlineSize = fitText(context, template.headline, textWidth, square ? size.width * 0.085 : size.height * 0.19)
  const logoGap = square ? Math.max(10, size.height * 0.022) : 10
  const headlineBaseline = padding + logoHeight + logoGap + headlineSize
  context.font = `700 ${headlineSize}px Montserrat, Arial, sans-serif`
  context.fillText(template.headline, padding, headlineBaseline)
  const subheadSize = fitText(context, template.subhead, textWidth, square ? size.width * 0.033 : size.height * 0.065, 500)
  const subheadBaseline = headlineBaseline + subheadSize * 1.6
  context.font = `500 ${subheadSize}px Montserrat, Arial, sans-serif`
  context.fillText(template.subhead, padding, subheadBaseline)

  const buttonWidth = square ? size.width * 0.42 : size.width * 0.24
  const buttonHeight = square ? size.height * 0.085 : size.height * 0.16
  const buttonY = subheadBaseline + Math.max(10, buttonHeight * 0.25)
  context.fillStyle = template.theme === 'light' ? primary : secondary
  roundedRect(context, padding, buttonY, buttonWidth, buttonHeight, buttonHeight * 0.18)
  context.fillStyle = template.theme === 'light' ? '#ffffff' : '#101718'
  context.textAlign = 'center'
  context.font = `700 ${buttonHeight * 0.28}px Montserrat, Arial, sans-serif`
  context.fillText('Start Designing', padding + buttonWidth / 2, buttonY + buttonHeight * 0.61)
  context.textAlign = 'left'

  context.fillStyle = foreground
  context.globalAlpha = 0.78
  const urlText = visualizerUrl.replace('https://', '')
  const poweredText = 'Powered by Home Guard Industries'
  if (square) {
    const footerWidth = size.width - padding * 2
    const footerSize = fitText(context, poweredText, footerWidth, size.width * 0.021, 600)
    const urlSize = fitText(context, urlText, footerWidth, size.width * 0.023, 600)
    context.font = `600 ${urlSize}px Montserrat, Arial, sans-serif`
    context.fillText(urlText, padding, size.height - padding * 1.05)
    context.font = `600 ${footerSize}px Montserrat, Arial, sans-serif`
    context.fillText(poweredText, padding, size.height - padding * 0.48)
  } else {
    const footerZoneWidth = (size.width - padding * 2) * 0.47
    const footerSize = fitText(context, poweredText, footerZoneWidth, size.height * 0.042, 600)
    const urlSize = fitText(context, urlText, footerZoneWidth, size.height * 0.042, 600)
    context.font = `600 ${urlSize}px Montserrat, Arial, sans-serif`
    context.fillText(urlText, padding, size.height - padding * 0.55)
    context.textAlign = 'right'
    context.font = `600 ${footerSize}px Montserrat, Arial, sans-serif`
    context.fillText(poweredText, size.width - padding, size.height - padding * 0.55)
  }
  context.textAlign = 'left'
  context.globalAlpha = 1
}
