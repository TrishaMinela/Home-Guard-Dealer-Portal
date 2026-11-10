export type DealerDetailSectionAccess = 'credentials' | 'users'

export type DealerDetailSection = {
  id: string
  label: string
  access?: DealerDetailSectionAccess
}

export const dealerDetailSectionScrollGap = 12

export const dealerDetailSections: readonly DealerDetailSection[] = [
  { id: 'company-details', label: 'Company Details' },
  { id: 'branding', label: 'Branding' },
  { id: 'design', label: 'Typography & Design' },
  { id: 'marketing-tools', label: 'Marketing Tools', access: 'credentials' },
  { id: 'crm-integrations', label: 'CRM Integrations', access: 'credentials' },
  { id: 'dealer-users', label: 'Dealer Users / Access', access: 'users' },
]

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
