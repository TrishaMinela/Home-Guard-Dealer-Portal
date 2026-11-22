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
  assert.equal(await page.locator('.db-appearance-preview .logo-pair img').count(), 2)
  const columns = await page.locator('.db-appearance-preview main').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)
  assert.equal(columns, 2)
  assert.equal(await page.locator('.db-appearance-preview aside').evaluate((element) => getComputedStyle(element).display), 'flex')
  await page.getByRole('button', { name: 'Mobile', exact: true }).click()
  assert.equal(await page.locator('.db-appearance-preview aside').evaluate((element) => getComputedStyle(element).display), 'none')
  assert.equal(await page.locator('.db-appearance-preview .mobile-live-preview').evaluate((element) => getComputedStyle(element).display), 'grid')
  await page.getByRole('button', { name: 'Desktop', exact: true }).click()
  await page.locator('#appearance-bodyBackground').click()
  await page.locator('#appearance-bodyBackground-hex').fill('#112233')
  await page.locator('.appearance-popover__done').click()
  await page.locator('.appearance-color').filter({ has: page.locator('#appearance-bodyText') }).getByRole('radio', { name: 'White', exact: true }).click()
  const panel = await page.locator('.db-appearance-preview .builder-panel').evaluate((element) => getComputedStyle(element).backgroundColor)
  const aside = await page.locator('.db-appearance-preview aside').evaluate((element) => getComputedStyle(element).backgroundColor)
  const heading = await page.locator('.db-appearance-preview .section-heading h1').evaluate((element) => getComputedStyle(element).color)
  assert.equal(panel, 'rgb(17, 34, 51)')
  assert.equal(aside, 'rgb(17, 34, 51)')
  assert.equal(heading, 'rgb(255, 255, 255)')
  assert.deepEqual(await network(), [])
  await page.close()
})
