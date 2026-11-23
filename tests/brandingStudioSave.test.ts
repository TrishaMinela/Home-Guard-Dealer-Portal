import assert from 'node:assert/strict'
import test from 'node:test'
import { runBrandingSave, studioSectionFromValue } from '../src/features/branding-studio/sections.ts'

test('legacy branding targets map onto studio categories', () => {
  assert.equal(studioSectionFromValue('#door-builder-appearance'), 'colors')
  assert.equal(studioSectionFromValue('heading-font-family'), 'typography')
  assert.equal(studioSectionFromValue('homepage-logo-selection'), 'logos')
  assert.equal(studioSectionFromValue('pages-logo-selection'), 'placement')
  assert.equal(studioSectionFromValue('not-a-section'), null)
})

test('a coordinated save reports each piece and does not stop after one failure', async () => {
  const ran: string[] = []
  const result = await runBrandingSave([
    { id: 'placement', label: 'Logo placement', run: async () => { ran.push('placement') } },
    { id: 'appearance', label: 'Colors', run: async () => { ran.push('appearance'); throw new Error('colors rejected') } },
    { id: 'typography', label: 'Typography', run: async () => { ran.push('typography') } },
  ])
  assert.deepEqual(ran, ['placement', 'appearance', 'typography'])
  assert.deepEqual(result.saved, ['placement', 'typography'])
  assert.equal(result.failed.length, 1)
  assert.equal(result.failed[0]?.label, 'Colors')
  assert.equal(result.failed[0]?.message, 'colors rejected')
})
