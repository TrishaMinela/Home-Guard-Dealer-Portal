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

test('main colors paint the left configuration area and leave the door panel alone', async () => {
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
  assert.equal(right.background, 'rgb(233, 240, 241)')
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
  await page.getByRole('link', { name: 'Branding Studio' }).click()
  await page.waitForFunction(() => {
    const section = document.getElementById('branding-studio')
    return window.location.hash === '#branding-studio' && !!section && section.getBoundingClientRect().top < 180
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
  assert.equal((await paint(page, '.db-appearance-preview .db-preview-panel')).background, 'rgb(233, 240, 241)')
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
  assert.equal((await paint(page, '.db-appearance-preview .db-preview-panel')).background, 'rgb(233, 240, 241)')
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

async function openStudio(page: Page, role: 'admin' | 'member' = 'admin') {
  await page.goto(`http://127.0.0.1:${port}/?role=${role}#profile-nav-harness`, { waitUntil: 'networkidle' })
  await page.getByRole('link', { name: 'Customize Door Builder' }).click()
  await page.getByRole('heading', { name: 'Branding & Appearance' }).waitFor()
}

test('the branding studio keeps a large preview and moves the homepage logo between header and hero', async () => {
  const page = await browser!.newPage({ viewport: { width: 1440, height: 900 } })
  await openStudio(page)
  await page.getByRole('button', { name: 'Logo Display' }).click()
  await page.getByRole('radio', { name: /Hero/ }).check()
  assert.equal(await page.locator('.branding-studio__status').innerText(), 'Unsaved changes')
  await page.getByRole('button', { name: 'Homepage', exact: true }).click()
  assert.equal(await page.locator('.db-appearance-preview header .logo-pair, .db-appearance-preview header .dealer-brand-mark').count(), 0)
  assert.equal(await page.locator('.dealer-hero-logo img').count() > 0, true)
  const heroBackground = await page.locator('.db-home .home-hero').evaluate((element) => getComputedStyle(element).backgroundColor)
  assert.equal(heroBackground, 'rgb(255, 255, 255)')
  await page.getByRole('radio', { name: /Header/ }).check()
  assert.equal(await page.locator('.db-appearance-preview header img').count() > 0, true)
  assert.equal(await page.locator('.dealer-hero-logo').count(), 0)
  await page.getByRole('button', { name: 'Colors', exact: true }).click()
  await page.getByRole('button', { name: 'Typography', exact: true }).click()
  await page.locator('#heading-font-family').selectOption({ index: 1 })
  const chosenFont = await page.locator('#heading-font-family').inputValue()
  await page.getByRole('button', { name: 'Logos', exact: true }).click()
  await page.getByRole('button', { name: 'Typography', exact: true }).click()
  assert.equal(await page.locator('#heading-font-family').inputValue(), chosenFont)
  assert.equal(await page.locator('.branding-studio__status').innerText(), 'Unsaved changes')
  await page.close()
})

test('old branding links open the matching studio category', async () => {
  const page = await browser!.newPage({ viewport: { width: 1280, height: 900 } })
  await page.goto(`http://127.0.0.1:${port}/?role=admin#profile-nav-harness`, { waitUntil: 'networkidle' })
  await page.evaluate(() => { window.location.hash = 'door-builder-appearance' })
  await page.getByRole('heading', { name: 'Door Builder Appearance' }).waitFor()
  await page.getByRole('link', { name: 'Company Details', exact: true }).click()
  await page.getByRole('link', { name: 'Company Details', exact: true }).waitFor()
  await page.evaluate(() => { window.location.hash = 'heading-font-family' })
  await page.locator('#heading-font-family').waitFor()
  await page.close()
})

test('the mobile branding sheet stays above the page and can be closed', async () => {
  const page = await browser!.newPage({ viewport: { width: 390, height: 844 } })
  await openStudio(page)
  await page.getByRole('button', { name: 'Edit Settings' }).click()
  const close = page.getByRole('button', { name: 'Close', exact: true })
  const hit = await close.evaluate((element) => {
    const box = element.getBoundingClientRect()
    const target = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
    const save = document.querySelector<HTMLElement>('.branding-studio__actions .button--primary')?.getBoundingClientRect()
    return {
      top: box.top,
      hit: target === element || element.contains(target),
      saveVisible: !!save && save.bottom > 0 && save.top < window.innerHeight,
    }
  })
  assert.equal(hit.hit, true)
  assert.equal(hit.saveVisible, true)
  assert.ok(hit.top >= 0, `close button at ${hit.top}`)
  await close.click()
  assert.equal(await page.locator('.branding-studio').getAttribute('class'), 'branding-studio')
  await page.close()
})

test('the homepage and find my door previews use the live type, porch, and dealer color', async () => {
  const page = await browser!.newPage({ viewport: { width: 1440, height: 900 } })
  await openStudio(page)
  await page.getByRole('button', { name: 'Homepage', exact: true }).click()
  const home = await page.evaluate(() => {
    const heading = document.querySelector('.db-home h1')
    const emphasis = heading?.querySelector('em')
    const image = document.querySelector<HTMLImageElement>('.db-home .home-entryway-image')
    const door = document.querySelector<HTMLImageElement>('.db-home .hero-door')
    const frame = document.querySelector('.db-home .hero-composite')
    const caption = document.querySelector('.db-home .home-preview-caption')
    const firstCaption = caption?.querySelector('p')
    const button = document.querySelector<HTMLElement>('.db-home .start-building')
    const frameBox = frame?.getBoundingClientRect()
    const captionBox = caption?.getBoundingClientRect()
    return {
      headingStyle: heading ? getComputedStyle(heading).fontStyle : '',
      headingWeight: heading ? getComputedStyle(heading).fontWeight : '',
      emphasisStyle: emphasis ? getComputedStyle(emphasis).fontStyle : '',
      emphasisWeight: emphasis ? getComputedStyle(emphasis).fontWeight : '',
      image: image?.getAttribute('src') ?? '',
      door: door?.getAttribute('src') ?? '',
      aspect: frameBox && frameBox.height > 0 ? frameBox.width / frameBox.height : 0,
      captionBelow: !!frameBox && !!captionBox && captionBox.top >= frameBox.bottom - 2 && captionBox.left >= frameBox.left - 2 && captionBox.right <= frameBox.right + 2,
      captionWeight: firstCaption ? getComputedStyle(firstCaption).fontWeight : '',
      button: button ? getComputedStyle(button).backgroundColor : '',
    }
  })
  assert.equal(home.headingStyle, 'normal')
  assert.equal(home.headingWeight, '400')
  assert.equal(home.emphasisStyle, 'italic')
  assert.equal(home.emphasisWeight, '700')
  assert.equal(home.image, '/appearance-preview/hero-entryway.webp')
  assert.equal(home.door, '/appearance-preview/hero-ai-01-navy.webp')
  assert.equal(home.captionBelow, true)
  assert.ok(home.aspect > 1.7 && home.aspect < 1.85, `desktop photo ratio ${home.aspect}`)
  assert.equal(Number(home.captionWeight) < 600, true)
  assert.equal(home.button, 'rgb(35, 81, 118)')
  await page.getByRole('button', { name: 'Mobile', exact: true }).click()
  const mobileHome = await page.evaluate(() => {
    const frame = document.querySelector('.db-home .hero-composite')?.getBoundingClientRect()
    const captions = [...document.querySelectorAll('.db-home .home-preview-caption p')].map((item) => item.getBoundingClientRect())
    return {
      aspect: frame && frame.height > 0 ? frame.width / frame.height : 0,
      stacked: captions.length === 2 && captions[1].top >= captions[0].bottom - 2,
    }
  })
  assert.ok(mobileHome.aspect > 1.25 && mobileHome.aspect < 1.42, `mobile photo ratio ${mobileHome.aspect}`)
  assert.equal(mobileHome.stacked, true)
  await page.getByRole('button', { name: 'Desktop', exact: true }).click()
  await page.getByRole('button', { name: 'Find My Door', exact: true }).click()
  const find = await page.evaluate(() => {
    const upload = document.querySelector<HTMLElement>('.find-door-upload')
    const bar = getComputedStyle(document.querySelector('.find-door-gallery h2')!, '::after')
    return { upload: upload ? getComputedStyle(upload).backgroundColor : '', underline: bar.backgroundColor, underlineHeight: bar.height }
  })
  assert.equal(find.upload, 'rgb(35, 81, 118)')
  assert.equal(find.underline, 'rgb(248, 211, 14)')
  assert.ok(parseFloat(find.underlineHeight) >= 3, find.underlineHeight)
  await page.getByRole('button', { name: 'Mobile', exact: true }).click()
  const mobile = await page.evaluate(() => {
    const photo = document.querySelector('.find-door-feature')?.getBoundingClientRect()
    const copy = document.querySelector('.find-door-lead')?.getBoundingClientRect()
    const images = [...document.querySelectorAll('.find-door-marquee img')].map((image) => image.getBoundingClientRect())
    return {
      photoFirst: !!photo && !!copy && photo.bottom <= copy.top + 2,
      row: images.length === 3 && images[1].left >= images[0].right - 2 && Math.abs(images[0].top - images[1].top) < 4,
    }
  })
  assert.equal(mobile.photoFirst, true)
  assert.equal(mobile.row, true)
  await page.close()
})

test('the branding studio fits the preview and settings at every requested width', async () => {
  const page = await browser!.newPage({ viewport: { width: 1440, height: 900 } })
  await openStudio(page)
  for (const width of [320, 390, 768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    if (width < 1024) await page.getByRole('button', { name: 'Edit Settings' }).click()
    const fit = await page.evaluate((narrow) => {
      const preview = document.querySelector('.branding-studio__preview')?.getBoundingClientRect()
      const settings = document.querySelector('.branding-studio__editor')?.getBoundingClientRect()
      const nav = document.querySelector('.branding-studio__nav')?.getBoundingClientRect()
      const save = document.querySelector<HTMLElement>(narrow ? '.branding-studio__sheet-actions .button--primary' : '.branding-studio__actions .button--primary')
      const saveBox = save?.getBoundingClientRect()
      const saveTarget = saveBox ? document.elementFromPoint(saveBox.left + saveBox.width / 2, saveBox.top + saveBox.height / 2) : null
      const upload = document.querySelector('.studio-logo__actions .button')?.getBoundingClientRect()
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        preview: preview ? Math.round(preview.width) : 0,
        settings: settings ? Math.round(settings.width) : 0,
        nav: nav ? Math.round(nav.width) : 0,
        overlap: !!(preview && settings && settings.width > 8 && preview.width > 8 && settings.right > preview.left + 8 && settings.left < preview.right - 8 && settings.bottom > preview.top + 8 && settings.top < preview.bottom - 8),
        save: !!(save && saveTarget && (saveTarget === save || save.contains(saveTarget))),
        uploadTop: upload ? Math.round(upload.top) : -1,
      }
    }, width < 1024)
    assert.ok(fit.overflow <= 1, `${width}px overflow ${fit.overflow}`)
    assert.ok(fit.preview >= Math.min(280, width - 40), `${width}px preview ${fit.preview}`)
    if (width >= 1024) {
      assert.ok(fit.nav >= 90 && fit.nav <= 110, `${width}px nav ${fit.nav}`)
      assert.ok(fit.settings >= 300 && fit.settings <= 340, `${width}px editor ${fit.settings}`)
      assert.equal(fit.overlap, false, `${width}px editor overlaps the preview`)
      assert.ok(fit.uploadTop >= 0 && fit.uploadTop < 700, `${width}px upload at ${fit.uploadTop}`)
    }
    assert.equal(fit.save, true, `${width}px save is covered`)
    if (width < 1024) await page.getByRole('button', { name: 'Close', exact: true }).click()
  }
  await page.close()
})

test('studio drafts survive categories and discard, and a partial save names the failed piece', async () => {
  const page = await browser!.newPage({ viewport: { width: 1280, height: 900 } })
  await page.route('**/*', async (route) => {
    const url = route.request().url()
    if (!url.includes('example.supabase.co')) {
      await route.continue()
      return
    }
    if (url.includes('update_my_dealer_door_builder_appearance')) {
      await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'colors rejected', code: 'P0001' }) })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: 'null' })
  })
  const writes: string[] = []
  page.on('request', (request) => {
    if (request.method() !== 'GET' && request.url().includes('example.supabase.co')) writes.push(request.url())
  })
  await openStudio(page)
  await page.getByRole('button', { name: 'Homepage', exact: true }).click()
  await page.getByRole('button', { name: 'Mobile', exact: true }).click()
  assert.deepEqual(writes, [])
  await page.getByRole('button', { name: 'Logo Display' }).click()
  await page.getByRole('radio', { name: /Hero/ }).check()
  await page.getByRole('button', { name: 'Colors', exact: true }).click()
  await page.locator('#appearance-headerBackground').click()
  await page.locator('#appearance-headerBackground-hex').fill('#ff0000')
  await page.locator('.appearance-popover__done').click()
  assert.equal(await page.locator('.branding-studio__status').innerText(), 'Unsaved changes')
  await page.getByRole('button', { name: 'Save Changes' }).click()
  await page.getByRole('alert').waitFor()
  const alert = await page.getByRole('alert').innerText()
  assert.match(alert, /Saved Logo Display & Placement/)
  assert.match(alert, /Colors failed: colors rejected/)
  page.once('dialog', (dialog) => void dialog.accept())
  await page.getByRole('button', { name: 'Discard' }).click()
  assert.equal(await page.locator('.branding-studio__status').innerText(), 'All changes saved')
  await page.close()
})

test('leaving the studio with unsaved changes asks first and Back returns to the dealer', async () => {
  const page = await browser!.newPage({ viewport: { width: 1280, height: 900 } })
  await openStudio(page)
  await page.getByRole('button', { name: 'Logo Display' }).click()
  await page.getByRole('radio', { name: /Hero/ }).check()
  let asked = false
  page.once('dialog', (dialog) => { asked = true; void dialog.dismiss() })
  await page.getByRole('link', { name: 'Company Details', exact: true }).click()
  assert.equal(asked, true)
  assert.equal(await page.locator('.branding-studio').count(), 1)
  page.once('dialog', (dialog) => void dialog.accept())
  await page.getByRole('link', { name: 'Company Details', exact: true }).click()
  await page.getByRole('link', { name: 'Company Details', exact: true }).waitFor()
  await page.close()
})

test('a dealer member does not see appearance controls', async () => {
  const page = await browser!.newPage({ viewport: { width: 1100, height: 800 } })
  await openStudio(page, 'member')
  await page.getByRole('button', { name: 'Colors', exact: true }).click()
  await page.getByRole('heading', { name: 'Brand colors' }).waitFor()
  assert.equal(await page.getByRole('heading', { name: 'Door Builder Appearance' }).count(), 0)
  await page.getByRole('button', { name: 'Logos', exact: true }).waitFor()
  await page.close()
})

test('one logo and an admin studio still show both upload actions', async () => {
  const page = await browser!.newPage({ viewport: { width: 1280, height: 900 } })
  await page.goto(`http://127.0.0.1:${port}/?role=admin&studio=admin&logos=single#profile-nav-harness`, { waitUntil: 'networkidle' })
  await page.getByRole('link', { name: 'Customize Door Builder' }).click()
  await page.getByRole('heading', { name: 'Branding & Appearance' }).waitFor()
  assert.equal(await page.getByText('Upload Original').count(), 1)
  await page.getByText('Add Second Logo').waitFor()
  await page.getByRole('button', { name: 'Colors', exact: true }).click()
  await page.getByRole('heading', { name: 'Door Builder Appearance' }).waitFor()
  await page.close()
})

test('a dealer with no logo still opens the studio and the preview', async () => {
  const page = await browser!.newPage({ viewport: { width: 1280, height: 900 } })
  await page.goto(`http://127.0.0.1:${port}/?role=admin&logos=none#profile-nav-harness`, { waitUntil: 'networkidle' })
  await page.getByRole('link', { name: 'Customize Door Builder' }).click()
  await page.getByRole('heading', { name: 'Branding & Appearance' }).waitFor()
  await page.getByText('Add Second Logo').waitFor()
  assert.equal(await page.getByRole('button', { name: 'Generate White' }).first().isDisabled(), true)
  assert.equal(await page.getByRole('button', { name: 'Generate Black' }).first().getAttribute('title'), 'Upload a logo first')
  assert.equal(await page.getByRole('button', { name: 'Manage Variants' }).count(), 0)
  assert.doesNotMatch(await page.locator('#logo-original').innerText(), /Logo 1 · Active/)
  assert.match(await page.locator('.db-appearance-preview header').innerText(), /Diligent Exterior Remodeling/)
  await page.close()
})

test('the preview fills the studio and scrolls to Restart Build', async () => {
  const page = await browser!.newPage({ viewport: { width: 1440, height: 900 } })
  await openStudio(page)
  for (const width of [1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    const gap = await page.evaluate(() => {
      const studio = document.querySelector('.branding-studio')?.getBoundingClientRect()
      const card = document.querySelector('.branding-studio__preview-card')?.getBoundingClientRect()
      return {
        underCard: studio && card ? Math.round(studio.bottom - card.bottom) : 999,
        underStudio: studio ? Math.round(window.innerHeight - studio.bottom) : 999,
      }
    })
    assert.ok(gap.underCard < 24, `${width}px gap under the preview card ${gap.underCard}`)
    assert.ok(gap.underStudio < 24, `${width}px gap under the studio ${gap.underStudio}`)
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByRole('button', { name: 'Mobile', exact: true }).click()
  const reached = await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>('.branding-studio__preview .db-preview-shell')
    if (!shell || shell.scrollHeight <= shell.clientHeight + 8) return false
    const buttons = [...document.querySelectorAll<HTMLElement>('.preview-reset-design')]
    const button = buttons.find((item) => (item.textContent || '').includes('Restart Build') && getComputedStyle(item).display !== 'none' && item.getBoundingClientRect().height > 0)
    if (!button) return false
    const shellBox = shell.getBoundingClientRect()
    const box = button.getBoundingClientRect()
    shell.scrollTop += box.top - shellBox.top - 12
    const next = button.getBoundingClientRect()
    const nextShell = shell.getBoundingClientRect()
    const bottom = shell.scrollHeight - shell.clientHeight
    shell.scrollTop = bottom
    return next.top >= nextShell.top - 2 && next.bottom <= nextShell.bottom + 2 && shell.scrollTop > 40
  })
  assert.equal(reached, true)
  const underline = await page.locator('.section-heading h1').evaluate((element) => getComputedStyle(element, '::after').backgroundColor)
  assert.equal(underline, 'rgb(35, 81, 118)')
  await page.setViewportSize({ width: 1024, height: 900 })
  const overlap = await page.evaluate(() => {
    const name = document.querySelector('.branding-studio__identity p')?.getBoundingClientRect()
    const status = document.querySelector('.branding-studio__status')?.getBoundingClientRect()
    const title = document.querySelector('.branding-studio__identity h1')?.getBoundingClientRect()
    const live = document.querySelector('.branding-studio__live-status')?.getBoundingClientRect()
    const hits = (left?: DOMRect, right?: DOMRect) => !!left && !!right && left.right > right.left + 1 && left.left < right.right - 1 && left.bottom > right.top + 1 && left.top < right.bottom - 1
    return { nameStatus: hits(name, status), titleLive: hits(title, live) }
  })
  assert.equal(overlap.nameStatus, false)
  assert.equal(overlap.titleLive, false)
  await page.getByRole('button', { name: 'Mobile', exact: true }).click()
  const header = await page.evaluate(() => {
    const logo = document.querySelector<HTMLElement>('.db-appearance-preview.is-mobile header img')
    const link = document.querySelector<HTMLElement>('.db-appearance-preview.is-mobile .dealer-website-link')
    if (!logo || !link) return null
    const logoBox = logo.getBoundingClientRect()
    const linkBox = link.getBoundingClientRect()
    return { beside: linkBox.left >= logoBox.right - 1, text: (link.textContent || '').includes('Visit Our Website') }
  })
  assert.equal(header?.beside, true)
  assert.equal(header?.text, true)
  await page.getByRole('link', { name: 'Back to Company Details' }).waitFor()
  await page.close()
})

test('the preview box stays the same across categories and Save stays clickable', async () => {
  const page = await browser!.newPage({ viewport: { width: 1440, height: 900 } })
  await openStudio(page)
  const box = () => page.evaluate(() => {
    const preview = document.querySelector('.branding-studio__preview')?.getBoundingClientRect()
    const toolbar = document.querySelector('.branding-studio__toolbar')?.getBoundingClientRect()
    return {
      preview: preview ? [Math.round(preview.x), Math.round(preview.y), Math.round(preview.width), Math.round(preview.height)] : [],
      toolbar: toolbar ? [Math.round(toolbar.x), Math.round(toolbar.y), Math.round(toolbar.width), Math.round(toolbar.height)] : [],
    }
  })
  const first = await box()
  for (const name of ['Logo Display', 'Colors', 'Typography', 'Logos']) {
    await page.getByRole('button', { name, exact: true }).click()
    assert.deepEqual(await box(), first, name)
  }
  await page.getByRole('button', { name: 'Logo Display' }).click()
  await page.getByRole('radio', { name: /Hero/ }).check()
  const save = page.getByRole('button', { name: 'Save Changes' }).first()
  const hit = await save.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    return target === element || element.contains(target)
  })
  assert.equal(hit, true)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Edit Settings' }).click()
  await page.evaluate(() => {
    const bell = document.createElement('button')
    bell.textContent = 'Notifications'
    bell.style.position = 'fixed'
    bell.style.right = '18px'
    bell.style.bottom = '18px'
    bell.style.zIndex = '100'
    bell.style.width = '56px'
    bell.style.height = '56px'
    document.body.append(bell)
  })
  const mobileSave = page.locator('.branding-studio__sheet-actions .button--primary')
  const mobileHit = await mobileSave.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    return target === element || element.contains(target)
  })
  assert.equal(mobileHit, true)
  await page.close()
})

test('the preview and editor keep the same size while the editor scrolls', async () => {
  const page = await browser!.newPage({ viewport: { width: 1280, height: 900 } })
  await openStudio(page)
  const read = () => page.evaluate(() => {
    const preview = document.querySelector('.branding-studio__preview')?.getBoundingClientRect()
    const editor = document.querySelector('.branding-studio__editor')?.getBoundingClientRect()
    return {
      preview: preview ? [Math.round(preview.x), Math.round(preview.y), Math.round(preview.width), Math.round(preview.height)] : [],
      editor: editor ? [Math.round(editor.x), Math.round(editor.y), Math.round(editor.width), Math.round(editor.height)] : [],
    }
  })
  const top = await read()
  await page.locator('.branding-studio__editor').evaluate((element) => { element.scrollTop = element.scrollHeight / 2 })
  const middle = await read()
  await page.locator('.branding-studio__editor').evaluate((element) => { element.scrollTop = element.scrollHeight })
  const bottom = await read()
  assert.deepEqual(middle, top)
  assert.deepEqual(bottom, top)
  assert.ok(top.preview[2] > 400, `preview width ${top.preview[2]}`)
  await page.close()
})
