import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const port = 4173
const base = `http://127.0.0.1:${port}`
const pages = [
  ['queue', '/dev/lead-routing/queue'],
  ['review', '/dev/lead-routing/review'],
  ['territories', '/dev/lead-routing/territories'],
]
const widths = [1440, 768, 390]

const server = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  env: {
    ...process.env,
    VITE_SUPABASE_URL: 'https://example.supabase.co',
    VITE_SUPABASE_PUBLISHABLE_KEY: 'preview-only',
  },
  stdio: 'ignore',
})

try {
  const started = Date.now()
  let ready = false
  while (!ready) {
    if (Date.now() - started > 20000) throw new Error('Vite did not start.')
    try {
      const response = await fetch(`${base}/dev/lead-routing/queue`, { signal: AbortSignal.timeout(2000) })
      ready = response.ok
      await response.arrayBuffer()
    } catch { ready = false }
    if (!ready) await new Promise((resolve) => setTimeout(resolve, 150))
  }
  await mkdir('/opt/cursor/artifacts', { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  for (const width of widths) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
    for (const [name, path] of pages) {
      await page.goto(`${base}${path}`, { waitUntil: 'load' })
      await page.getByRole('heading', { level: 1 }).first().waitFor()
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      if (overflow > 1) {
        const culprit = await page.evaluate(() => {
          const nodes = [...document.body.querySelectorAll('*')]
          const wide = nodes
            .map((node) => ({ tag: node.className?.toString?.().slice(0, 80) || node.tagName, width: node.scrollWidth, client: node.clientWidth }))
            .filter((item) => item.width > document.documentElement.clientWidth + 1)
            .sort((a, b) => b.width - a.width)
            .slice(0, 8)
          return wide
        })
        throw new Error(`${name} at ${width} overflows by ${overflow}px ${JSON.stringify(culprit)}`)
      }
      await page.screenshot({ path: `/opt/cursor/artifacts/lead-routing-${name}-${width}.png`, fullPage: true })
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(`${base}/dev/lead-routing/queue`, { waitUntil: 'load' })
  await page.getByRole('button', { name: 'Unassigned' }).click()
  await page.getByRole('button', { name: 'Quinn Harper' }).waitFor()
  await page.goto(`${base}/dev/lead-routing/review`, { waitUntil: 'load' })
  await page.getByRole('button', { name: 'Send Notification' }).click()
  await page.getByText('Notification recorded for Northwind Exteriors.').waitFor()
  await page.screenshot({ path: '/opt/cursor/artifacts/lead-routing-review-sent-1440.png', fullPage: true })
  await page.goto(`${base}/dev/lead-routing/territories`, { waitUntil: 'load' })
  await page.getByRole('button', { name: 'Save territory' }).click()
  await page.getByText('Saved synthetic territory 46204.').waitFor()
  await browser.close()
} finally {
  server.kill('SIGTERM')
}
