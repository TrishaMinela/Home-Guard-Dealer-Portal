import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import sharp from 'sharp'
import { generateWhiteLogo, validatePrimaryLogoUrl } from '../api/_lib/dealerLightLogo.ts'

test('generated light logo preserves transparent shape and replaces color with white', async () => {
  const source = await sharp({
    create: { width: 8, height: 8, channels: 4, background: { r: 14, g: 88, b: 92, alpha: 0 } },
  }).composite([{ input: Buffer.from('<svg width="8" height="8"><rect x="2" y="2" width="4" height="4" fill="#0e585c"/></svg>') }]).png().toBuffer()

  const output = await generateWhiteLogo(source)
  const { data, info } = await sharp(output).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const center = ((4 * info.width) + 4) * 4
  const corner = 0
  assert.deepEqual(Array.from(data.subarray(center, center + 3)), [255, 255, 255])
  assert.equal(data[center + 3], 255)
  assert.equal(data[corner + 3], 0)
})

test('SVG primary logos are rasterized into a clean white transparent PNG', async () => {
  const output = await generateWhiteLogo(Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="12"><path fill="#14636a" d="M2 2h20v8H2z"/></svg>',
  ))
  const metadata = await sharp(output).metadata()
  assert.equal(metadata.format, 'png')
  assert.equal(metadata.hasAlpha, true)
})

test('opaque primary logo receives a transparent background in its generated light version', async () => {
  const source = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#ffffff' } })
    .composite([{ input: Buffer.from('<svg width="10" height="10"><circle cx="5" cy="5" r="3" fill="#111111"/></svg>') }])
    .png()
    .toBuffer()
  const output = await generateWhiteLogo(source)
  const { data, info } = await sharp(output).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const center = ((5 * info.width) + 5) * 4
  assert.equal(data[3], 0)
  assert.ok(data[center + 3] > 240)
})

test('primary-logo URL validation prevents external fetches and cross-dealer access', () => {
  const projectUrl = 'https://example.supabase.co'
  assert.doesNotThrow(() => validatePrimaryLogoUrl(
    'https://example.supabase.co/storage/v1/object/public/dealer-logos/dealer-1/logo.png?v=1',
    'dealer-1',
    projectUrl,
  ))
  assert.throws(() => validatePrimaryLogoUrl('https://evil.example/logo.png', 'dealer-1', projectUrl))
  assert.throws(() => validatePrimaryLogoUrl(
    'https://example.supabase.co/storage/v1/object/public/dealer-logos/dealer-2/logo.png',
    'dealer-1',
    projectUrl,
  ))
})

test('Portal light-logo UI preserves custom override and generated fallback controls', async () => {
  const profile = await readFile(new URL('../src/pages/DealerCompanyProfilePage.tsx', import.meta.url), 'utf8')
  const detail = await readFile(new URL('../src/pages/DealerDetailPage.tsx', import.meta.url), 'utf8')
  for (const source of [profile, detail]) {
    assert.match(source, /logo_light_url \?\? dealer\.logo_generated_light_url/)
    assert.match(source, /Regenerate Default/)
    assert.match(source, /Remove Custom Logo/)
  }
})
