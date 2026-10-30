export const RESERVED_DEALER_SLUGS = new Set([
  'api', 'assets', 'admin', 'auth', 'billing', 'builder', 'dashboard', 'dealer', 'dealers',
  'favicon', 'favicon-ico', 'favicon-svg', 'login', 'manifest', 'robots', 'sitemap', 'visualizer',
])

export function normalizeDealerSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function isReservedDealerSlug(value: string) {
  return RESERVED_DEALER_SLUGS.has(normalizeDealerSlug(value))
}
