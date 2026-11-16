import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import sharp from 'sharp'
import { generateWhiteLogo } from '../api/_lib/dealerLightLogo.ts'
import { assessBackgroundRemoval } from '../src/utils/logoBackground.ts'

async function raw(input: Buffer) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data: new Uint8ClampedArray(data), width: info.width, height: info.height }
}

test('flat white background is removed and enclosed white lettering stays', async () => {
  const source = await sharp({
    create: { width: 40, height: 40, channels: 3, background: '#ffffff' },
  }).composite([{
    input: Buffer.from('<svg width="40" height="40"><rect x="8" y="8" width="24" height="24" fill="#c41230"/><rect x="16" y="16" width="8" height="8" fill="#ffffff"/></svg>'),
  }]).png().toBuffer()
  const image = await raw(source)
  const result = assessBackgroundRemoval(image.data, image.width, image.height)
  assert.equal(result.confident, true)
  if (!result.confident) return
  const at = (x: number, y: number) => result.pixels[((y * result.width) + x) * 4 + 3]
  assert.equal(at(1, 1), 0)
  assert.ok(at(10, 10) > 200)
  assert.ok(at(20, 20) > 200)
})

test('a flat black background is removed and enclosed white lettering stays', async () => {
  const source = await sharp({
    create: { width: 40, height: 40, channels: 3, background: '#000000' },
  }).composite([{
    input: Buffer.from('<svg width="40" height="40"><rect x="8" y="8" width="24" height="24" fill="#f4f1ea"/><rect x="16" y="18" width="8" height="3" fill="#ffffff"/></svg>'),
  }]).png().toBuffer()
  const image = await raw(source)
  const result = assessBackgroundRemoval(image.data, image.width, image.height)
  assert.equal(result.confident, true)
  if (!result.confident) return
  const at = (x: number, y: number) => result.pixels[((y * result.width) + x) * 4 + 3]
  assert.equal(at(1, 1), 0)
  assert.ok(at(12, 12) > 200)
  assert.ok(at(20, 19) > 200)
})

test('an interior line that does not touch the outer background is kept', async () => {
  const source = await sharp({
    create: { width: 36, height: 36, channels: 3, background: '#ffffff' },
  }).composite([{
    input: Buffer.from('<svg width="36" height="36"><rect x="6" y="6" width="24" height="24" fill="#1d4e89"/><rect x="10" y="17" width="16" height="2" fill="#ffffff"/></svg>'),
  }]).png().toBuffer()
  const image = await raw(source)
  const result = assessBackgroundRemoval(image.data, image.width, image.height)
  assert.equal(result.confident, true)
  if (!result.confident) return
  const at = (x: number, y: number) => result.pixels[((y * result.width) + x) * 4 + 3]
  assert.equal(at(0, 0), 0)
  assert.ok(at(18, 18) > 200)
  assert.ok(at(12, 12) > 200)
})

test('a gradient background is not offered for removal', async () => {
  const source = await sharp({
    create: { width: 24, height: 24, channels: 3, background: '#ffffff' },
  }).png().toBuffer()
  const image = await raw(source)
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4
      image.data[offset] = x * 10
      image.data[offset + 1] = y * 8
      image.data[offset + 2] = 40
    }
  }
  const result = assessBackgroundRemoval(image.data, image.width, image.height)
  assert.equal(result.confident, false)
  if (result.confident) return
  assert.match(result.reason, /not one flat color/)
})

test('an already transparent logo is left unchanged and the reason is shown', async () => {
  const source = await sharp({
    create: { width: 20, height: 20, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite([{
    input: Buffer.from('<svg width="20" height="20"><rect x="4" y="6" width="12" height="8" fill="#c41230"/></svg>'),
  }]).png().toBuffer()
  const image = await raw(source)
  const result = assessBackgroundRemoval(image.data, image.width, image.height)
  assert.equal(result.confident, false)
  if (result.confident) return
  assert.match(result.reason, /already has a transparent background/)
  const detail = await readFile(new URL('../src/pages/DealerDetailPage.tsx', import.meta.url), 'utf8')
  const profile = await readFile(new URL('../src/pages/DealerCompanyProfilePage.tsx', import.meta.url), 'utf8')
  for (const page of [detail, profile]) {
    assert.match(page, /setRemovalNotice\(inspected\.reason\)/)
    assert.match(page, /role="status">\{removalNotice\}/)
  }
})

test('black generation keeps transparency and paints kept ink black', async () => {
  const source = await sharp({
    create: { width: 16, height: 16, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite([{
    input: Buffer.from('<svg width="16" height="16"><rect x="4" y="4" width="8" height="8" fill="#14636a"/></svg>'),
  }]).png().toBuffer()
  const { png, usable } = await generateWhiteLogo(source, 'black')
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const center = ((8 * info.width) + 8) * 4
  assert.deepEqual(Array.from(data.subarray(center, center + 3)), [0, 0, 0])
  assert.ok(data[center + 3] > 200)
  assert.equal(data[3], 0)
  assert.equal(typeof usable, 'boolean')
})
