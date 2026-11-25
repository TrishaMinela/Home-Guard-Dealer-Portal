import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import test from 'node:test'
import playwright, { type Page } from 'playwright-core'

const port = 5196
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

async function openPreview(page: Page) {
  await page.addInitScript(() => {
    const calls: string[] = []
    const record = (value: unknown) => calls.push(String(value))
    const originalFetch = window.fetch
    window.fetch = ((input, init) => {
      record(input instanceof Request ? input.url : input)
      return originalFetch(input, init)
    }) as typeof window.fetch
    const originalOpen = XMLHttpRequest.prototype.open
    XMLHttpRequest.prototype.open = function open(this: XMLHttpRequest, method: string, url: string | URL, async?: boolean, username?: string | null, password?: string | null) {
      record(url)
      return originalOpen.call(this, method, url, async ?? true, username, password)
    }
    Object.assign(window, { __previewNetwork: calls })
  })
  await page.goto(`http://127.0.0.1:${port}/#appearance-harness`, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'Door Builder Appearance' }).waitFor()
}

test('the preview shows the real builder layout and does not call the network', async () => {
  const page = await browser!.newPage({ viewport: { width: 1440, height: 900 } })
  await openPreview(page)
  const network = () => page.evaluate(() => (window as unknown as { __previewNetwork: string[] }).__previewNetwork)
  assert.equal(await page.getByRole('button', { name: 'Outside' }).count(), 0)
  assert.equal(await page.getByRole('button', { name: 'Inside' }).count(), 0)
  assert.equal(await page.getByText('Main body text stays independent of the header and footer.').count(), 0)
  assert.equal(await page.getByText('Selected card description.').count(), 0)
  assert.equal(await page.getByText('Preview info stays on the panel').count(), 0)
  await page.evaluate(() => document.fonts.ready)
  assert.equal(await page.evaluate(() => document.fonts.check('16px "PT Sans"')), true)
  const desktopLogos = await page.locator('.db-preview-scale .logo-pair img').evaluateAll((images) => images.map((image) => {
    const box = image as HTMLElement
    return { width: box.offsetWidth, height: box.offsetHeight }
  }))
  assert.deepEqual(desktopLogos.map((logo) => logo.height), [72, 72])
  assert.ok(desktopLogos[0].width >= 65 && desktopLogos[0].width <= 74, JSON.stringify(desktopLogos[0]))
  assert.ok(desktopLogos[1].width >= 165 && desktopLogos[1].width <= 180, JSON.stringify(desktopLogos[1]))
  const paragraph = await page.locator('.db-appearance-preview .section-heading p').evaluate((element) => {
    const style = getComputedStyle(element)
    return { color: style.color, fontFamily: style.fontFamily }
  })
  assert.equal(paragraph.color, 'rgb(83, 88, 96)')
  assert.match(paragraph.fontFamily, /PT Sans/)
  const stepLabel = await page.locator('.db-appearance-preview .step-label-row span').evaluate((element) => getComputedStyle(element).color)
  assert.equal(stepLabel, 'rgb(83, 98, 103)')
  const inactiveStep = await page.locator('.db-appearance-preview .stepper button:not(.active) em').first().evaluate((element) => {
    const style = getComputedStyle(element)
    return { size: style.fontSize, color: style.color }
  })
  assert.equal(inactiveStep.size, '14px')
  assert.equal(inactiveStep.color, 'rgb(121, 131, 134)')
  assert.equal(await page.locator('.db-appearance-preview .section-heading h1').evaluate((element) => getComputedStyle(element).fontSize), '36px')
  assert.equal(await page.locator('.db-appearance-preview .popular-styles h2').evaluate((element) => getComputedStyle(element).fontSize), '28px')
  const scratch = await page.locator('.popular-styles-or').evaluate((element) => {
    const style = getComputedStyle(element)
    return { size: style.fontSize, weight: style.fontWeight, color: style.color }
  })
  assert.deepEqual(scratch, { size: '16px', weight: '400', color: 'rgb(83, 88, 96)' })
  const labelBeforeHeading = await page.evaluate(() => {
    const label = document.querySelector('.db-appearance-preview .step-label-row')
    const heading = document.querySelector('.db-appearance-preview .popular-styles h2')
    if (!label || !heading) return false
    return (label.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 && label.getBoundingClientRect().bottom <= heading.getBoundingClientRect().top + 1
  })
  assert.equal(labelBeforeHeading, true)
  assert.equal(await page.locator('.db-appearance-preview .stepper button > span').first().evaluate((element) => getComputedStyle(element).display), 'none')
  assert.equal(await page.locator('.db-appearance-preview .stepper .active').evaluate((element) => getComputedStyle(element, '::before').backgroundColor), 'rgb(248, 211, 14)')
  assert.equal(await page.getByRole('button', { name: 'Dealer Mode' }).count(), 1)
  assert.equal(await page.getByRole('heading', { name: /Start with a popular style/ }).count(), 1)
  const wideFrame = await page.locator('.db-preview-frame').evaluate((element) => element.getBoundingClientRect().width)
  assert.ok(wideFrame > 900, `desktop preview is only ${wideFrame}px wide`)
  const columns = await page.locator('.db-appearance-preview main').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)
  assert.equal(columns, 2)
  assert.equal(await page.locator('.db-appearance-preview aside').evaluate((element) => getComputedStyle(element).display), 'flex')
  await page.getByRole('button', { name: 'Mobile', exact: true }).click()
  assert.equal(await page.locator('.db-appearance-preview aside').evaluate((element) => getComputedStyle(element).display), 'none')
  assert.equal(await page.locator('.db-appearance-preview .mobile-live-preview').evaluate((element) => getComputedStyle(element).display), 'grid')
  const mobileLogos = await page.locator('.db-preview-scale .logo-pair img').evaluateAll((images) => images.map((image) => (image as HTMLElement).offsetHeight))
  assert.deepEqual(mobileLogos, [32, 32])
  assert.equal(await page.locator('.db-appearance-preview.is-mobile > header').evaluate((element) => (element as HTMLElement).offsetHeight), 72)
  assert.equal(await page.locator('.db-appearance-preview.is-mobile .home-return').evaluate((element) => (element as HTMLElement).offsetWidth) <= 40, true)
  assert.notEqual(await page.locator('.mobile-live-preview .preview-reset-design').evaluate((element) => getComputedStyle(element).display), 'none')
  const mobileCards = await page.locator('.db-appearance-preview.is-mobile .door-configuration-grid').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)
  assert.equal(mobileCards, 3)
  assert.equal(await page.locator('.db-appearance-preview .section-heading h1').evaluate((element) => getComputedStyle(element).fontSize), '28px')
  assert.equal(await page.locator('.db-appearance-preview .popular-styles h2').evaluate((element) => getComputedStyle(element).fontSize), '24px')
  await page.locator('#appearance-headerBackground').click()
  await page.locator('#appearance-headerBackground-hex').fill('#112233')
  await page.locator('.appearance-popover__done').click()
  assert.equal(await page.locator('.db-appearance-preview .section-heading p').evaluate((element) => getComputedStyle(element).color), 'rgb(83, 88, 96)')
  await page.getByRole('button', { name: 'Desktop', exact: true }).click()
  await page.locator('#appearance-bodyBackground').click()
  await page.locator('#appearance-bodyBackground-hex').fill('#112233')
  await page.locator('.appearance-popover__done').click()
  await page.locator('.appearance-color').filter({ has: page.locator('#appearance-bodyText') }).getByRole('radio', { name: 'White', exact: true }).click()
  const panel = await page.locator('.db-appearance-preview .builder-panel').evaluate((element) => getComputedStyle(element).backgroundColor)
  const aside = await page.locator('.db-appearance-preview aside').evaluate((element) => getComputedStyle(element).backgroundColor)
  assert.equal(aside, 'rgb(233, 240, 241)')
  const heading = await page.locator('.db-appearance-preview .section-heading h1').evaluate((element) => getComputedStyle(element).color)
  assert.equal(panel, 'rgb(17, 34, 51)')
  assert.equal(heading, 'rgb(255, 255, 255)')
  assert.deepEqual(await network(), [])
  await page.close()
})
