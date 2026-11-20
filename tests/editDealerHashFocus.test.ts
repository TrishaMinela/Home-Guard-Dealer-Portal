import assert from 'node:assert/strict'
import test from 'node:test'
import { connectEditDealerHashFocus, editDealerFocusId, planEditDealerFocus, revealEditDealerTarget, type EditDealerFocusElement } from '../src/utils/editDealerHashFocus.ts'

test('only the four checklist fields are accepted from the fragment', () => {
  assert.equal(editDealerFocusId('#company-name'), 'company-name')
  assert.equal(editDealerFocusId('dealer-slug'), 'dealer-slug')
  assert.equal(editDealerFocusId('#primary-color'), 'primary-color')
  assert.equal(editDealerFocusId('#heading-font-family'), 'heading-font-family')
  assert.equal(editDealerFocusId('#branding'), null)
  assert.equal(editDealerFocusId('#company'), null)
  assert.equal(editDealerFocusId('#not-a-field'), null)
})

test('focus waits for a slow form and then runs once', () => {
  assert.deepEqual(planEditDealerFocus({ hash: '#company-name', focusedHash: null, elementReady: false }), { action: 'wait', id: 'company-name' })
  assert.deepEqual(planEditDealerFocus({ hash: '#company-name', focusedHash: null, elementReady: true }), { action: 'focus', id: 'company-name' })
  assert.deepEqual(planEditDealerFocus({ hash: '#company-name', focusedHash: '#company-name', elementReady: true }), { action: 'skip' })
  assert.deepEqual(planEditDealerFocus({ hash: '#branding', focusedHash: null, elementReady: false }), { action: 'skip' })
})

function fakeTarget(id: string): EditDealerFocusElement & { id: string; classes: Set<string>; scrolled: ScrollIntoViewOptions | null; focused: FocusOptions | null } {
  const classes = new Set<string>()
  return {
    id,
    classes,
    scrolled: null,
    focused: null,
    classList: {
      add: (name: string) => { classes.add(name) },
      remove: (name: string) => { classes.delete(name) },
      contains: (name: string) => classes.has(name),
    },
    scrollIntoView(options: ScrollIntoViewOptions) { this.scrolled = options },
    focus(options?: FocusOptions) { this.focused = options ?? null },
  }
}

test('reveal scrolls instantly without an animated timer when motion is reduced', () => {
  const target = fakeTarget('company-name')
  revealEditDealerTarget(target, true)
  assert.equal(target.scrolled?.behavior, 'auto')
  assert.deepEqual(target.focused, { preventScroll: true })
  assert.equal(target.classes.has('dealer-setup-anchor'), true)
  assert.equal(target.classes.has('dealer-setup-target'), true)
})

test('a missing field is focused after it mounts, and a later hash focuses the new field once', () => {
  let hash = '#company-name'
  const elements = new Map<string, ReturnType<typeof fakeTarget>>()
  let onMutate = () => {}
  let onHash = () => {}
  let observing = false
  const timers: Array<() => void> = []
  const stop = connectEditDealerHashFocus({
    hash: () => hash,
    element: (id) => elements.get(id) ?? null,
    reducedMotion: () => false,
    observe: (callback) => {
      onMutate = callback
      observing = true
      return () => { observing = false }
    },
    listen: (callback) => {
      onHash = callback
      return () => { onHash = () => {} }
    },
    schedule: (_delay, callback) => {
      timers.push(callback)
      return () => { const index = timers.indexOf(callback); if (index >= 0) timers.splice(index, 1) }
    },
  })
  assert.equal(observing, true)
  assert.equal(elements.has('company-name'), false)
  const company = fakeTarget('company-name')
  elements.set('company-name', company)
  onMutate()
  assert.equal(observing, false)
  assert.equal(company.scrolled?.behavior, 'smooth')
  assert.deepEqual(company.focused, { preventScroll: true })
  onMutate()
  assert.equal(company.scrolled?.behavior, 'smooth')
  hash = '#dealer-slug'
  onHash()
  assert.equal(observing, true)
  const slug = fakeTarget('dealer-slug')
  elements.set('dealer-slug', slug)
  onMutate()
  assert.equal(slug.focused?.preventScroll, true)
  assert.equal(observing, false)
  onMutate()
  assert.equal(slug.classes.has('dealer-setup-target'), true)
  stop()
  assert.equal(observing, false)
  assert.equal(company.classes.has('dealer-setup-target'), false)
})
