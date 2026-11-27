import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { spawn, type ChildProcess } from 'node:child_process'
import test from 'node:test'
import playwright, { type Browser, type Page, type Route } from 'playwright-core'

const port = 5216
const origin = `http://127.0.0.1:${port}`
const supabaseOrigin = 'https://example.supabase.co'
const artifacts = '/opt/cursor/artifacts/dealer-invite-ready'
const dealerId = '22222222-2222-4222-8222-222222222222'
const otherDealerId = '33333333-3333-4333-8333-333333333333'
const userId = '11111111-1111-4111-8111-111111111111'
const otherLeadId = '44444444-4444-4444-8444-444444444444'
const email = 'alex.sample@northwind.example'
const password = 'Northwind-demo-1'
let server: ChildProcess | undefined
let browser: Browser | undefined

const dealer = {
  id: dealerId,
  company_name: 'Northwind Doors',
  slug: 'northwind-doors',
  logo_url: '/appearance-preview/hgi-logo-black.webp',
  logo_light_url: null,
  logo_generated_light_url: null,
  logo_generated_light_usable: true,
  logo_placement: 'header',
  logo_display: 'single',
  primary_contact_name: 'Alex Sample',
  email: 'office@northwind.example',
  phone: '555-0100',
  website: 'https://northwind.example',
  address: '10 Example Street',
  city: 'Sample City',
  state: 'WA',
  zip: '98101',
  primary_color: '#0d666c',
  secondary_color: '#05040b',
  is_active: true,
  created_at: '2026-01-01T00:00:00.000Z',
  requested_slug: null,
  slug_request_status: null,
  slug_requested_at: null,
  heading_font_family: null,
  heading_font_weight: null,
  heading_font_size: null,
  body_font_family: null,
  body_font_weight: null,
  body_font_size: null,
  custom_heading_font_url: null,
  custom_heading_font_name: null,
  custom_heading_font_weight: null,
  custom_body_font_url: null,
  custom_body_font_name: null,
  custom_body_font_weight: null,
}

const leads = [
  {
    id: '55555555-5555-4555-8555-555555555555',
    submission_id: 'sample-1',
    dealer_id: dealerId,
    first_name: 'Alex',
    last_name: 'Sample',
    email: 'alex.sample@northwind.example',
    phone: '555-0101',
    address: '10 Example Street',
    city: 'Sample City',
    state: 'WA',
    zip: '98101',
    preferred_contact_method: 'email',
    project_timeline: 'this month',
    comments: 'Example inquiry',
    status: 'new',
    source: 'door-builder',
    visualizer_url: 'https://example.test/northwind-doors',
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    utm_content: null,
    door_configuration: null,
    created_at: '2026-11-01T15:00:00.000Z',
    updated_at: '2026-11-01T15:00:00.000Z',
  },
]

function userRecord() {
  return {
    id: userId,
    aud: 'authenticated',
    role: 'authenticated',
    email,
    email_confirmed_at: '2026-01-02T00:00:00.000Z',
    app_metadata: { provider: 'email' },
    user_metadata: { full_name: 'Alex Sample' },
    created_at: '2026-01-01T00:00:00.000Z',
  }
}

async function startServer() {
  server = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    env: { ...process.env, VITE_SUPABASE_URL: supabaseOrigin, VITE_SUPABASE_PUBLISHABLE_KEY: 'public-test-key' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })
  let log = ''
  server.stdout?.on('data', (chunk) => { log += chunk })
  server.stderr?.on('data', (chunk) => { log += chunk })
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${origin}/`)).ok) return
    } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(log || 'Portal dev server did not start')
}

test.before(async () => {
  mkdirSync(artifacts, { recursive: true })
  await startServer()
  browser = await playwright.chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] })
})

test.after(async () => {
  await browser?.close()
  if (server?.pid) {
    try { process.kill(-server.pid, 'SIGTERM') } catch { server.kill('SIGTERM') }
  }
})

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${artifacts}/${name}.png`, fullPage: true })
}

function fulfill(route: Route, status: number, body: unknown) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

async function installSupabase(page: Page, role: 'dealer_admin' | 'member', options: { active?: boolean } = {}) {
  let currentPassword = password
  const activeDealer = { ...dealer, is_active: options.active !== false }
  const seen: string[] = []
  await page.route(`${supabaseOrigin}/**`, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    seen.push(`${request.method()} ${url.pathname}${url.search}`)
    if (request.method() === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*',
          'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
        },
      })
    }
    if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
      const body = JSON.parse(request.postData() || '{}') as { email?: string; password?: string }
      if (body.email !== email || body.password !== currentPassword) {
        return fulfill(route, 400, { code: 'invalid_credentials', error_code: 'invalid_credentials', message: 'Invalid login credentials' })
      }
      return fulfill(route, 200, {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: userRecord(),
      })
    }
    if (url.pathname === '/auth/v1/user' && request.method() === 'GET') return fulfill(route, 200, userRecord())
    if (url.pathname === '/auth/v1/user' && request.method() === 'PUT') {
      const body = JSON.parse(request.postData() || '{}') as { password?: string }
      if (body.password) currentPassword = body.password
      return fulfill(route, 200, { user: userRecord() })
    }
    if (url.pathname.startsWith('/auth/v1/logout')) return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' }, body: '' })
    if (url.pathname === '/auth/v1/recover') return fulfill(route, 200, {})
    if (url.pathname.startsWith('/rest/v1/home_guard_admins')) return fulfill(route, 200, [])
    if (url.pathname.startsWith('/rest/v1/billing_')) return fulfill(route, 200, [])
    if (url.pathname.startsWith('/rest/v1/rpc/')) return fulfill(route, 200, [])
    if (url.pathname.startsWith('/rest/v1/dealer_users')) {
      return fulfill(route, 200, [{ dealer_id: dealerId, role }])
    }
    if (url.pathname.startsWith('/rest/v1/dealers')) {
      const wantsObject = (request.headers().accept || '').includes('application/vnd.pgrst.object+json')
      return fulfill(route, 200, wantsObject ? activeDealer : [activeDealer])
    }
    if (url.pathname.startsWith('/rest/v1/leads')) {
      const requested = url.searchParams.get('dealer_id')?.replace(/^eq\./, '')
      return fulfill(route, 200, requested === dealerId ? leads : [])
    }
    if (url.pathname.startsWith('/rest/v1/')) return fulfill(route, 200, [])
    return fulfill(route, 404, { message: 'not mocked' })
  })
  return {
    seen,
    password: () => currentPassword,
  }
}

async function signIn(page: Page) {
  await page.goto(`${origin}/`, { waitUntil: 'networkidle' })
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await page.getByRole('heading', { name: 'Welcome, Northwind Doors' }).waitFor()
}

test('sign-in shows and hides the password, and a wrong password stays on the page', async () => {
  const page = await browser!.newPage({ viewport: { width: 1280, height: 900 } })
  await installSupabase(page, 'dealer_admin')
  await page.goto(`${origin}/`, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'Welcome back' }).waitFor()
  await page.getByText('Home Guard Industries').waitFor()
  const input = page.getByLabel('Password', { exact: true })
  await input.fill(password)
  assert.equal(await input.getAttribute('type'), 'password')
  await page.getByRole('button', { name: 'Show password' }).click()
  assert.equal(await input.getAttribute('type'), 'text')
  await page.getByRole('button', { name: 'Hide password' }).click()
  assert.equal(await input.getAttribute('type'), 'password')
  await shot(page, 'login-desktop')
  await page.setViewportSize({ width: 375, height: 812 })
  await shot(page, 'login-mobile')
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill('wrong-password-1')
  await page.getByRole('button', { name: 'Sign In' }).click()
  await page.getByText('The email or password is incorrect.').waitFor()
  await page.close()
})

test('forgot-password confirms without revealing whether the account exists', async () => {
  const page = await browser!.newPage({ viewport: { width: 1280, height: 900 } })
  await installSupabase(page, 'dealer_admin')
  await page.goto(`${origin}/auth/forgot-password`, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'Forgot your password?' }).waitFor()
  await page.getByText('Home Guard Industries').waitFor()
  await shot(page, 'forgot-password-desktop')
  await page.setViewportSize({ width: 375, height: 812 })
  await shot(page, 'forgot-password-mobile')
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.getByLabel('Email address').fill(email)
  await page.getByRole('button', { name: 'Send reset link' }).click()
  await page.getByText('If an account exists for that email, a password reset link has been sent.').waitFor()
  await page.close()
})

test('an expired reset link offers a new one, and a valid link opens the dealer dashboard', async () => {
  const expired = await browser!.newPage({ viewport: { width: 1280, height: 900 } })
  await expired.goto(`${origin}/auth/reset-password?error=access_denied&error_code=otp_expired`, { waitUntil: 'networkidle' })
  await expired.getByRole('heading', { name: 'This password reset link is no longer valid.' }).waitFor()
  await expired.getByRole('link', { name: 'Request a new reset link' }).waitFor()
  await shot(expired, 'reset-invalid-desktop')
  await expired.setViewportSize({ width: 375, height: 812 })
  await shot(expired, 'reset-invalid-mobile')
  await expired.close()

  const page = await browser!.newPage({ viewport: { width: 1280, height: 900 } })
  await installSupabase(page, 'dealer_admin')
  await page.goto(`${origin}/auth/reset-password#access_token=test-access-token&refresh_token=test-refresh-token&expires_in=3600&token_type=bearer&type=recovery`, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'Create a new password' }).waitFor()
  await shot(page, 'reset-password-desktop')
  await page.setViewportSize({ width: 375, height: 812 })
  await shot(page, 'reset-password-mobile')
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.getByLabel('New password').fill('short1')
  await page.getByLabel('Confirm password').fill('short1')
  await page.getByRole('button', { name: 'Update Password' }).click()
  await page.getByRole('alert').getByText('Use at least 10 characters, including a letter and a number.').waitFor()
  await page.getByLabel('New password').fill('Northwind-demo-2')
  await page.getByLabel('Confirm password').fill('Northwind-demo-9')
  await page.getByRole('button', { name: 'Update Password' }).click()
  await page.getByText('Passwords do not match.').waitFor()
  await page.getByLabel('Confirm password').fill('Northwind-demo-2')
  await page.getByRole('button', { name: 'Show password' }).first().click()
  assert.equal(await page.getByLabel('New password').getAttribute('type'), 'text')
  await page.getByRole('button', { name: 'Update Password' }).click()
  await page.getByRole('heading', { name: 'Password updated' }).waitFor()
  await page.getByRole('button', { name: 'Continue to Portal' }).click()
  await page.getByRole('heading', { name: 'Welcome, Northwind Doors' }).waitFor()
  assert.equal(new URL(page.url()).pathname, '/dashboard')
  await page.close()
})

test('an invitation welcomes the dealer, and an expired invitation can request another link', async () => {
  const expired = await browser!.newPage({ viewport: { width: 375, height: 812 } })
  await expired.goto(`${origin}/auth/invite?error=access_denied&error_code=otp_expired`, { waitUntil: 'networkidle' })
  await expired.getByRole('heading', { name: 'This invitation is no longer valid.' }).waitFor()
  await expired.getByRole('link', { name: 'Request a new link' }).waitFor()
  await shot(expired, 'invite-invalid-mobile')
  await expired.setViewportSize({ width: 1280, height: 900 })
  await shot(expired, 'invite-invalid-desktop')
  await expired.close()

  const page = await browser!.newPage({ viewport: { width: 1280, height: 900 } })
  await installSupabase(page, 'dealer_admin')
  await page.goto(`${origin}/auth/invite#access_token=test-access-token&refresh_token=test-refresh-token&expires_in=3600&token_type=bearer&type=invite`, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'Welcome to Home Guard Industries' }).waitFor()
  await page.getByText('your own dashboard').waitFor()
  await shot(page, 'invite-welcome-desktop')
  await page.setViewportSize({ width: 375, height: 812 })
  await shot(page, 'invite-welcome-mobile')
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel('New password').fill('Northwind-demo-2')
  await page.getByLabel('Confirm password').fill('Northwind-demo-2')
  await page.getByRole('button', { name: 'Complete Account Setup' }).click()
  await page.getByRole('heading', { name: 'Your account is ready' }).waitFor()
  await page.getByRole('button', { name: 'Go to Dealer Portal' }).click()
  await page.getByRole('heading', { name: 'Welcome, Northwind Doors' }).waitFor()
  await page.goto(`${origin}/auth/invite`, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'Your Portal account is already configured' }).waitFor()
  await shot(page, 'invite-existing-desktop')
  await page.close()
})

test('a dealer admin can change a password, review only their own pages, and sign out', async () => {
  const page = await browser!.newPage({ viewport: { width: 1280, height: 900 } })
  const mock = await installSupabase(page, 'dealer_admin')
  await signIn(page)
  await shot(page, 'dashboard-desktop')
  await page.setViewportSize({ width: 375, height: 812 })
  await shot(page, 'dashboard-mobile')
  await page.setViewportSize({ width: 1280, height: 900 })
  assert.equal(await page.getByText('Other Dealership').count(), 0)

  await page.getByRole('link', { name: 'Leads' }).click()
  await page.getByRole('heading', { name: 'Leads' }).waitFor()
  await page.getByText('Alex Sample').waitFor()
  await shot(page, 'leads-desktop')
  await page.goto(`${origin}/leads/${otherLeadId}`, { waitUntil: 'networkidle' })
  await page.getByText('This lead could not be found, or you do not have access to it.').waitFor()
  assert.equal(await page.getByText('Blair Example').count(), 0)
  await shot(page, 'leads-foreign-desktop')
  const leadRequests = mock.seen.filter((entry) => entry.includes('/rest/v1/leads'))
  assert.ok(leadRequests.every((entry) => entry.includes(`dealer_id=eq.${dealerId}`)))
  assert.ok(leadRequests.every((entry) => !entry.includes(otherDealerId)))

  await page.goto(`${origin}/admin/dealers/${otherDealerId}`, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'Welcome, Northwind Doors' }).waitFor()
  assert.equal(new URL(page.url()).pathname, '/dashboard')

  await page.getByRole('link', { name: 'Marketing Tools' }).click()
  await page.getByRole('heading', { name: 'Marketing Tools' }).waitFor()
  for (const headline of ['Build a Door Made for Your Home', 'Your Home. Your Style. Your Door.', 'A New Look Starts at Your Door', 'See Your Vision Come to Life']) {
    await page.getByRole('heading', { name: headline }).first().waitFor()
  }
  await page.waitForFunction(() => !document.body.textContent?.includes('Rendering preview'))
  await page.getByRole('tab', { name: 'Square' }).click()
  assert.equal(await page.getByRole('heading', { name: 'Build a Door Made for Your Home' }).count(), 1)
  await page.waitForFunction(() => !document.body.textContent?.includes('Rendering preview'))
  await shot(page, 'marketing-square-desktop')
  await page.getByRole('tab', { name: 'Landscape' }).click()
  await page.waitForFunction(() => !document.body.textContent?.includes('Rendering preview'))
  await shot(page, 'marketing-landscape-desktop')
  await page.setViewportSize({ width: 375, height: 812 })
  await shot(page, 'marketing-mobile')
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.getByRole('button', { name: 'Preview Build a Door Made for Your Home' }).click()
  await page.getByRole('dialog').waitFor()
  await page.getByText('Rendering preview…').waitFor({ state: 'hidden' })
  await shot(page, 'banner-preview-desktop')
  const download = page.waitForEvent('download')
  await page.getByRole('dialog').getByRole('button', { name: 'Download', exact: true }).click()
  const file = await download
  assert.match(file.suggestedFilename(), /\.png$/)
  await page.keyboard.press('Escape')

  await page.getByRole('link', { name: 'Company Profile' }).click()
  await page.getByRole('heading', { name: 'Company Profile' }).waitFor()
  assert.equal(await page.getByLabel('Company Name *').inputValue(), 'Northwind Doors')
  await shot(page, 'company-desktop')
  await page.getByRole('link', { name: 'Customize Door Builder' }).click()
  await page.getByRole('heading', { name: 'Branding Studio', level: 1 }).waitFor()
  await page.getByText('Northwind Doors').first().waitFor()
  await shot(page, 'branding-desktop')
  await page.setViewportSize({ width: 375, height: 812 })
  await shot(page, 'branding-mobile')
  await page.setViewportSize({ width: 1280, height: 900 })

  await page.getByRole('link', { name: 'Settings' }).click()
  await page.getByRole('heading', { name: 'Password' }).waitFor()
  await shot(page, 'settings-desktop')
  await page.setViewportSize({ width: 375, height: 812 })
  await shot(page, 'settings-mobile')
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.getByLabel('Current password').fill('wrong-password-1')
  await page.getByLabel('New password', { exact: true }).fill('Northwind-demo-3')
  await page.getByLabel('Confirm new password').fill('Northwind-demo-3')
  await page.getByRole('button', { name: 'Change password' }).click()
  await page.getByText('The current password is incorrect.').waitFor()
  await page.getByLabel('Current password').fill(password)
  await page.getByLabel('New password', { exact: true }).fill('Northwind-demo-3')
  await page.getByLabel('Confirm new password').fill('Northwind-demo-3')
  await page.getByRole('button', { name: 'Show password' }).nth(1).click()
  await page.getByRole('button', { name: 'Change password' }).click()
  await page.getByText('Your password has been changed.').waitFor()
  assert.equal(mock.password(), 'Northwind-demo-3')
  await page.getByRole('button', { name: 'Email me a reset link' }).click()
  await page.getByText('A password reset link has been sent to your email.').waitFor()

  await page.getByRole('button', { name: 'Sign Out' }).click()
  await page.getByRole('heading', { name: 'Welcome back' }).waitFor()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await page.getByText('The email or password is incorrect.').waitFor()
  await page.getByLabel('Password', { exact: true }).fill('Northwind-demo-3')
  await page.getByRole('button', { name: 'Sign In' }).click()
  await page.getByRole('button', { name: 'Sign Out' }).waitFor()
  await page.getByRole('link', { name: 'Dashboard' }).click()
  await page.getByRole('heading', { name: 'Welcome, Northwind Doors' }).waitFor()

  const api = await page.evaluate(async (foreignId) => {
    const response = await fetch('/api/dealer-light-logo', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-access-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ dealerId: foreignId, tone: 'white', target: 'primary' }),
    })
    const text = await response.text()
    return { status: response.status, text: text.slice(0, 180) }
  }, otherDealerId)
  assert.doesNotMatch(api.text, /Northwind|generatedLogoUrl|company_name/)
  await page.close()
})

test('a dealer member can review the dealership but cannot save company or branding changes', async () => {
  const page = await browser!.newPage({ viewport: { width: 1280, height: 900 } })
  await installSupabase(page, 'member')
  await signIn(page)
  await page.getByRole('link', { name: 'Company Profile' }).click()
  await page.getByText('Company details and the Visualizer URL can be changed by a dealer admin.').waitFor()
  assert.equal(await page.getByLabel('Company Name *').isDisabled(), true)
  assert.equal(await page.getByRole('button', { name: 'Save Company Details' }).isDisabled(), true)
  await page.getByText('Visualizer URL changes are available to dealer admins.').waitFor()
  await shot(page, 'company-member-desktop')
  await page.getByRole('link', { name: 'Customize Door Builder' }).click()
  await page.getByRole('button', { name: 'Colors', exact: true }).click()
  await page.getByText('Appearance settings are available to dealer admins.').waitFor()
  await page.getByText('Logo, color, and placement changes are available to dealer admins.').waitFor()
  assert.equal(await page.getByRole('button', { name: 'Save Changes' }).first().isDisabled(), true)
  await shot(page, 'branding-member-desktop')
  await page.close()
})

test('the invitation form defaults to Dealer Member and the user list shows each role', async () => {
  const page = await browser!.newPage({ viewport: { width: 1280, height: 1000 } })
  await page.goto(`${origin}/#dealer-access-harness`, { waitUntil: 'networkidle' })
  const role = page.getByLabel('Role')
  await role.waitFor()
  assert.equal(await role.inputValue(), 'dealer_member')
  await page.getByRole('cell', { name: 'Dealer Admin' }).waitFor()
  await page.getByRole('cell', { name: 'Dealer Member' }).waitFor()
  await shot(page, 'invite-role-desktop')
  await page.getByLabel('Email Address').fill('new.member@northwind.example')
  await page.getByRole('button', { name: 'Add User' }).click()
  await page.locator('tr', { hasText: 'new.member@northwind.example' }).getByText('Dealer Member').waitFor()
  await role.selectOption('dealer_admin')
  await page.getByLabel('Email Address').fill('new.admin@northwind.example')
  await page.getByRole('button', { name: 'Add User' }).click()
  await page.locator('tr', { hasText: 'new.admin@northwind.example' }).getByText('Dealer Admin').waitFor()
  await shot(page, 'user-roles-desktop')
  await page.close()
})

test('a disabled dealership sees the unavailable page and an active dealership gets back in', async () => {
  const blocked = await browser!.newPage({ viewport: { width: 1280, height: 900 } })
  await installSupabase(blocked, 'dealer_admin', { active: false })
  await blocked.goto(`${origin}/`, { waitUntil: 'networkidle' })
  await blocked.getByLabel('Email').fill(email)
  await blocked.getByLabel('Password', { exact: true }).fill(password)
  await blocked.getByRole('button', { name: 'Sign In' }).click()
  await blocked.getByRole('heading', { name: 'Portal access unavailable' }).waitFor()
  await blocked.getByText("Your dealership's Portal access is currently unavailable. Please contact Home Guard Industries.").waitFor()
  assert.equal(await blocked.getByRole('link', { name: 'Dashboard' }).count(), 0)
  await shot(blocked, 'disabled-dealer-desktop')
  await blocked.setViewportSize({ width: 375, height: 812 })
  await shot(blocked, 'disabled-dealer-mobile')
  await blocked.getByRole('button', { name: 'Sign Out' }).click()
  await blocked.getByRole('heading', { name: 'Welcome back' }).waitFor()
  await blocked.close()

  const restored = await browser!.newPage({ viewport: { width: 1280, height: 900 } })
  await installSupabase(restored, 'dealer_admin', { active: true })
  await signIn(restored)
  await restored.close()
})
