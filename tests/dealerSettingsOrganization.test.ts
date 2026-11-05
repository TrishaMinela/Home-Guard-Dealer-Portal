import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const dealerForm = readFileSync('src/components/DealerForm.tsx', 'utf8')
const editPage = readFileSync('src/pages/EditDealerPage.tsx', 'utf8')
const detailPage = readFileSync('src/pages/DealerDetailPage.tsx', 'utf8')
const sectionHeader = readFileSync('src/components/DealerSectionHeader.tsx', 'utf8')
const logoPlacement = readFileSync('src/components/DealerLogoPlacementSettings.tsx', 'utf8')
const styles = readFileSync('src/App.css', 'utf8')

test('admin dealer settings separate company, branding, design, and access', () => {
  assert.match(editPage, /Company Details/)
  assert.match(editPage, /Branding/)
  assert.match(editPage, /Typography &amp; Design/)
  assert.match(editPage, /Dealer Users \/ Access/)
  assert.match(detailPage, /id="company-details"/)
  assert.match(detailPage, /id="branding"/)
  assert.match(detailPage, /id="design"/)
  assert.match(detailPage, /sectionId="dealer-users"/)
  assert.doesNotMatch(detailPage, />\s*Edit Dealer\s*</)
  assert.match(detailPage, /actionLabel="Edit"/)
  assert.match(detailPage, /actionLabel="Edit colors"/)
  assert.match(detailPage, /actionLabel="Edit design"/)
  assert.match(detailPage, /dealer-detail-groups/)
})

test('company details do not render or write branding controls', () => {
  assert.doesNotMatch(dealerForm, /Primary Brand Color|Secondary Brand Color/)
  const updateStart = editPage.indexOf('.update({')
  const companyUpdate = editPage.slice(updateStart, editPage.indexOf('})', updateStart))
  assert.doesNotMatch(companyUpdate, /primary_color|secondary_color|logo_url|font_/)
})

test('branding and typography use section-specific saves', () => {
  assert.match(editPage, /Save Branding/)
  assert.match(editPage, /Save Company Details/)
  assert.match(editPage, /DealerTypographySettings/)
  assert.match(editPage, /window\.location\.hash === '#branding'/)
  assert.match(editPage, /window\.location\.hash === '#design'/)
})

test('dealer detail actions are accessible and logo placement preview has breathing room', () => {
  assert.match(sectionHeader, /aria-label=/)
  assert.match(sectionHeader, /SectionActionIcon/)
  assert.match(styles, /dealer-section-action:focus-visible/)
  assert.match(styles, /logo-placement-preview\{[^}]*min-height:112px/)
  assert.match(logoPlacement, /logo-placement-preview--\$\{placement\}/)
  assert.match(detailPage, /Portal colors remain HGI branded/)
})
