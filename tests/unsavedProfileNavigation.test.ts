import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  UNSAVED_PROFILE_LEAVE_MESSAGE,
  UNSAVED_PROFILE_SECTION_MESSAGE,
  unsavedProfileNavigationKind,
  type UnsavedProfileClick,
} from '../src/utils/unsavedProfileNavigation.ts'

const current = 'https://portal.example/company'

function click(overrides: Partial<UnsavedProfileClick> = {}): UnsavedProfileClick {
  return {
    dirty: true,
    defaultPrevented: false,
    button: 0,
    metaKey: false,
    altKey: false,
    ctrlKey: false,
    shiftKey: false,
    href: '/dashboard',
    target: '',
    download: false,
    ...overrides,
  }
}

test('unsaved company or color edits warn before an in-app route change', () => {
  assert.equal(unsavedProfileNavigationKind(click(), current), 'leave')
  assert.equal(unsavedProfileNavigationKind(click({ href: '/marketing' }), current), 'leave')
  assert.equal(unsavedProfileNavigationKind(click({ href: '/company#logos' }), current), 'section')
  assert.match(UNSAVED_PROFILE_LEAVE_MESSAGE, /Cancel to keep editing/)
  assert.match(UNSAVED_PROFILE_LEAVE_MESSAGE, /discard them and leave/)
  assert.match(UNSAVED_PROFILE_SECTION_MESSAGE, /Leave this section without saving/)
})

test('clean company details and non-navigating clicks are left alone', () => {
  assert.equal(unsavedProfileNavigationKind(click({ dirty: false }), current), 'allow')
  assert.equal(unsavedProfileNavigationKind(click({ href: '/company' }), current), 'allow')
  assert.equal(unsavedProfileNavigationKind(click({ href: '/company#logos' }), 'https://portal.example/company#logos'), 'allow')
  assert.equal(unsavedProfileNavigationKind(click({ href: null }), current), 'allow')
  assert.equal(unsavedProfileNavigationKind(click({ defaultPrevented: true }), current), 'allow')
  assert.equal(unsavedProfileNavigationKind(click({ metaKey: true }), current), 'allow')
  assert.equal(unsavedProfileNavigationKind(click({ ctrlKey: true }), current), 'allow')
  assert.equal(unsavedProfileNavigationKind(click({ shiftKey: true }), current), 'allow')
  assert.equal(unsavedProfileNavigationKind(click({ button: 1 }), current), 'allow')
  assert.equal(unsavedProfileNavigationKind(click({ target: '_blank' }), current), 'allow')
  assert.equal(unsavedProfileNavigationKind(click({ download: true }), current), 'allow')
  assert.equal(unsavedProfileNavigationKind(click({ href: 'mailto:help@example.com' }), current), 'allow')
  assert.equal(unsavedProfileNavigationKind(click({ href: 'https://other.example/page' }), current), 'allow')
})

test('company profile listens for sidebar links without taking over the other save actions', () => {
  const profile = readFileSync('src/pages/DealerCompanyProfilePage.tsx', 'utf8')
  const logos = readFileSync('src/components/DealerLogoVariantSettings.tsx', 'utf8')
  const placement = readFileSync('src/components/DealerLogoPlacementSettings.tsx', 'utf8')
  const typography = readFileSync('src/components/DealerTypographySettings.tsx', 'utf8')
  assert.match(profile, /unsavedProfileNavigationKind/)
  assert.match(profile, /document\.addEventListener\('click', onClick, true\)/)
  assert.match(profile, /beforeunload/)
  assert.match(profile, /event\.stopPropagation\(\)/)
  assert.doesNotMatch(profile, /onProfileSectionClick/)
  assert.doesNotMatch(profile, /DealerLogoVariantSettings|DealerLogoPlacementSettings|DealerTypographySettings/)
  const studio = readFileSync('src/pages/BrandingStudioPage.tsx', 'utf8')
  assert.match(studio, /DealerLogoVariantSettings/)
  assert.match(studio, /DealerLogoPlacementSettings/)
  assert.match(studio, /DealerTypographySettings/)
  assert.match(studio, /unsavedProfileNavigationKind/)
  assert.match(studio, /document\.addEventListener\('click', onClick, true\)/)
  assert.doesNotMatch(logos, /unsavedProfileNavigationKind/)
  assert.doesNotMatch(placement, /unsavedProfileNavigationKind/)
  assert.doesNotMatch(typography, /unsavedProfileNavigationKind/)
})
