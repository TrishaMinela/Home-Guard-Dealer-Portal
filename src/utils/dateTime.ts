export function formatPortalDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function formatCsvTimestamp(value: string) {
  return new Date(value).toISOString()
}
