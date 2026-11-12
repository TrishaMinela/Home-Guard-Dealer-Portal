import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const root = path.resolve(import.meta.dirname, '../public/marketing-banner-fixtures')

const banners = [
  { slot: 1, shape: 'landscape', width: 851, height: 315, headline: 'Build a Door Made for Your Home' },
  { slot: 2, shape: 'landscape', width: 851, height: 315, headline: 'Your Home. Your Style. Your Door.' },
  { slot: 3, shape: 'landscape', width: 851, height: 315, headline: 'A New Look Starts at Your Door' },
  { slot: 4, shape: 'landscape', width: 851, height: 315, headline: 'See Your Vision Come to Life' },
  { slot: 5, shape: 'square', width: 1024, height: 1024, headline: 'Build a Door Made for Your Home' },
  { slot: 6, shape: 'square', width: 1024, height: 1024, headline: 'Your Home. Your Style. Your Door.' },
  { slot: 7, shape: 'square', width: 1024, height: 1024, headline: 'A New Look Starts at Your Door' },
  { slot: 8, shape: 'square', width: 1024, height: 1024, headline: 'See Your Vision Come to Life' },
]

function escapeXml(value) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character])
}

function bannerSvg(banner) {
  const titleSize = banner.shape === 'landscape' ? 28 : 54
  const headlineSize = banner.shape === 'landscape' ? 20 : 32
  const center = banner.width / 2
  const titleY = banner.shape === 'landscape' ? 118 : 430
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${banner.width}" height="${banner.height}" viewBox="0 0 ${banner.width} ${banner.height}">
  <rect width="100%" height="100%" fill="#e7eceb"/>
  <rect x="0" y="0" width="100%" height="18" fill="#0d666c"/>
  <rect x="18" y="36" width="${banner.width - 36}" height="${banner.height - 54}" fill="none" stroke="#9aa7ab" stroke-width="2" stroke-dasharray="10 8"/>
  <text x="${center}" y="${titleY}" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="${titleSize}" font-weight="700" fill="#5c6b70">DEMO TEMPLATE</text>
  <text x="${center}" y="${titleY + 36}" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="14" font-weight="700" fill="#0d666c">NOT FINAL ARTWORK</text>
  <text x="${center}" y="${titleY + 78}" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="${headlineSize}" font-weight="700" fill="#182124">${escapeXml(banner.headline)}</text>
  <text x="${center}" y="${banner.height - 42}" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="14" fill="#687276">Banner ${banner.slot} · ${banner.shape} · ${banner.width}×${banner.height} · unverified placeholder</text>
</svg>`
}

const samples = {
  wide: `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="160">
    <rect x="8" y="28" width="624" height="104" rx="16" fill="#0d666c"/>
    <text x="320" y="92" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="36" font-weight="700" fill="#ffffff">SAMPLE WIDE</text>
  </svg>`,
  tall: `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="560">
    <rect x="24" y="16" width="172" height="528" rx="20" fill="#094f54"/>
    <text x="110" y="250" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="28" font-weight="700" fill="#ffffff">SAMPLE</text>
    <text x="110" y="292" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="28" font-weight="700" fill="#ffffff">TALL</text>
  </svg>`,
  square: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">
    <circle cx="200" cy="200" r="148" fill="#0d666c"/>
    <text x="200" y="212" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="36" font-weight="700" fill="#ffffff">SAMPLE</text>
  </svg>`,
  transparent: `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="180">
    <rect x="40" y="30" width="400" height="120" rx="12" fill="#f8d30e" fill-opacity="0.45"/>
    <text x="240" y="100" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="28" font-weight="700" fill="#182124">SAMPLE CLEAR</text>
  </svg>`,
}

await mkdir(path.join(root, 'samples'), { recursive: true })
for (const banner of banners) {
  const filename = `banner-${String(banner.slot).padStart(2, '0')}-${banner.shape}.png`
  await sharp(Buffer.from(bannerSvg(banner))).png().toFile(path.join(root, filename))
}
for (const [name, svg] of Object.entries(samples)) {
  await sharp(Buffer.from(svg)).png().toFile(path.join(root, 'samples', `${name}.png`))
}
console.log(`Wrote demo banner fixtures to ${root}`)
