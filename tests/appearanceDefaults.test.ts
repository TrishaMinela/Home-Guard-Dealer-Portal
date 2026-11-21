import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import test from 'node:test'
import playwright, { type Page } from 'playwright-core'

const port = 5197
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

function defaultButton(page: Page, id: string) {
  return page.locator('.appearance-color').filter({ has: page.locator(`#${id}`) }).getByRole('button', { name: 'Default', exact: true })
}

async function openHarness(page: Page) {
  await page.goto(`http://127.0.0.1:${port}/#appearance-harness`, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'Door Builder Appearance' }).waitFor()
}

async function setHex(page: Page, id: string, hex: string) {
  await page.locator(`#${id}`).click()
  await page.locator(`#${id}-hex`).fill(hex)
  await page.locator('.appearance-popover__done').click()
  await page.locator('.appearance-popover').waitFor({ state: 'hidden' })
}

async function headerPaint(page: Page) {
  return page.locator('header[aria-label="Homepage header"]').evaluate((element) => {
    const style = getComputedStyle(element)
    return { background: style.backgroundColor, color: style.color }
  })
}

test('Default clears one color, updates the preview, and leaves the other colors', async () => {
  const page = await browser!.newPage({ viewport: { width: 1280, height: 1000 } })
  await openHarness(page)
  const original = await headerPaint(page)
  assert.equal(await page.locator('.appearance-color__default').count(), await page.locator('.appearance-color').count())
  const backgroundDefault = defaultButton(page, 'appearance-headerBackground')
  assert.equal(await backgroundDefault.getAttribute('aria-disabled'), 'true')
  await setHex(page, 'appearance-headerBackground', '#ff0000')
  await setHex(page, 'appearance-headerText', '#111111')
  const custom = await headerPaint(page)
  assert.equal(custom.background, 'rgb(255, 0, 0)')
  assert.equal(custom.color, 'rgb(17, 17, 17)')
  assert.equal(await backgroundDefault.isDisabled(), false)
  await backgroundDefault.click()
  const cleared = await headerPaint(page)
  assert.deepEqual(cleared, { background: original.background, color: 'rgb(17, 17, 17)' })
  assert.equal(await backgroundDefault.getAttribute('aria-disabled'), 'true')
  assert.notEqual(await page.getByTestId('saved-appearance').textContent(), expectSaved('#ff0000'))
  await page.close()
})

function expectSaved(hex: string) {
  return JSON.stringify({ headerBackground: hex })
}

test('Cancel restores the saved appearance and Save survives a remount', async () => {
  const page = await browser!.newPage({ viewport: { width: 1280, height: 1000 } })
  await openHarness(page)
  const original = await headerPaint(page)
  await setHex(page, 'appearance-headerBackground', '#00aa00')
  await page.getByRole('button', { name: 'Cancel Changes' }).click()
  assert.deepEqual(await headerPaint(page), original)
  await setHex(page, 'appearance-headerBackground', '#ff00aa')
  await page.getByRole('button', { name: 'Save Appearance' }).click()
  await page.getByText('Door Builder appearance saved.').waitFor()
  const saved = JSON.parse(await page.getByTestId('saved-appearance').innerText())
  assert.deepEqual(saved, { headerBackground: '#ff00aa' })
  assert.equal('primary_color' in saved || 'logo_url' in saved, false)
  await page.getByRole('button', { name: 'Reload appearance' }).click()
  await page.getByRole('heading', { name: 'Door Builder Appearance' }).waitFor()
  assert.equal((await headerPaint(page)).background, 'rgb(255, 0, 170)')
  await page.close()
})

test('Reset All asks for confirmation and clears only the appearance draft', async () => {
  const page = await browser!.newPage({ viewport: { width: 1280, height: 1000 } })
  await openHarness(page)
  const original = await headerPaint(page)
  await setHex(page, 'appearance-headerBackground', '#ff0000')
  await page.getByRole('button', { name: 'Save Appearance' }).click()
  await page.getByText('Door Builder appearance saved.').waitFor()
  await setHex(page, 'appearance-footerBackground', '#123456')
  await page.getByRole('button', { name: 'Reset All Colors to Default' }).click()
  const dialog = page.getByRole('alertdialog')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  assert.equal((await headerPaint(page)).background, 'rgb(255, 0, 0)')
  await page.getByRole('button', { name: 'Reset All Colors to Default' }).click()
  await dialog.getByRole('button', { name: 'Reset All Colors to Default' }).click()
  assert.deepEqual(await headerPaint(page), original)
  assert.match(await page.getByTestId('saved-appearance').innerText(), /headerBackground/)
  await page.getByRole('button', { name: 'Save Appearance' }).click()
  assert.equal((await page.getByTestId('saved-appearance').innerText()).trim(), 'null')
  await page.close()
})

test('a selected preview card keeps its selected border while hovered', async () => {
  const page = await browser!.newPage({ viewport: { width: 1280, height: 1100 } })
  await openHarness(page)
  await setHex(page, 'appearance-cardSelectedBorder', '#0b6b2a')
  await setHex(page, 'appearance-cardHoverAccent', '#123a8a')
  const selected = page.locator('.db-appearance-preview .option-card.selected')
  const plain = page.locator('.db-appearance-preview .option-card:not(.selected)')
  await selected.hover()
  assert.equal(await selected.evaluate((element) => getComputedStyle(element).borderTopColor), 'rgb(11, 107, 42)')
  await plain.hover()
  assert.equal(await plain.evaluate((element) => getComputedStyle(element).borderTopColor), 'rgb(18, 58, 138)')
  await page.close()
})

test('every color row stays inside its card at every checked width', async () => {
  const page = await browser!.newPage({ viewport: { width: 1280, height: 900 } })
  await openHarness(page)
  for (const width of [320, 390, 768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    const problems = await page.evaluate(() => {
      const overlaps = (a: DOMRect, b: DOMRect) => a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5
      const inside = (inner: DOMRect, outer: DOMRect) => inner.left >= outer.left - 1 && inner.right <= outer.right + 1 && inner.top >= outer.top - 1 && inner.bottom <= outer.bottom + 1 && inner.width > 8 && inner.height > 8
      const preview = document.querySelector('.db-preview-shell')?.getBoundingClientRect()
      const found: string[] = []
      const rows = [...document.querySelectorAll<HTMLElement>('.appearance-color')]
      rows.forEach((row, index) => {
        const group = row.closest('.appearance-group')
        if (!group) {
          found.push(`${index} missing card`)
          return
        }
        const card = group.getBoundingClientRect()
        const parts = [row.querySelector(':scope > span'), row.querySelector('.appearance-color__trigger'), row.querySelector('.appearance-color__default')].map((element) => element?.getBoundingClientRect())
        if (parts.some((box) => !box)) {
          found.push(`${index} missing control`)
          return
        }
        const [label, color, reset] = parts as DOMRect[]
        if (!inside(label, card) || !inside(color, card) || !inside(reset, card)) found.push(`${index} escapes ${Math.round(card.width)}px card`)
        if (overlaps(label, color) || overlaps(label, reset) || overlaps(color, reset)) found.push(`${index} controls overlap`)
        if (preview && (overlaps(label, preview) || overlaps(color, preview) || overlaps(reset, preview))) found.push(`${index} hits the preview`)
        for (let other = index + 1; other < rows.length; other += 1) {
          const neighbour = rows[other].getBoundingClientRect()
          if (overlaps(color, neighbour) || overlaps(reset, neighbour) || overlaps(label, neighbour)) found.push(`${index} hits row ${other}`)
        }
      })
      return { count: rows.length, found }
    })
    assert.equal(problems.count, 39, `${width}px row count`)
    assert.deepEqual(problems.found, [], `${width}px ${problems.found.join('; ')}`)
  }
  await page.close()
})

test('the admin dealer nav scrolls to the existing appearance section', async () => {
  const page = await browser!.newPage({ viewport: { width: 1100, height: 700 } })
  await page.goto(`http://127.0.0.1:${port}/#admin-nav-harness`, { waitUntil: 'networkidle' })
  await page.getByRole('link', { name: 'Door Builder Appearance' }).click()
  await page.waitForFunction(() => {
    const section = document.getElementById('door-builder-appearance')
    return window.location.hash === '#door-builder-appearance' && !!section && section.getBoundingClientRect().top < 180
  })
  await page.close()
})

test('a dealer member does not see the appearance link or controls', async () => {
  const page = await browser!.newPage({ viewport: { width: 1100, height: 800 } })
  await page.goto(`http://127.0.0.1:${port}/?role=member#profile-nav-harness`, { waitUntil: 'networkidle' })
  await page.getByRole('link', { name: 'Company Details' }).waitFor()
  assert.equal(await page.getByRole('link', { name: 'Door Builder Appearance' }).count(), 0)
  assert.equal(await page.getByRole('button', { name: 'Default', exact: true }).count(), 0)
  assert.equal(await page.getByRole('heading', { name: 'Door Builder Appearance' }).count(), 0)
  await page.close()
})
