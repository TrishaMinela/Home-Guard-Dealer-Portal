import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { dealerFontOptions, dealerFontWeights, dealerTypographyValues, fontStacks, typographyPayload } from '../src/utils/dealerTypography.ts'

const migration=readFileSync('supabase/migrations/20261103000000_add_dealer_typography.sql','utf8')
const component=readFileSync('src/components/DealerTypographySettings.tsx','utf8')

test('font choices are controlled native and bundled families',()=>{
  assert.deepEqual(dealerFontOptions.map(([value])=>value),['system','arial','helvetica','verdana','tahoma','trebuchet','georgia','times','courier','montserrat','caladea','custom'])
  assert.match(fontStacks.system,/BlinkMacSystemFont/)
  assert.match(fontStacks.georgia,/Times New Roman/)
  assert.deepEqual(dealerFontWeights,[300,400,500,600,700,800])
})

test('empty dealer typography preserves defaults and reset payload stays isolated',()=>{
  const values=dealerTypographyValues({heading_font_family:null,body_font_family:null} as never)
  assert.equal(values.headingFontFamily,'')
  assert.equal(values.bodyFontSize,'')
  assert.deepEqual(typographyPayload(values),{
    heading_font_family:null,heading_font_weight:null,heading_font_size:null,body_font_family:null,body_font_weight:null,body_font_size:null,
    custom_heading_font_url:null,custom_heading_font_name:null,custom_heading_font_weight:null,custom_body_font_url:null,custom_body_font_name:null,custom_body_font_weight:null,
  })
})

test('database and upload controls enforce safe bounds and dealer isolation',()=>{
  assert.match(migration,/heading_font_size between 24 and 72/)
  assert.match(migration,/body_font_size between 14 and 22/)
  assert.match(migration,/file_size_limit=2097152/)
  assert.match(migration,/dealer_id::text=\(storage\.foldername\(name\)\)\[1\]/)
  assert.match(migration,/storage\.filename\(name\) ~ '\^\(heading\|body\)\\\.\(woff2\|woff\)\$'/)
  assert.match(component,/\['wOF2','wOFF'\]\.includes\(signature\)/)
  assert.match(component,/Only upload fonts you are licensed or authorized to use/)
})
