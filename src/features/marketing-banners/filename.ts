export function slugifyBannerText(value: string): string {
  const slug = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'banner'
}

export function marketingBannerFilename(input: {
  slot: number
  headline: string
  dealerSlug: string
  extension: 'png' | 'jpg'
}): string {
  const slot = Math.min(8, Math.max(1, Math.round(input.slot)))
  return `hgi-banner-${slot}-${slugifyBannerText(input.headline)}-${slugifyBannerText(input.dealerSlug)}.${input.extension}`
}
