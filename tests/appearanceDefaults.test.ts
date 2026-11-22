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

function textChoice(page: Page, id: string, name: 'Black' | 'White') {
  return page.locator('.appearance-color').filter({ has: page.locator(`#${id}`) }).getByRole('radio', { name, exact: true })
}

async function paint(page: Page, selector: string) {
  return page.locator(selector).first().evaluate((element) => {
    const style = getComputedStyle(element)
    return { background: style.backgroundColor, color: style.color }
  })
}

async function headerPaint(page: Page) {
  return page.locator('header[aria-label="Door Builder header"]').evaluate((element) => {
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
  await textChoice(page, 'appearance-headerText', 'Black').click()
  const custom = await headerPaint(page)
  assert.equal(custom.background, 'rgb(255, 0, 0)')
  assert.equal(custom.color, 'rgb(0, 0, 0)')
  assert.equal(await backgroundDefault.isDisabled(), false)
  await backgroundDefault.click()
  const cleared = await headerPaint(page)
  assert.deepEqual(cleared, { background: original.background, color: 'rgb(0, 0, 0)' })
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

test('main colors do not repaint selection cards, and both panels share the main background', async () => {
  const page = await browser!.newPage({ viewport: { width: 1280, height: 1100 } })
  await openHarness(page)
  const card = page.locator('.db-appearance-preview .option-card.selected')
  const before = await card.evaluate((element) => {
    const style = getComputedStyle(element)
    const title = getComputedStyle(element.querySelector('strong')!)
    return { background: style.backgroundColor, border: style.borderTopColor, title: title.color }
  })
  await setHex(page, 'appearance-bodyBackground', '#203040')
  await textChoice(page, 'appearance-bodyText', 'White').click()
  const left = await paint(page, '.db-appearance-preview .builder-panel')
  const right = await paint(page, '.db-appearance-preview .db-preview-panel')
  assert.equal(left.background, 'rgb(32, 48, 64)')
  assert.equal(right.background, 'rgb(32, 48, 64)')
  assert.equal((await paint(page, '.db-appearance-preview .section-heading h1')).color, 'rgb(255, 255, 255)')
  const after = await card.evaluate((element) => {
    const style = getComputedStyle(element)
    const title = getComputedStyle(element.querySelector('strong')!)
    return { background: style.backgroundColor, border: style.borderTopColor, title: title.color }
  })
  assert.deepEqual(after, before)
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
        const parts = [row.querySelector(':scope > span'), row.querySelector('.appearance-color__trigger, .appearance-text'), row.querySelector('.appearance-color__default')].map((element) => element?.getBoundingClientRect())
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
    assert.equal(problems.count, 6, `${width}px row count`)
    assert.deepEqual(problems.found, [], `${width}px ${problems.found.join('; ')}`)
    const sticky = await page.locator('.db-preview-shell').evaluate((element) => getComputedStyle(element).position)
    assert.equal(sticky, width >= 1024 ? 'sticky' : 'static', `${width}px preview position`)
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

test('each background is independent and brand references resolve in the preview', async () => {
  const page = await browser!.newPage({ viewport: { width: 1280, height: 1000 } })
  await openHarness(page)
  const originalHeader = await headerPaint(page)
  const originalMain = await paint(page, '.db-appearance-preview .builder-panel')
  const originalFooter = await paint(page, '.db-appearance-preview .shared-site-footer')
  await setHex(page, 'appearance-headerBackground', '#ff0000')
  assert.equal((await headerPaint(page)).background, 'rgb(255, 0, 0)')
  assert.equal((await paint(page, '.db-appearance-preview .builder-panel')).background, originalMain.background)
  assert.equal((await paint(page, '.db-appearance-preview .shared-site-footer')).background, originalFooter.background)
  await defaultButton(page, 'appearance-headerBackground').click()
  await page.locator('#appearance-bodyBackground').click()
  await page.getByRole('radio', { name: 'Primary', exact: true }).click()
  await page.locator('.appearance-popover__done').click()
  assert.equal((await paint(page, '.db-appearance-preview .builder-panel')).background, 'rgb(35, 81, 118)')
  assert.equal((await paint(page, '.db-appearance-preview .db-preview-panel')).background, 'rgb(35, 81, 118)')
  assert.equal((await headerPaint(page)).background, originalHeader.background)
  await page.locator('#appearance-footerBackground').click()
  await page.getByRole('radio', { name: 'Secondary', exact: true }).click()
  await page.locator('.appearance-popover__done').click()
  assert.equal((await paint(page, '.db-appearance-preview .shared-site-footer')).background, 'rgb(142, 187, 83)')
  assert.equal((await paint(page, '.db-appearance-preview .builder-panel')).background, 'rgb(35, 81, 118)')
  await page.close()
})

test('black and white text color the header, main copy, and footer together', async () => {
  const page = await browser!.newPage({ viewport: { width: 1280, height: 1000 } })
  await openHarness(page)
  await textChoice(page, 'appearance-headerText', 'White').click()
  await textChoice(page, 'appearance-bodyText', 'Black').click()
  await textChoice(page, 'appearance-footerText', 'White').click()
  assert.equal((await headerPaint(page)).color, 'rgb(255, 255, 255)')
  assert.equal((await paint(page, '.db-appearance-preview header svg')).color, 'rgb(255, 255, 255)')
  assert.equal((await paint(page, '.db-appearance-preview .home-return')).color, 'rgb(255, 255, 255)')
  assert.equal((await paint(page, '.db-appearance-preview .section-heading h1')).color, 'rgb(0, 0, 0)')
  assert.equal((await paint(page, '.db-appearance-preview .shared-site-footer')).color, 'rgb(255, 255, 255)')
  assert.equal((await paint(page, '.db-appearance-preview .site-footer-feedback small')).color, 'rgb(255, 255, 255)')
  assert.equal(await page.getByRole('button', { name: 'Icon' }).count(), 0)
  assert.equal(await page.locator('legend', { hasText: 'Door selection cards' }).count(), 0)
  assert.equal(await page.locator('.appearance-color__trigger').count(), 3)
  await page.close()
})

test('legacy appearance shows the replacement note and save keeps only the six settings', async () => {
  const page = await browser!.newPage({ viewport: { width: 1280, height: 1000 } })
  await page.goto(`http://127.0.0.1:${port}/?legacy=1#appearance-harness`, { waitUntil: 'networkidle' })
  await page.getByText('This dealer has older advanced color settings; saving will replace them with the simplified settings.').waitFor()
  assert.equal(await page.getByText('Appearance has unsaved changes.').count(), 0)
  assert.equal(await page.getByRole('button', { name: 'Save Appearance' }).isDisabled(), true)
  assert.equal((await headerPaint(page)).background, 'rgb(17, 34, 51)')
  assert.equal((await paint(page, '.db-appearance-preview .db-preview-panel')).background, 'rgb(1, 2, 3)')
  assert.notEqual((await paint(page, '.db-appearance-preview .option-card')).background, 'rgb(255, 244, 214)')
  await textChoice(page, 'appearance-footerText', 'White').click()
  await page.getByText('Appearance has unsaved changes.').waitFor()
  await page.getByRole('button', { name: 'Save Appearance' }).click()
  await page.getByText('Door Builder appearance saved.').waitFor()
  const saved = JSON.parse(await page.getByTestId('saved-appearance').innerText())
  assert.deepEqual(saved, { headerBackground: '#112233', bodyBackground: '#010203', footerText: '#ffffff' })
  assert.equal(await page.locator('.portal-alert', { hasText: 'older advanced color settings' }).count(), 0)
  await page.getByRole('button', { name: 'Reload appearance' }).click()
  await page.getByRole('heading', { name: 'Door Builder Appearance' }).waitFor()
  assert.equal((await headerPaint(page)).background, 'rgb(17, 34, 51)')
  assert.equal(await page.locator('.portal-alert', { hasText: 'older advanced color settings' }).count(), 0)
  await page.close()
})

test('every appearance control stays clickable beside the sticky preview', async () => {
  for (const role of ['admin', 'dealer'] as const) {
    const page = await browser!.newPage({ viewport: { width: 1440, height: 900 } })
    const query = role === 'dealer' ? '?role=dealer' : ''
    await page.goto(`http://127.0.0.1:${port}/${query}#appearance-harness`, { waitUntil: 'networkidle' })
    await page.getByRole('heading', { name: 'Door Builder Appearance' }).waitFor()
    for (const width of [1024, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      const covered = await page.evaluate(() => {
        const rows = [...document.querySelectorAll<HTMLElement>('.appearance-color')]
        return rows.flatMap((row, index) => {
          row.scrollIntoView({ block: 'center', inline: 'nearest' })
          const box = row.getBoundingClientRect()
          const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
          return hit && row.contains(hit) ? [] : [`${index} hit ${hit?.className || 'nothing'}`]
        })
      })
      assert.deepEqual(covered, [], `${role} ${width}px ${covered.join('; ')}`)
    }
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.locator('.appearance-color').filter({ has: page.locator('#appearance-headerText') }).getByRole('radio', { name: 'White', exact: true }).click()
    await page.close()
  }
})

test('the preview stays on screen while the footer group is edited', async () => {
  const page = await browser!.newPage({ viewport: { width: 1440, height: 900 } })
  await openHarness(page)
  const footer = page.locator('fieldset').filter({ has: page.locator('legend', { hasText: 'Footer' }) })
  for (const width of [1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await footer.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'nearest' }))
    const box = await page.locator('.db-preview-shell').evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return { top: rect.top, bottom: rect.bottom, height: rect.height }
    })
    const visibleTop = Math.max(box.top, 0)
    const visibleBottom = Math.min(box.bottom, 900)
    assert.ok(visibleBottom - visibleTop > 240, `${width}px visible preview ${visibleBottom - visibleTop}`)
    assert.ok(box.top < 200 && box.bottom > 200, `${width}px preview ${box.top}-${box.bottom}`)
    assert.ok(box.height < 880, `${width}px preview height ${box.height}`)
  }
  assert.equal(await page.locator('.appearance-text').getByRole('radio', { name: 'Default', exact: true }).count(), 0)
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
