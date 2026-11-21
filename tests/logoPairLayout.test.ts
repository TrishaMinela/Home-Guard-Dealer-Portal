import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const portal = readFileSync('src/styles/logoPair.css', 'utf8')
const preview = readFileSync('src/components/DealerLogoVariantSettings.tsx', 'utf8')
const display = readFileSync('src/components/DealerLogoDisplaySettings.tsx', 'utf8')

test('logo pairs size to their own shape instead of equal columns', () => {
  assert.match(portal, /--logo-pair-gap:\s*12px/)
  assert.match(portal, /--logo-pair-max-height:\s*72px/)
  assert.match(portal, /flex:\s*0 1 auto/)
  assert.match(portal, /align-self:\s*stretch/)
  assert.match(portal, /pointer-events:\s*none/)
  assert.match(portal, /object-fit:\s*contain/)
  assert.match(portal, /aspect-ratio:\s*auto/)
  assert.doesNotMatch(portal, /flex:\s*1 1 0|calc\(\(100% - 17px\) \/ 2\)/)
  const narrow = portal.slice(portal.indexOf('@media (max-width: 560px)'), portal.indexOf('@media (max-width: 400px)'))
  assert.match(narrow, /--logo-pair-max-height:\s*32px/)
  assert.doesNotMatch(narrow, /46%/)
  assert.match(narrow, /max-width:\s*150px/)
  assert.match(preview, /logo-variant-preview__logos logo-pair/)
  assert.match(preview, /logo-pair__rule/)
  assert.match(display, /logo-pair/)
  assert.match(readFileSync('src/App.css', 'utf8'), /pointer-events:none/)
})
