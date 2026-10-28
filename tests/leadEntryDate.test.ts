import assert from 'node:assert/strict'
import test from 'node:test'
import { buildCsv } from '../src/utils/csvExport.ts'
import { formatCsvTimestamp } from '../src/utils/dateTime.ts'

test('lead entry timestamps export as deterministic ISO 8601 values', () => {
  const createdAt = '2026-10-28T11:42:00.000Z'
  const csv = buildCsv(
    [{ created_at: createdAt, name: 'Test, "Lead"' }],
    [
      { header: 'Name', value: (row) => row.name },
      { header: 'Date Entered', value: (row) => formatCsvTimestamp(row.created_at) },
    ],
  )

  assert.equal(formatCsvTimestamp(createdAt), createdAt)
  assert.equal(csv, '\uFEFF"Name","Date Entered"\r\n"Test, ""Lead""","2026-10-28T11:42:00.000Z"')
})

test('CSV export preserves commas, quotes, and line breaks', () => {
  const csv = buildCsv(
    [{ notes: 'First line, quoted "value"\nSecond line' }],
    [{ header: 'Notes', value: (row) => row.notes }],
  )

  assert.match(csv, /"First line, quoted ""value""\nSecond line"/)
})
