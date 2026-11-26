import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  dealerDetailSections,
  dealerDetailStickyOffset,
  dealerSectionFromLegacyHash,
  dealerSectionFromPathname,
  dealerSectionHref,
  isScrollerAtEnd,
  resolveActiveSectionId,
  sectionScrollTop,
  visibleDealerDetailSections,
} from '../src/components/dealerDetailSections.ts'
import { explainPreviewConfiguration, isVercelPreviewHost } from '../src/utils/previewConfiguration.ts'

const page = readFileSync('src/pages/DealerDetailPage.tsx', 'utf8')
const nav = readFileSync('src/components/DealerDetailSectionNav.tsx', 'utf8')
const styles = readFileSync('src/App.css', 'utf8')
const marketing = readFileSync('src/components/AdminDealerMarketingTools.tsx', 'utf8')
const crm = readFileSync('src/components/DealerCrmIntegrations.tsx', 'utf8')

test('dealer detail nav targets match the section routes', () => {
  const ids = dealerDetailSections.map((section) => section.id)
  assert.deepEqual(ids, ['setup', 'company-details', 'branding-studio', 'door-builder-lead-webhook', 'marketing-tools', 'crm-integrations', 'website-address', 'dealer-users'])
  assert.deepEqual(dealerDetailSections.map((section) => section.path), ['', 'company', 'branding', 'leads', 'marketing', 'crm', 'visualizer', 'access'])
  assert.equal(new Set(ids).size, ids.length)

  assert.match(page, /id="company-details"/)
  assert.match(page, /id="branding-studio"/)
  assert.doesNotMatch(page, /id="design"/)
  assert.match(page, /sectionId="dealer-users"/)
  assert.match(marketing, /id="marketing-tools"/)
  assert.match(crm, /id="crm-integrations"/)
  assert.match(page, /DealerDetailSectionNav/)
  assert.match(nav, /visibleDealerDetailSections/)
  assert.match(nav, /dealerSectionHref\(dealerId, section\.path\)/)
  assert.match(nav, /<NavLink/)

  for (const id of ids) {
    assert.match(styles, new RegExp(`#${id}`))
    assert.match(styles, /scroll-margin-top:\s*var\(--dealer-section-scroll-offset\)/)
  }
})

test('dealer detail nav exposes the active section', () => {
  assert.match(nav, /end=\{section\.path === ''\}/)
  assert.match(styles, /a\[aria-current='true'\]/)
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/)
})

test('visible dealer detail sections follow the same access flags as the page', () => {
  assert.deepEqual(
    visibleDealerDetailSections({ canManageDealerCredentials: false, canManageDealerUsers: false }).map((section) => section.id),
    ['setup', 'company-details', 'branding-studio', 'door-builder-lead-webhook', 'website-address'],
  )
  assert.deepEqual(
    visibleDealerDetailSections({ canManageDealerCredentials: true, canManageDealerUsers: false }).map((section) => section.id),
    ['setup', 'company-details', 'branding-studio', 'door-builder-lead-webhook', 'marketing-tools', 'crm-integrations', 'website-address'],
  )
  assert.deepEqual(
    visibleDealerDetailSections({ canManageDealerCredentials: false, canManageDealerUsers: true }).map((section) => section.id),
    ['setup', 'company-details', 'branding-studio', 'door-builder-lead-webhook', 'website-address', 'dealer-users'],
  )
})

test('old dealer hashes open the matching tab', () => {
  const id = 'dealer-1'
  assert.equal(dealerSectionFromLegacyHash('#dealer-users'), 'access')
  assert.equal(dealerSectionFromLegacyHash('#add-dealer-user'), 'access')
  assert.equal(dealerSectionFromLegacyHash('#marketing-tools'), 'marketing')
  assert.equal(dealerSectionFromLegacyHash('#setup'), '')
  assert.equal(dealerSectionFromLegacyHash('#company-name'), null)
  assert.equal(dealerSectionHref(id, dealerSectionFromLegacyHash('#dealer-users') ?? ''), `/admin/dealers/${id}/access`)
  assert.equal(dealerSectionHref(id, dealerSectionFromLegacyHash('#marketing-tools') ?? ''), `/admin/dealers/${id}/marketing`)
  assert.match(page, /dealerSectionFromLegacyHash/)
  assert.doesNotMatch(readFileSync('src/pages/EditDealerPage.tsx', 'utf8'), /#dealer-users|#branding/)
  assert.doesNotMatch(readFileSync('src/pages/AdminMarketingBannersPage.tsx', 'utf8'), /#marketing-tools/)
})

test('dealer section routes round-trip and ignore unknown paths', () => {
  const id = 'dealer-1'
  assert.equal(dealerSectionHref(id, ''), `/admin/dealers/${id}`)
  assert.equal(dealerSectionHref(id, 'marketing'), `/admin/dealers/${id}/marketing`)
  for (const path of ['', 'company', 'company/edit', 'branding', 'leads', 'marketing', 'crm', 'visualizer', 'access']) {
    assert.equal(dealerSectionFromPathname(dealerSectionHref(id, path), id), path)
  }
  assert.equal(dealerSectionFromPathname(`/admin/dealers/${id}/unknown`, id), null)
  assert.equal(isVercelPreviewHost('home-guard-dealer-portal-git-cursor-dealer-281511-door-builder.vercel.app'), true)
  assert.equal(isVercelPreviewHost('home-guard-dealer-portal.vercel.app'), false)
  assert.equal(explainPreviewConfiguration('Dealer marketing management is not configured.', 'app-git-feature-team.vercel.app'), 'This preview does not include the production server configuration for this feature. The service role and encryption keys are only set for production, so nothing was saved or sent.')
  assert.equal(explainPreviewConfiguration('Dealer marketing management is not configured.', 'home-guard-dealer-portal.vercel.app'), 'Dealer marketing management is not configured.')
})

test('section scroll offset clears the sticky header and nav', () => {
  assert.equal(dealerDetailStickyOffset(0, 52), 64)
  assert.equal(dealerDetailStickyOffset(66, 52), 130)
  assert.equal(sectionScrollTop(240, 800, 130), 910)
  assert.equal(sectionScrollTop(20, 40, 130), 0)
  assert.equal(isScrollerAtEnd(400, 800, 1200), true)
  assert.equal(isScrollerAtEnd(100, 800, 1200), false)
})

test('scroll spy keeps the section that has reached the sticky line', () => {
  const sections = [
    { id: 'company-details', top: -420 },
    { id: 'branding', top: 48 },
    { id: 'design', top: 640 },
  ]
  assert.equal(resolveActiveSectionId(sections, 80, { atPageEnd: false, scrollTop: 500 }), 'branding')
  assert.equal(
    resolveActiveSectionId(
      [{ id: 'company-details', top: 180 }, { id: 'branding', top: 720 }],
      80,
      { atPageEnd: false, scrollTop: 0 },
    ),
    'company-details',
  )
  assert.equal(resolveActiveSectionId(sections, 80, { atPageEnd: true, scrollTop: 900 }), 'design')
  assert.equal(resolveActiveSectionId(sections, 80, { atPageEnd: true, scrollTop: 0 }), 'branding')
  assert.equal(resolveActiveSectionId([], 80, { atPageEnd: true, scrollTop: 20 }), null)
})
