export const DEALER_INVITE_ROLES = ['dealer_admin', 'dealer_member'] as const

export type DealerInviteRole = (typeof DEALER_INVITE_ROLES)[number]

/** Accepts only the two invitation roles. An empty value defaults to Dealer Member. */
export function dealerInviteRole(value: unknown): DealerInviteRole | null {
  if (value === undefined || value === null || value === '') return 'dealer_member'
  if (value === 'dealer_admin' || value === 'dealer_member') return value
  return null
}

export function isDealerAdminRole(role: string | null | undefined): boolean {
  return role === 'dealer_admin'
}

/** Labels for the access list. Existing `member` rows stay stored as `member`. */
export function dealerRoleLabel(role: string): string {
  if (role === 'dealer_admin') return 'Dealer Admin'
  if (role === 'dealer_member' || role === 'member') return 'Dealer Member'
  return role.replaceAll('_', ' ')
}
