import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import sharp from 'sharp'
import { generateWhiteLogo, validatePrimaryLogoUrl } from '../api/_lib/dealerLightLogo.ts'

test('generated light logo preserves transparent shape and replaces color with white', async () => {
  const source = await sharp({
    create: { width: 8, height: 8, channels: 4, background: { r: 14, g: 88, b: 92, alpha: 0 } },
  }).composite([{ input: Buffer.from('<svg width="8" height="8"><rect x="2" y="2" width="4" height="4" fill="#0e585c"/></svg>') }]).png().toBuffer()

  const { png: output } = await generateWhiteLogo(source)
  const { data, info } = await sharp(output).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const center = ((4 * info.width) + 4) * 4
  const corner = 0
  assert.deepEqual(Array.from(data.subarray(center, center + 3)), [255, 255, 255])
  assert.equal(data[center + 3], 255)
  assert.equal(data[corner + 3], 0)
})

test('SVG primary logos are rasterized into a clean white transparent PNG', async () => {
  const { png: output } = await generateWhiteLogo(Buffer.from(
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
  const { png: output } = await generateWhiteLogo(source)
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
  assert.doesNotThrow(() => validatePrimaryLogoUrl(
    'https://udbcnpjtwhmjzpjjhoph.supabase.co/storage/v1/object/public/dealer-logos/26d3286e-954c-4e4b-b8ef-9372825c3d79/logo.webp?v=1793396742763',
    '26d3286e-954c-4e4b-b8ef-9372825c3d79',
    'https://udbcnpjtwhmjzpjjhoph.supabase.co',
  ))
  assert.doesNotThrow(() => validatePrimaryLogoUrl(
    'https://example.supabase.co/storage/v1/object/public/dealer-logos/dealer-1/logo-source.png?v=1794860040546',
    'dealer-1',
    projectUrl,
  ))
  assert.throws(() => validatePrimaryLogoUrl(
    'https://example.supabase.co/storage/v1/object/public/dealer-logos/dealer-1/logo-light.png',
    'dealer-1',
    projectUrl,
  ))
  assert.throws(() => validatePrimaryLogoUrl(
    'https://example.supabase.co/storage/v1/object/public/dealer-logos/dealer-1/logo-generated-light.png?v=1',
    'dealer-1',
    projectUrl,
  ))
  assert.throws(() => validatePrimaryLogoUrl(
    'https://example.supabase.co/storage/v1/object/public/dealer-logos/dealer-1/logo.png?v=1&next=https://evil.example',
    'dealer-1',
    projectUrl,
  ))
})

test('Portal light-logo UI preserves custom override and generated fallback controls', async () => {
  const profile = await readFile(new URL('../src/pages/DealerCompanyProfilePage.tsx', import.meta.url), 'utf8')
  const detail = await readFile(new URL('../src/pages/DealerDetailPage.tsx', import.meta.url), 'utf8')
  for (const source of [profile, detail]) {
    assert.match(source, /logo_light_url \?\? dealer\.logo_generated_light_url/)
    assert.match(source, /Generate White/)
    assert.match(source, /Remove Custom Logo/)
  }
})

test('light logo keeps interior lettering, transparency, and source dimensions', async () => {
  const source = await sharp({
    create: { width: 64, height: 64, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite([{
    input: Buffer.from('<svg width="64" height="64"><rect x="8" y="8" width="48" height="48" fill="#c41230"/><rect x="24" y="24" width="16" height="16" fill="#ffffff"/></svg>'),
  }]).png().toBuffer()
  const sourceMeta = await sharp(source).metadata()
  const { png, usable } = await generateWhiteLogo(source)
  const meta = await sharp(png).metadata()
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const at = (x: number, y: number) => {
    const offset = ((y * info.width) + x) * 4
    return Array.from(data.subarray(offset, offset + 4))
  }
  assert.equal(meta.format, 'png')
  assert.equal(meta.width, sourceMeta.width)
  assert.equal(meta.height, sourceMeta.height)
  assert.equal(meta.hasAlpha, true)
  assert.equal(at(0, 0)[3], 0)
  assert.deepEqual(at(12, 12).slice(0, 3), [255, 255, 255])
  assert.ok(at(12, 12)[3] > 240)
  assert.equal(at(32, 32)[3], 0)
  assert.equal(usable, true)
})

test('a near-solid silhouette is marked unusable', async () => {
  const source = await sharp({
    create: { width: 96, height: 64, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite([{
    input: Buffer.from('<svg width="96" height="64"><rect x="8" y="8" width="80" height="48" fill="#b42318"/></svg>'),
  }]).png().toBuffer()
  const { png, usable } = await generateWhiteLogo(source)
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const center = ((32 * info.width) + 48) * 4
  assert.equal(usable, false)
  assert.deepEqual(Array.from(data.subarray(center, center + 3)), [255, 255, 255])
  assert.ok(data[center + 3] > 240)
  assert.equal(data[3], 0)
})

test('light-logo generation stores the readability flag and does not replace the original logo', async () => {
  const api = await readFile(new URL('../api/dealer-light-logo.ts', import.meta.url), 'utf8')
  assert.match(api, /logo-generated-light\.png/)
  assert.match(api, /logo_generated_light_usable: generated\.usable/)
  assert.doesNotMatch(api, /logo_url:/)
  assert.doesNotMatch(api, /update\(\{[^}]*\blogo_url\b/)
  assert.match(api, /from\('home_guard_admins'\)/)
  assert.match(api, /\.eq\('dealer_id', body\.dealerId\)\.eq\('role', 'dealer_admin'\)/)
  assert.match(api, /if \(!homeGuard\.data && !membership\.data\) return send\(response, 403/)
})
