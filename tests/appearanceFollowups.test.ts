import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const previewCss = readFileSync('src/styles/doorBuilderPreview.css', 'utf8')
const appearanceCss = readFileSync('src/styles/dealerAppearance.css', 'utf8')
const preview = readFileSync('src/components/DoorBuilderAppearancePreview.tsx', 'utf8')
const picker = readFileSync('src/components/AppearanceColorControl.tsx', 'utf8')
const pickerCss = readFileSync('src/styles/appearanceControls.css', 'utf8')
const settings = readFileSync('src/components/DoorBuilderAppearanceSettings.tsx', 'utf8')
const profile = readFileSync('src/pages/DealerCompanyProfilePage.tsx', 'utf8')
const access = readFileSync('src/hooks/useAccountAccess.ts', 'utf8')
const migration = readFileSync('supabase/migrations/20261121000000_fix_door_builder_appearance_is_valid_search_path.sql', 'utf8')
const original = readFileSync('supabase/migrations/20261120200000_add_door_builder_appearance.sql', 'utf8')

test('the portal header preview uses the same appearance tokens as the Door Builder', () => {
  assert.match(previewCss, /background:\s*var\(--db-header-background,\s*var\(--dealer-secondary/)
  assert.match(previewCss, /color:\s*var\(--db-header-text,\s*var\(--dealer-secondary-foreground/)
  assert.match(previewCss, /border-bottom:\s*4px solid var\(--db-header-accent,\s*var\(--dealer-primary/)
  assert.match(previewCss, /color:\s*var\(--db-header-icon,\s*currentColor\)/)
  assert.match(previewCss, /background:\s*var\(--db-header-button-background,\s*transparent\)/)
  assert.match(previewCss, /color:\s*var\(--db-header-button-text,\s*inherit\)/)
  assert.match(previewCss, /border:\s*1px solid var\(--db-header-button-border,\s*currentColor\)/)
  assert.match(previewCss, /background:\s*var\(--db-card-background,\s*#fff\)/)
  assert.match(previewCss, /border-color:\s*var\(--db-card-selected/)
  assert.match(previewCss, /border-color:\s*var\(--db-card-hover/)
  assert.match(previewCss, /color:\s*var\(--db-card-title/)
  assert.doesNotMatch(previewCss, /header\.find-my-door-header \{ background: #05040b/)
  const appearanceImport = preview.lastIndexOf("import '../styles/dealerAppearance.css'")
  const scaffoldImport = preview.lastIndexOf("import '../styles/doorBuilderPreview.css'")
  assert.ok(appearanceImport > scaffoldImport)
  assert.match(appearanceCss, /--db-header-background, var\(--dealer-secondary\)/)
})

test('the color picker stays hidden until it has been positioned', () => {
  assert.match(picker, /data-placed=\{placed \? 'true' : 'false'\}/)
  assert.match(picker, /useLayoutEffect/)
  assert.match(pickerCss, /\.appearance-popover\[data-placed="false"\] \{ visibility: hidden; pointer-events: none; \}/)
  assert.doesNotMatch(picker, /setPosition\(placePopover[\s\S]{0,240}\}, \[open, value\]\)/)
})

test('dealer appearance controls are limited to dealer admins', () => {
  assert.match(access, /select\('dealer_id, role'\)/)
  assert.match(access, /dealerRole: membership\.role === 'dealer_admin' \? 'dealer_admin' : 'member'/)
  assert.match(readFileSync('src/components/PortalLayout.tsx', 'utf8'), /canEditAppearance=\{dealerRole === 'dealer_admin'\}/)
  assert.match(profile, /canEditAppearance \? <DoorBuilderAppearanceSettings/)
  assert.match(settings, /if \(!canEdit\) return null/)
  assert.match(readFileSync('supabase/migrations/20261120200000_add_door_builder_appearance.sql', 'utf8'), /dealer_users\.role = 'dealer_admin'/)
})

test('the appearance validator search_path migration only sets the path', () => {
  assert.match(original, /function public\.door_builder_appearance_is_valid\(config jsonb\)/)
  assert.match(migration, /alter function public\.door_builder_appearance_is_valid\(jsonb\) set search_path = pg_catalog;/)
  assert.doesNotMatch(migration, /grant |revoke |create or replace function|drop function/i)
})
