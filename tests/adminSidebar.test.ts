import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { adminAccountInitial, adminDisplayName, adminRoleLabel } from '../src/components/adminAccount.ts'

const layout = readFileSync('src/components/AdminLayout.tsx', 'utf8')
const css = readFileSync('src/App.css', 'utf8')
const portal = readFileSync('src/components/PortalLayout.tsx', 'utf8')
const billing = readFileSync('src/components/BillingClientLayout.tsx', 'utf8')

test('admin account label uses a stored name when present and otherwise the email', () => {
  assert.equal(adminDisplayName(undefined), '')
  assert.equal(adminDisplayName({ full_name: '  ' }), '')
  assert.equal(adminDisplayName({ full_name: 12, name: ' Pat Lee ' }), 'Pat Lee')
  assert.equal(adminDisplayName({ display_name: 'Riley Chen' }), 'Riley Chen')
  assert.equal(adminDisplayName({ full_name: 'Amina Shah', name: 'Other' }), 'Amina Shah')
  assert.equal(adminAccountInitial('preview.admin@example.test'), 'P')
  assert.equal(adminAccountInitial(''), '')
})

test('admin role label follows the authenticated billing flags', () => {
  assert.equal(adminRoleLabel(false, false), 'Home Guard admin')
  assert.equal(adminRoleLabel(true, false), 'Access manager')
  assert.equal(adminRoleLabel(false, true), 'Billing admin')
  assert.equal(adminRoleLabel(true, true), 'Access manager · Billing admin')
})

test('admin navigation keeps the existing destinations and permission gates', () => {
  for (const item of ['Dashboard', 'Dealers', 'All Leads', 'Inventory', 'Settings', 'AI Usage', 'Billing Access']) {
    assert.match(layout, new RegExp(item))
  }
  assert.match(layout, /<span>AI Usage &amp; Billing<\/span>/)
  assert.match(layout, /!item\.internalOnly \|\| isInternalBillingAdmin/)
  assert.match(layout, /!item\.accessManagerOnly \|\| isBillingAccessManager/)
  assert.match(layout, /isInternalBillingAdmin && <NavLink[^\n]+to="\/admin\/billing"/)
  assert.match(layout, /\(isBillingAccessManager \|\| isInternalBillingAdmin\) && <NavLink[^\n]+to="\/admin\/billing\/access"/)
  assert.match(layout, /canManageDealerCredentials=\{isBillingAccessManager\}/)
  assert.match(layout, /canManageDealerUsers=\{isBillingAccessManager \|\| isInternalBillingAdmin\}/)
  assert.match(layout, /canManageAdministrators=\{isBillingAccessManager\}/)
  assert.match(layout, /path="\/admin\/ai-usage"/)
  assert.match(layout, /Sign Out/)
  assert.doesNotMatch(layout, /label: 'Marketing Banners'/)
  assert.match(layout, /path="\/admin\/marketing-banners"/)
})

test('admin drawer locks scroll, traps focus, and closes from Escape or the backdrop', () => {
  assert.match(layout, /aria-expanded=\{isMenuOpen\}/)
  assert.match(layout, /aria-controls="admin-sidebar"/)
  assert.match(layout, /aria-label="Open navigation"/)
  assert.match(layout, /aria-label="Close navigation"/)
  assert.match(layout, /aria-modal=\{drawerOpen \? true : undefined\}/)
  assert.match(layout, /role=\{drawerOpen \? 'dialog' : undefined\}/)
  assert.match(layout, /event\.key === 'Escape'/)
  assert.match(layout, /document\.body\.classList\.add\('admin-drawer-open'\)/)
  assert.match(layout, /const restoreFocus = menuButtonRef\.current/)
  assert.match(layout, /restoreFocus\?\.focus\(\)/)
  assert.match(layout, /closeButtonRef\.current\?\.focus\(\)/)
  assert.match(layout, /max-width: 960px/)
})

test('admin sidebar is a compact neutral rail and does not restyle the other shells', () => {
  assert.match(css, /\.admin-sidebar \{[\s\S]*width: 252px/)
  assert.match(css, /\.admin-sidebar \{[\s\S]*position: fixed; top: 0;[\s\S]*height: 100dvh/)
  assert.match(css, /\.admin-nav \{[\s\S]*overflow-y: auto/)
  assert.match(css, /\.admin-account \{ flex: 0 0 auto; margin-top: auto/)
  assert.match(css, /\.portal-shell--admin \.portal-main \{ margin-left: 252px; \}/)
  assert.match(css, /@media \(max-width: 960px\)/)
  assert.match(css, /\.admin-nav__link:focus-visible/)
  assert.match(css, /body\.admin-drawer-open \{ overflow: hidden/)
  assert.match(css, /\.sidebar \{\s*position: fixed;[^}]*width: 276px/)
  assert.match(portal, /className=\{`sidebar \$\{isMenuOpen \? 'is-open' : ''\}`\}/)
  assert.doesNotMatch(portal, /admin-sidebar/)
  assert.match(billing, /sidebar sidebar--admin/)
  assert.doesNotMatch(billing, /admin-sidebar/)
})
