import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import test from 'node:test'
import playwright from 'playwright-core'
import { hexToHsv } from '../src/utils/doorBuilderAppearance.ts'

const port = 5198
let server: ChildProcess | undefined
let browser: playwright.Browser | undefined

async function startServer() {
  server = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    env: { ...process.env, VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'public-test-key' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })
  let log = ''
  server.stdout?.on('data', (chunk) => { log += chunk })
  server.stderr?.on('data', (chunk) => { log += chunk })
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`)
      if (response.ok) return
    } catch { /* server still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(log || 'Portal dev server did not start')
}

test.before(async () => {
  await startServer()
  browser = await playwright.chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] })
})

test.after(async () => {
  await browser?.close()
  if (server?.pid) {
    try { process.kill(-server.pid, 'SIGTERM') } catch { server.kill('SIGTERM') }
  }
})

async function openPicker(page: playwright.Page) {
  await page.goto(`http://127.0.0.1:${port}/#appearance-harness`, { waitUntil: 'networkidle' })
  await page.locator('#appearance-headerBackground').click()
  await page.locator('.appearance-popover[data-placed="true"]').waitFor()
  const hex = page.locator('#appearance-headerBackground-hex')
  await hex.fill('#ff0000')
  await hex.blur()
  return page.locator('.react-colorful__saturation .react-colorful__interactive')
}

async function readHsv(page: playwright.Page) {
  const hex = (await page.locator('#appearance-headerBackground-hex').inputValue()).trim().toLowerCase()
  const preview = await page.locator('.appearance-popover__preview').evaluate((element) => getComputedStyle(element).backgroundColor)
  const match = preview.match(/rgba?\((\d+), (\d+), (\d+)/)
  const fromPreview = match
    ? `#${[match[1], match[2], match[3]].map((part) => Number(part).toString(16).padStart(2, '0')).join('')}`
    : hex
  return { hex, preview: fromPreview, ...hexToHsv(fromPreview) }
}

test('saturation square brightness reaches black only at the bottom edge', async () => {
  const page = await browser!.newPage({ viewport: { width: 1280, height: 1000 }, hasTouch: true })
  const square = await openPicker(page)
  const border = await page.locator('.react-colorful__saturation').evaluate((element) => getComputedStyle(element).borderBottomWidth)
  assert.equal(border, '0px')
  const box = await square.boundingBox()
  assert.ok(box && box.height > 80)

  const sample = async (name: string, x: number, y: number) => {
    await page.mouse.click(x, y)
    await page.waitForTimeout(50)
    const hsv = await readHsv(page)
    const expected = { s: (x - box.x) / box.width, v: 1 - (y - box.y) / box.height }
    assert.ok(Math.abs(hsv.s - expected.s) < 0.06 && Math.abs(hsv.v - expected.v) < 0.06, `${name} ${JSON.stringify({ hsv, expected })}`)
    return hsv
  }
  const topRight = await sample('top-right', box.x + box.width - 12, box.y + 8)
  const topLeft = await sample('top-left', box.x + 8, box.y + 8)
  const center = await sample('center', box.x + box.width / 2, box.y + box.height / 2)
  const nearBottom = await sample('near-bottom', box.x + box.width / 2, box.y + box.height - 10)
  await page.mouse.click(box.x + 24, box.y + box.height - 1)
  await page.waitForTimeout(50)
  const bottomEdge = await readHsv(page)
  assert.ok(topLeft.v > 0.9 && topLeft.s < 0.15)
  assert.ok(topRight.v > 0.9 && topRight.s > 0.85)
  assert.ok(center.v > 0.4 && center.v < 0.6 && center.s > 0.4 && center.s < 0.6)
  assert.ok(nearBottom.v > 0.03 && nearBottom.v < 0.09, JSON.stringify(nearBottom))
  assert.ok(bottomEdge.v < 0.03, JSON.stringify(bottomEdge))

  await page.mouse.move(box.x + 20, box.y + box.height - 10)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width - 20, box.y + box.height - 10, { steps: 4 })
  await page.mouse.up()
  await page.waitForTimeout(50)
  const dragged = await readHsv(page)
  assert.ok(dragged.v > 0.03 && dragged.v < 0.09 && dragged.s > 0.7, JSON.stringify(dragged))

  await page.touchscreen.tap(box.x + box.width / 2, box.y + 6)
  await page.waitForTimeout(50)
  const touched = await readHsv(page)
  assert.ok(touched.v > 0.9, JSON.stringify(touched))

  await square.focus()
  const beforeKeys = await readHsv(page)
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(50)
  const afterDown = await readHsv(page)
  assert.ok(beforeKeys.v - afterDown.v > 0.03, JSON.stringify({ beforeKeys, afterDown }))
  await page.keyboard.press('ArrowLeft')
  await page.waitForTimeout(50)
  const afterLeft = await readHsv(page)
  assert.ok(afterDown.s - afterLeft.s > 0.03, JSON.stringify({ afterDown, afterLeft }))

  const hue = await page.locator('.react-colorful__hue').boundingBox()
  assert.ok(hue)
  await page.mouse.click(hue.x + 8, hue.y + hue.height / 2)
  await page.waitForTimeout(50)
  const redHue = await readHsv(page)
  await page.mouse.click(hue.x + hue.width * 0.33, hue.y + hue.height / 2)
  await page.waitForTimeout(50)
  const greenHue = await readHsv(page)
  assert.ok(Math.abs(redHue.h) < 20 || redHue.h > 340, JSON.stringify(redHue))
  assert.ok(greenHue.h > 70 && greenHue.h < 160, JSON.stringify(greenHue))

  await page.locator('#appearance-headerBackground-hex').fill('#123456')
  await page.locator('#appearance-headerBackground-hex').blur()
  await page.waitForTimeout(50)
  assert.equal((await readHsv(page)).hex, '#123456')
  await page.close()
})

test('only an admin sees the Door Builder Appearance section link', async () => {
  const member = await browser!.newPage()
  await member.goto(`http://127.0.0.1:${port}/?role=member#profile-nav-harness`, { waitUntil: 'networkidle' })
  await member.getByRole('link', { name: 'Company Details' }).waitFor()
  assert.equal(await member.getByRole('link', { name: 'Door Builder Appearance' }).count(), 0)
  assert.equal(await member.getByRole('heading', { name: 'Door Builder Appearance' }).count(), 0)
  await member.getByRole('link', { name: 'Door Builder Branding' }).waitFor()
  await member.close()

  const admin = await browser!.newPage()
  await admin.goto(`http://127.0.0.1:${port}/?role=admin#profile-nav-harness`, { waitUntil: 'networkidle' })
  await admin.getByRole('link', { name: 'Door Builder Appearance' }).waitFor()
  await admin.getByRole('heading', { name: 'Door Builder Appearance' }).waitFor()
  await admin.close()
})
