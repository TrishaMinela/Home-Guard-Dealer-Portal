export type CsvColumn<Row> = {
  header: string
  value: (row: Row) => string | null | undefined
}

function escapeCsvValue(value: string | null | undefined) {
  const normalized = value ?? ''
  return `"${normalized.replaceAll('"', '""')}"`
}

export function dateStamp(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function exportCsv<Row>(filename: string, rows: Row[], columns: CsvColumn<Row>[]) {
  if (rows.length === 0) return false

  const lines = [
    columns.map((column) => escapeCsvValue(column.header)).join(','),
    ...rows.map((row) =>
      columns.map((column) => escapeCsvValue(column.value(row))).join(','),
    ),
  ]
  const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], {
    type: 'text/csv;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
  return true
}
