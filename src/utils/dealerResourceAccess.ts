export function sameDealer(left: string | null | undefined, right: string | null | undefined): boolean {
  if (!left || !right) return false
  return left.trim().toLowerCase() === right.trim().toLowerCase()
}

export function visibleLead<T extends { id: string; dealer_id: string | null }>(
  leads: readonly T[],
  dealerId: string,
  leadId: string | undefined,
): T | null {
  if (!leadId) return null
  return leads.find((lead) => lead.id === leadId && sameDealer(lead.dealer_id, dealerId)) ?? null
}
