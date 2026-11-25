import { NavLink } from 'react-router-dom'
import { DealerOutlineIcon } from './DealerOutlineIcon'
import { dealerSectionHref, visibleDealerDetailSections } from './dealerDetailSections'

type DealerDetailSectionNavProps = {
  dealerId: string
  canManageDealerCredentials: boolean
  canManageDealerUsers: boolean
}

export function DealerDetailSectionNav({
  dealerId,
  canManageDealerCredentials,
  canManageDealerUsers,
}: DealerDetailSectionNavProps) {
  const sections = visibleDealerDetailSections({ canManageDealerCredentials, canManageDealerUsers })

  return (
    <nav className="dealer-detail-nav" aria-label="Dealer management sections">
      {sections.map((section) => (
        <NavLink
          key={section.id}
          to={dealerSectionHref(dealerId, section.path)}
          end={section.path === ''}
        >
          <DealerOutlineIcon name={section.icon} />
          <span>{section.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
