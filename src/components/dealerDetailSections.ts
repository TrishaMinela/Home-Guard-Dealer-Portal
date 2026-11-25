export type DealerDetailSectionAccess = 'credentials' | 'users'

export type DealerDetailSection = {
  id: string
  label: string
  icon: string
  /** Path segment under /admin/dealers/:id. Empty is the overview. */
  path: string
  access?: DealerDetailSectionAccess
  /** When set, the nav item opens this path under /admin/dealers/:id instead of scrolling. */
  route?: string
}

export const dealerDetailSectionScrollGap = 12

export const dealerDetailSections: readonly DealerDetailSection[] = [
  { id: 'setup', label: 'Overview', icon: 'clipboard', path: '' },
  { id: 'company-details', label: 'Company', icon: 'building', path: 'company' },
  { id: 'branding-studio', label: 'Branding', icon: 'palette', path: 'branding' },
  { id: 'door-builder-lead-webhook', label: 'Leads & Webhook', icon: 'webhook', path: 'leads' },
  { id: 'marketing-tools', label: 'Marketing', icon: 'megaphone', path: 'marketing', access: 'credentials' },
  { id: 'crm-integrations', label: 'CRM', icon: 'crm', path: 'crm', access: 'credentials' },
  { id: 'website-address', label: 'Visualizer', icon: 'image', path: 'visualizer' },
  { id: 'dealer-users', label: 'Access', icon: 'users', path: 'access', access: 'users' },
]

const dealerSectionPaths = new Set(['', 'company', 'company/edit', 'branding', 'leads', 'marketing', 'crm', 'visualizer', 'access'])

export function dealerSectionHref(dealerId: string, path: string) {
  return path ? `/admin/dealers/${dealerId}/${path}` : `/admin/dealers/${dealerId}`
}

/** Path under /admin/dealers/:id, or null when the URL is not a dealer section. */
export function dealerSectionFromPathname(pathname: string, dealerId: string) {
  const prefix = `/admin/dealers/${dealerId}`
  if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) return null
  const rest = pathname.slice(prefix.length).replace(/^\//, '').replace(/\/$/, '')
  return dealerSectionPaths.has(rest) ? rest : null
}

export function restrictedDealerSectionNotes(access: {
  canManageDealerCredentials: boolean
  canManageDealerUsers: boolean
}): Array<{ id: string; title: string; requiredRole: string }> {
  const notes: Array<{ id: string; title: string; requiredRole: string }> = []
  if (!access.canManageDealerCredentials) {
    notes.push({
      id: 'marketing-and-crm',
      title: 'Marketing Tools and CRM Integrations',
      requiredRole: 'an access manager',
    })
  }
  if (!access.canManageDealerUsers) {
    notes.push({
      id: 'dealer-users',
      title: 'Dealer Users',
      requiredRole: 'an access manager or a billing admin',
    })
  }
  return notes
}

export function visibleDealerDetailSections(access: {
  canManageDealerCredentials: boolean
  canManageDealerUsers: boolean
}): DealerDetailSection[] {
  return dealerDetailSections.filter((section) => {
    if (section.access === 'credentials') return access.canManageDealerCredentials
    if (section.access === 'users') return access.canManageDealerUsers
    return true
  })
}

export function dealerDetailStickyOffset(headerHeight: number, navHeight: number, gap = dealerDetailSectionScrollGap) {
  return Math.max(0, Math.ceil(headerHeight) + Math.ceil(navHeight) + gap)
}

export function sectionScrollTop(sectionViewportTop: number, currentScrollTop: number, stickyOffset: number) {
  return Math.max(0, Math.round(sectionViewportTop + currentScrollTop - stickyOffset))
}

function findScrollParent(element: HTMLElement) {
  let parent = element.parentElement
  while (parent && parent !== document.body && parent !== document.documentElement) {
    const { overflowY } = getComputedStyle(parent)
    const scrolls = overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay'
    if (scrolls && parent.scrollHeight > parent.clientHeight + 1) return parent
    parent = parent.parentElement
  }
  return null
}

/** Scroll a dealer-page target below the sticky section nav and mobile header. */
export function scrollToDealerDetailTarget(target: HTMLElement) {
  const nav = document.querySelector<HTMLElement>('.dealer-detail-nav')
  const mobile = document.querySelector<HTMLElement>('.mobile-header')
  const headerHeight = mobile && getComputedStyle(mobile).display !== 'none' ? Math.ceil(mobile.getBoundingClientRect().height) : 0
  const offset = dealerDetailStickyOffset(headerHeight, Math.ceil(nav?.getBoundingClientRect().height ?? 0))
  const behavior: ScrollBehavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
  const scroller = findScrollParent(target)
  if (!scroller) {
    window.scrollTo({ top: sectionScrollTop(target.getBoundingClientRect().top, window.scrollY, offset), behavior })
    return
  }
  const portTop = scroller.getBoundingClientRect().top
  scroller.scrollTo({
    top: sectionScrollTop(target.getBoundingClientRect().top - portTop, scroller.scrollTop, offset),
    behavior,
  })
}

export function isScrollerAtEnd(scrollTop: number, clientHeight: number, scrollHeight: number) {
  return scrollTop + clientHeight >= scrollHeight - 2
}

export function resolveActiveSectionId(
  sections: readonly { id: string; top: number }[],
  stickyOffset: number,
  options: { atPageEnd: boolean; scrollTop: number },
): string | null {
  if (sections.length === 0) return null
  if (options.atPageEnd && options.scrollTop > 0) return sections[sections.length - 1].id
  const line = stickyOffset + 1
  let active = sections[0].id
  for (const section of sections) {
    if (section.top <= line) active = section.id
  }
  return active
}
