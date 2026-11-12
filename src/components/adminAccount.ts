const displayNameKeys = ['full_name', 'name', 'display_name'] as const

export function adminDisplayName(metadata: unknown): string {
  if (!metadata || typeof metadata !== 'object') return ''
  const record = metadata as Record<string, unknown>
  for (const key of displayNameKeys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

export function adminRoleLabel(isBillingAccessManager: boolean, isInternalBillingAdmin: boolean): string {
  if (isBillingAccessManager && isInternalBillingAdmin) return 'Access manager · Billing admin'
  if (isBillingAccessManager) return 'Access manager'
  if (isInternalBillingAdmin) return 'Billing admin'
  return 'Home Guard admin'
}

export function adminAccountInitial(label: string): string {
  const match = label.trim().match(/[A-Za-z0-9]/)
  return match ? match[0].toUpperCase() : ''
}
