import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  dealerDetailSections,
  dealerDetailStickyOffset,
  isScrollerAtEnd,
  resolveActiveSectionId,
  sectionScrollTop,
  visibleDealerDetailSections,
} from '../src/components/dealerDetailSections.ts'

const page = readFileSync('src/pages/DealerDetailPage.tsx', 'utf8')
const nav = readFileSync('src/components/DealerDetailSectionNav.tsx', 'utf8')
const styles = readFileSync('src/App.css', 'utf8')
const marketing = readFileSync('src/components/AdminDealerMarketingTools.tsx', 'utf8')
const crm = readFileSync('src/components/DealerCrmIntegrations.tsx', 'utf8')

test('dealer detail nav targets match the section ids they scroll to', () => {
  const ids = dealerDetailSections.map((section) => section.id)
  assert.deepEqual(ids, ['company-details', 'branding', 'design', 'marketing-tools', 'crm-integrations', 'dealer-users'])
  assert.equal(new Set(ids).size, ids.length)

  assert.match(page, /id="company-details"/)
  assert.match(page, /id="branding"/)
  assert.match(page, /id="design"/)
  assert.match(page, /sectionId="dealer-users"/)
  assert.match(marketing, /id="marketing-tools"/)
  assert.match(crm, /id="crm-integrations"/)
  assert.match(page, /DealerDetailSectionNav/)
  assert.match(nav, /visibleDealerDetailSections/)
  assert.match(nav, /href=\{`#\$\{section\.id\}`\}/)

  for (const id of ids) {
    assert.match(styles, new RegExp(`#${id}`))
    assert.match(styles, /scroll-margin-top:\s*var\(--dealer-section-scroll-offset\)/)
  }
})

test('dealer detail nav exposes the active section and follows scroll', () => {
  assert.match(nav, /aria-current=\{activeId === section\.id \? 'true' : undefined\}/)
  assert.match(nav, /new IntersectionObserver/)
  assert.match(nav, /prefers-reduced-motion/)
  assert.match(styles, /a\[aria-current='true'\]/)
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/)
})

test('visible dealer detail sections follow the same access flags as the page', () => {
  assert.deepEqual(
    visibleDealerDetailSections({ canManageDealerCredentials: false, canManageDealerUsers: false }).map((section) => section.id),
    ['company-details', 'branding', 'design'],
  )
  assert.deepEqual(
    visibleDealerDetailSections({ canManageDealerCredentials: true, canManageDealerUsers: false }).map((section) => section.id),
    ['company-details', 'branding', 'design', 'marketing-tools', 'crm-integrations'],
  )
  assert.deepEqual(
    visibleDealerDetailSections({ canManageDealerCredentials: false, canManageDealerUsers: true }).map((section) => section.id),
    ['company-details', 'branding', 'design', 'dealer-users'],
  )
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
