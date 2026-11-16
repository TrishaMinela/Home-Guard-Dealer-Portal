import assert from 'node:assert/strict'
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
