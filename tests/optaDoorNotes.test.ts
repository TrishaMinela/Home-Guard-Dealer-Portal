import assert from 'node:assert/strict'
import test from 'node:test'
import { OPTA_NOTES_MAX_LENGTH, optaDoorConfigurationNotes } from '../api/_lib/optaDoorNotes.ts'
import { syntheticAmericasBestOptaLead } from '../api/_lib/optaLeadDelivery.ts'

test('door notes use labeled lines and skip empty fields without raw JSON', () => {
  const notes = optaDoorConfigurationNotes(syntheticAmericasBestOptaLead().doorConfiguration, 'Call after five.')
  assert.equal(notes, [
    'Door line: Smooth-Star',
    'Style: F101 - Craftsman',
    'Sidelites/slab/sidelite glass: Sidelites on Both Sides / F101 SL / Clear',
    'Main glass: Clear',
    'Finish type/color: Paint / Black',
    'Jamb type/finish: Timber / Paint / Black',
    'Hardware: Schlage Latitude - Matte Black',
    'Swing: Left Hand Inswing',
    'Customer note: Call after five.',
  ].join('\n'))
  assert.doesNotMatch(notes ?? '', /Lock setup|Hinge|\{|schemaVersion|thumbnail|\.webp/)
})

test('an empty configuration omits blank lines and still keeps a customer note', () => {
  const notes = optaDoorConfigurationNotes({ schemaVersion: 1, configuration: {} }, 'Only a note.')
  assert.equal(notes, 'Customer note: Only a note.')
})

test('a long customer note is shortened before the door summary', () => {
  const note = 'Please call. '.repeat(200)
  const notes = optaDoorConfigurationNotes(syntheticAmericasBestOptaLead().doorConfiguration, note)
  assert.ok(notes)
  assert.equal(notes?.length, OPTA_NOTES_MAX_LENGTH)
  assert.match(notes ?? '', /^Door line: Smooth-Star/)
  assert.match(notes ?? '', /Customer note: Please call\./)
  assert.match(notes ?? '', /…$/)
  assert.equal((notes ?? '').includes(note), false)
})
