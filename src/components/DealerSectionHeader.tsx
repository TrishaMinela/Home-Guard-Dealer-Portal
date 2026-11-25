import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { DealerCardIcon, DealerOutlineIcon } from './DealerOutlineIcon'

type DealerSectionHeaderProps = {
  eyebrow: string
  title: string
  description: string
  headingId?: string
  icon?: string
  compact?: boolean
  actionLabel?: string
  actionTo?: string
  actionHref?: string
  actionIcon?: 'edit' | 'manage' | 'external'
  actionTone?: 'outline' | 'primary'
  onActionClick?: () => void
  trailing?: ReactNode
}

function SectionActionIcon({ icon }: { icon: 'edit' | 'manage' | 'external' }) {
  const name = icon === 'manage' ? 'users' : icon === 'external' ? 'external' : 'pencil'
  return <DealerOutlineIcon name={name} />
}

export function DealerSectionHeader({
  eyebrow,
  title,
  description,
  headingId,
  icon,
  compact = false,
  actionLabel,
  actionTo,
  actionHref,
  actionIcon = 'edit',
  actionTone = 'outline',
  onActionClick,
  trailing,
}: DealerSectionHeaderProps) {
  const actionContent = actionLabel ? <><SectionActionIcon icon={actionIcon} /><span>{actionLabel}</span></> : null
  const actionClass = actionTone === 'primary' ? 'button button--primary dd-text-button' : 'dealer-section-action'
  return (
    <header className={`dealer-section-header${compact ? ' dealer-section-header--compact' : ''}`}>
      {icon ? <DealerCardIcon name={icon} /> : null}
      <div className="dealer-section-header__copy">
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={headingId}>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="dealer-section-header__actions">
        {trailing}
        {actionTo && actionContent && <Link className={actionClass} to={actionTo} aria-label={`${actionLabel}: ${title}`} onClick={onActionClick}>{actionContent}</Link>}
        {actionHref && actionContent && <a className={actionClass} href={actionHref} aria-label={`${actionLabel}: ${title}`}>{actionContent}</a>}
      </div>
    </header>
  )
}
