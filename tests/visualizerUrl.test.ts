import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const visualizerConfigUrl = new URL('../src/config/visualizer.ts', import.meta.url)

test('dealer Door Builder URLs use the current production domain and dealer slug', async () => {
  const source = await readFile(visualizerConfigUrl, 'utf8')

  assert.match(source, /https:\/\/www\.hgidoorbuilder\.com/)
  assert.match(source, /VITE_DOOR_BUILDER_BASE_URL/)
  assert.match(source, /`\$\{VISUALIZER_BASE_URL\}\/\$\{slug\}`/)
  assert.doesNotMatch(source, /homeguardvisualizer\.com/)
})

test('displayed and actionable dealer URLs share the same centralized base', async () => {
  const source = await readFile(visualizerConfigUrl, 'utf8')

  assert.match(source, /VISUALIZER_DISPLAY_DOMAIN = VISUALIZER_BASE_URL/)
  assert.match(source, /`\$\{VISUALIZER_DISPLAY_DOMAIN\}\/\$\{slug\}`/)
})
