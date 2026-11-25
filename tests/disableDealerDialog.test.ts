import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import test from 'node:test'
import playwright, { type Page } from 'playwright-core'

const port = 5194
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
      if ((await fetch(`http://127.0.0.1:${port}/`)).ok) return
    } catch { /* starting */ }
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

function isStatusUpdate(url: string, method: string) {
  return method === 'PATCH' && url.includes('/rest/v1/dealers')
}

async function openAt(page: Page, width: number, scrolled: boolean) {
  await page.setViewportSize({ width, height: 800 })
  await page.goto(`http://127.0.0.1:${port}/#disable-dealer-harness`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Actions', exact: true }).waitFor()
  const scroller = page.locator('.portal-main')
  if (scrolled) await scroller.evaluate((element) => { element.scrollTop = 700 })
  const before = await scroller.evaluate((element) => element.scrollTop)
  await page.getByRole('button', { name: 'Actions', exact: true }).evaluate((button: HTMLButtonElement) => button.click())
  await page.getByRole('button', { name: 'Disable Dealer' }).evaluate((button: HTMLButtonElement) => button.click())
  const dialog = page.getByRole('dialog')
  await dialog.waitFor()
  return { scroller, before, dialog }
}

test('the disable confirmation stays above the page at every width and scroll position', async () => {
  const page = await browser!.newPage()
  const updates: string[] = []
  page.on('request', (request) => {
    if (isStatusUpdate(request.url(), request.method())) updates.push(request.url())
  })
  for (const width of [320, 390, 768, 1024, 1440]) {
    for (const scrolled of [false, true]) {
      const { scroller, before, dialog } = await openAt(page, width, scrolled)
      const box = await dialog.boundingBox()
      assert.ok(box, `${width} missing dialog`)
      const viewport = page.viewportSize()!
      assert.ok(box.x >= 8 && box.y >= 8, `${width} scrolled=${scrolled} origin`)
      assert.ok(box.x + box.width <= viewport.width - 8 && box.y + box.height <= viewport.height - 8, `${width} scrolled=${scrolled} inside`)
      const centerX = box.x + box.width / 2
      const centerY = box.y + box.height / 2
      assert.ok(Math.abs(centerX - viewport.width / 2) < 24, `${width} horizontal center`)
      assert.ok(Math.abs(centerY - viewport.height / 2) < 80, `${width} vertical center`)
      const topmost = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[role="dialog"]')?.getAttribute('role') ?? document.elementFromPoint(x, y)?.className, { x: centerX, y: centerY })
      assert.equal(topmost, 'dialog', `${width} scrolled=${scrolled} topmost ${topmost}`)
      const covered = await page.evaluate(() => {
        const nav = document.querySelector('.dealer-detail-nav')
        if (!nav) return 'missing-nav'
        const rect = nav.getBoundingClientRect()
        const hit = document.elementFromPoint(rect.left + 20, rect.top + 10)
        return hit?.closest('.disable-dealer-modal') ? 'backdrop' : hit?.className ?? 'none'
      })
      assert.equal(covered, 'backdrop', `${width} sticky nav ${covered}`)
      const backdrop = await page.locator('.disable-dealer-modal').boundingBox()
      assert.ok(backdrop && backdrop.width >= viewport.width - 1 && backdrop.height >= viewport.height - 1)
      assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden')
      await page.mouse.wheel(0, 400)
      assert.equal(await scroller.evaluate((element) => element.scrollTop), before)
      await page.keyboard.press('Escape')
      await dialog.waitFor({ state: 'hidden' })
      assert.equal(await scroller.evaluate((element) => element.scrollTop), before)
      assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Disable Dealer')
      assert.equal(updates.length, 0)
    }
  }

  const { dialog } = await openAt(page, 390, true)
  await page.keyboard.press('Tab')
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Disable')
  await page.keyboard.press('Tab')
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Cancel')
  await page.keyboard.press('Shift+Tab')
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Disable')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await dialog.waitFor({ state: 'hidden' })
  assert.equal(updates.length, 0)

  await page.getByRole('button', { name: 'Disable Dealer' }).evaluate((button: HTMLButtonElement) => button.click())
  const backdropDialog = page.getByRole('dialog')
  await backdropDialog.waitFor()
  await backdropDialog.locator('h2').click()
  assert.equal(await backdropDialog.isVisible(), true)
  await page.mouse.click(8, 8)
  await backdropDialog.waitFor({ state: 'hidden' })
  await page.waitForFunction(() => document.activeElement?.textContent === 'Disable Dealer')
  assert.equal(updates.length, 0)

  await page.getByRole('button', { name: 'Disable Dealer' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Disable' }).click()
  await page.waitForTimeout(300)
  assert.equal(updates.length, 1)
  await page.close()
})
