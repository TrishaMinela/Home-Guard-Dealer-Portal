import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  APPEARANCE_FIELDS,
  SIMPLIFIED_APPEARANCE_FIELDS,
  appearanceContrastWarnings,
  appearanceCssVars,
  appearanceEditorPayload,
  appearanceEquals,
  appearanceForStorage,
  appearanceFromStorage,
  appearanceRpcArgs,
  appearanceUpdate,
  appearanceMode,
  appearanceUsesLegacyMapping,
  choiceForValue,
  hueFromPointer,
  nudgePickerHex,
  parseHexInput,
  resolvedBrandColors,
  simplifiedAppearanceCssVars,
  svFromPointer,
  valueForChoice,
} from '../src/utils/doorBuilderAppearance.ts'

const brand = { primaryColor: '#235176', secondaryColor: '#8ebb53' }
const resolved = resolvedBrandColors(brand)

test('appearance stores brand colors as references and custom colors as HEX', () => {
  const saved = appearanceForStorage({
    headerBackground: '#FFFFFF',
    headerText: 'primary',
    bodyBackground: 'secondary',
    primaryButtonBackground: '#abc',
    unknown: '#112233',
  })
  assert.equal(saved.ok, false)
  const valid = appearanceForStorage({
    headerBackground: '#FFFFFF',
    headerText: 'primary',
    bodyBackground: 'Secondary',
    primaryButtonBackground: '#abc',
    cardTitle: null,
  })
  assert.equal(valid.ok, true)
  if (!valid.ok) return
  assert.equal(valid.value?.headerBackground, '#ffffff')
  assert.equal(valid.value?.headerText, 'primary')
  assert.equal(valid.value?.bodyBackground, 'secondary')
  assert.equal(valid.value?.primaryButtonBackground, '#aabbcc')
  assert.equal(valid.value?.cardTitle, undefined)
  assert.deepEqual(appearanceUpdate(valid.value), { door_builder_appearance: valid.value })
  assert.deepEqual(Object.keys(appearanceUpdate(valid.value)), ['door_builder_appearance'])
  assert.deepEqual(appearanceRpcArgs('dealer-1', valid.value), {
    p_dealer_id: 'dealer-1',
    p_appearance: valid.value,
  })
})

test('empty and invalid appearance inherit, and a bad key does not erase valid public colors', () => {
  const cleared = appearanceForStorage(null)
  const empty = appearanceForStorage({})
  assert.equal(cleared.ok, true)
  assert.equal(empty.ok, true)
  if (cleared.ok) assert.equal(cleared.value, null)
  if (empty.ok) assert.equal(empty.value, null)
  assert.equal(appearanceFromStorage({ headerBackground: '#ffffff', webhookUrl: 'https://secret.example' })?.headerBackground, '#ffffff')
  assert.equal('webhookUrl' in (appearanceFromStorage({ headerBackground: '#ffffff', webhookUrl: 'https://secret.example' }) ?? {}), false)
  assert.equal(appearanceFromStorage('primary'), null)
  assert.equal(appearanceFromStorage({ headerText: 'javascript:alert(1)' })?.headerText, undefined)
})

test('primary and secondary references follow later brand color changes', () => {
  const config = appearanceForStorage({ headerBackground: 'secondary', primaryButtonBackground: 'primary' })
  assert.equal(config.ok, true)
  if (!config.ok) return
  const first = appearanceCssVars(config.value, resolved)
  assert.equal(first['--db-header-background'], '#8ebb53')
  assert.equal(first['--db-primary-button-background'], '#235176')
  const nextBrand = resolvedBrandColors({ primaryColor: '#101417', secondaryColor: '#f4f7f8' })
  const second = appearanceCssVars(config.value, nextBrand)
  assert.equal(config.value?.headerBackground, 'secondary')
  assert.equal(second['--db-header-background'], '#f4f7f8')
  assert.equal(second['--db-primary-button-background'], '#101417')
  assert.equal(appearanceCssVars(null, resolved)['--db-header-background'], undefined)
})

test('reset and cancel compare drafts without treating key order as a change', () => {
  const left = appearanceFromStorage({ footerText: '#ffffff', headerBackground: '#000000' })
  const right = appearanceFromStorage({ headerBackground: '#000000', footerText: '#ffffff' })
  assert.equal(appearanceEquals(left, right), true)
  assert.equal(appearanceEquals(left, null), false)
  assert.equal(appearanceEquals(null, null), true)
})

test('contrast warnings inform and do not invent a replacement color', () => {
  const warnings = appearanceContrastWarnings({ headerBackground: '#ffffff', headerText: '#f7f8f9' }, brand)
  assert.ok(warnings.some((warning) => warning.id === 'header'))
  const unchanged = appearanceContrastWarnings(null, brand)
  assert.deepEqual(unchanged, [])
  const custom = appearanceForStorage({ headerBackground: '#ffffff', headerText: '#f7f8f9' })
  assert.equal(custom.ok, true)
  if (!custom.ok) return
  assert.equal(custom.value?.headerText, '#f7f8f9')
})

test('picker accepts typed HEX, presets, drag math, and arrow keys', () => {
  assert.deepEqual(parseHexInput('235176'), { ok: true, hex: '#235176' })
  assert.deepEqual(parseHexInput('#abc'), { ok: true, hex: '#aabbcc' })
  assert.equal(parseHexInput('red').ok, false)
  assert.equal(parseHexInput('javascript:alert(1)').ok, false)
  assert.equal(choiceForValue('primary'), 'primary')
  assert.equal(choiceForValue('#ffffff'), 'white')
  assert.equal(choiceForValue('#123456'), 'custom')
  assert.equal(valueForChoice('inherit', '#123456'), null)
  assert.equal(valueForChoice('secondary', '#123456'), 'secondary')
  assert.equal(valueForChoice('custom', '#123456'), '#123456')
  const dragged = svFromPointer(80, 20, 100, 100)
  assert.ok(dragged.s > 0.7 && dragged.v > 0.7)
  assert.equal(hueFromPointer(50, 100), 180)
  const hue = nudgePickerHex('#ff0000', 'hue', 'ArrowRight')
  assert.notEqual(hue, '#ff0000')
  const brighter = nudgePickerHex('#808080', 'sv', 'ArrowUp')
  assert.notEqual(brighter, '#808080')
})

test('the six settings expand together and a legacy key keeps the old per-key colors', () => {
  const simplified = appearanceCssVars({
    headerBackground: 'secondary',
    headerText: '#ffffff',
    bodyBackground: 'primary',
    bodyText: '#000000',
    footerBackground: '#112233',
    footerText: '#ffffff',
  }, resolved)
  assert.equal(simplified['--db-header-background'], '#8ebb53')
  assert.equal(simplified['--db-header-text'], '#ffffff')
  assert.equal(simplified['--db-header-icon'], '#ffffff')
  assert.equal(simplified['--db-header-button-text'], '#ffffff')
  assert.equal(simplified['--db-header-button-border'], '#ffffff')
  assert.equal(simplified['--db-header-button-background'], 'transparent')
  assert.equal(simplified['--db-body-background'], '#235176')
  assert.equal(simplified['--db-preview-background'], undefined)
  assert.equal(simplified['--db-step-background'], undefined)
  assert.equal(simplified['--db-heading-text'], '#000000')
  assert.equal(simplified['--db-body-text'], '#000000')
  assert.equal(simplified['--db-step-text'], undefined)
  assert.equal(simplified['--db-preview-text'], undefined)
  assert.equal(simplified['--db-preview-label'], undefined)
  assert.equal(simplified['--db-footer-background'], '#112233')
  assert.equal(simplified['--db-footer-text'], '#ffffff')
  assert.equal(simplified['--db-footer-link'], '#ffffff')
  assert.equal(simplified['--db-footer-icon'], '#ffffff')
  assert.equal(simplified['--db-card-background'], undefined)
  assert.equal(simplified['--db-primary-button-background'], undefined)
  assert.deepEqual(simplified, simplifiedAppearanceCssVars({
    headerBackground: 'secondary',
    headerText: '#ffffff',
    bodyBackground: 'primary',
    bodyText: '#000000',
    footerBackground: '#112233',
    footerText: '#ffffff',
  }, resolved))

  const legacy = appearanceCssVars({
    headerText: '#ffffff',
    headerIcon: '#123456',
    bodyBackground: '#abcdef',
    previewBackground: '#654321',
    cardBackground: '#fff4d6',
    footerText: '#00ff00',
    footerLink: '#0000ff',
  }, resolved)
  assert.equal(appearanceUsesLegacyMapping({
    headerText: '#ffffff',
    headerIcon: '#123456',
    bodyBackground: '#abcdef',
    previewBackground: '#654321',
    cardBackground: '#fff4d6',
    footerText: '#00ff00',
    footerLink: '#0000ff',
  }), true)
  assert.equal(legacy['--db-header-icon'], '#123456')
  assert.equal(legacy['--db-header-button-text'], undefined)
  assert.equal(legacy['--db-preview-background'], '#654321')
  assert.equal(legacy['--db-body-background'], '#abcdef')
  assert.equal(legacy['--db-card-background'], '#fff4d6')
  assert.equal(legacy['--db-footer-link'], '#0000ff')
  assert.equal(appearanceUsesLegacyMapping({ headerText: '#111111' }), true)
  assert.equal(appearanceUsesLegacyMapping({ headerText: '#ffffff', bodyBackground: '#abcdef' }), false)
  assert.equal(appearanceMode(null), undefined)
  assert.equal(appearanceMode({ headerIcon: '#123456', headerText: '#ffffff' }), undefined)
  assert.equal(appearanceMode({ headerBackground: '#112233', bodyText: '#ffffff' }), 'simple')
  assert.deepEqual(appearanceEditorPayload({
    headerBackground: '#FFFFFF',
    headerText: '#FFFFFF',
    bodyText: 'primary',
    cardTitle: '#111111',
    footerText: '#000000',
    previewBackground: '#222222',
  }), {
    headerBackground: '#ffffff',
    headerText: '#ffffff',
    footerText: '#000000',
  })
  assert.equal(appearanceEditorPayload(null), null)
  assert.equal(SIMPLIFIED_APPEARANCE_FIELDS.length, 6)
})

test('migration, save paths, and public payload stay limited to appearance colors', () => {
  const migration = readFileSync('supabase/migrations/20261120200000_add_door_builder_appearance.sql', 'utf8')
  assert.match(migration, /add column if not exists door_builder_appearance jsonb null/)
  assert.match(migration, /door_builder_appearance_is_valid/)
  assert.match(migration, /set search_path = pg_catalog/)
  assert.match(migration, /grant execute on function public.update_my_dealer_door_builder_appearance\(uuid, jsonb\) to authenticated/)
  assert.match(migration, /revoke all on function public.update_my_dealer_door_builder_appearance\(uuid, jsonb\) from public, anon/)
  assert.match(migration, /drop column if exists door_builder_appearance/)
  for (const field of APPEARANCE_FIELDS) assert.match(migration, new RegExp(`'${field.key}'`))
  const studio = readFileSync('src/pages/BrandingStudioPage.tsx', 'utf8')
  assert.match(studio, /appearanceUpdate\(value\)/)
  assert.match(studio, /update_my_dealer_door_builder_appearance/)
  assert.match(studio, /appearanceRpcArgs\(current\.id, value\)/)
  assert.doesNotMatch(studio.slice(studio.indexOf('async function saveAppearance'), studio.indexOf('async function saveTypography')), /logo_url|primary_color/)
  const css = readFileSync('src/styles/dealerAppearance.css', 'utf8')
  assert.doesNotMatch(css, /door-frame|option-visual|filter:/)
  for (const field of APPEARANCE_FIELDS) assert.match(css, new RegExp(field.cssVar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
})
