export type MarketingBannerActor =
  | { role: 'hgi_admin' }
  | { role: 'dealer_user'; dealerId: string }
  | { role: 'unauthenticated' }

export function canManageMarketingBannerTemplates(actor: MarketingBannerActor): boolean {
  return actor.role === 'hgi_admin'
}

export function canUseDealerLogo(actor: MarketingBannerActor, logoDealerId: string): boolean {
  const owner = logoDealerId.trim().toLowerCase()
  if (!owner) return false
  if (actor.role === 'hgi_admin') return true
  if (actor.role === 'dealer_user') return actor.dealerId.trim().toLowerCase() === owner
  return false
}
