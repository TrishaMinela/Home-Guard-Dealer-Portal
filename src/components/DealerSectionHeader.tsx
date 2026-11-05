import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

type DealerSectionHeaderProps = {
  eyebrow: string
  title: string
  description: string
  headingId?: string
  actionLabel?: string
  actionTo?: string
  actionHref?: string
  actionIcon?: 'edit' | 'manage'
  onActionClick?: () => void
  trailing?: ReactNode
}

function SectionActionIcon({ icon }: { icon: 'edit' | 'manage' }) {
  return icon === 'manage' ? (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM19 8v6M22 11h-6" /></svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" /></svg>
  )
}

export function DealerSectionHeader({
  eyebrow,
  title,
  description,
  headingId,
  actionLabel,
  actionTo,
  actionHref,
  actionIcon = 'edit',
  onActionClick,
  trailing,
}: DealerSectionHeaderProps) {
  const actionContent = actionLabel ? <><SectionActionIcon icon={actionIcon} /><span>{actionLabel}</span></> : null
  return (
    <header className="dealer-section-header">
      <div className="dealer-section-header__copy">
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={headingId}>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="dealer-section-header__actions">
        {trailing}
        {actionTo && actionContent && <Link className="dealer-section-action" to={actionTo} aria-label={`${actionLabel}: ${title}`} onClick={onActionClick}>{actionContent}</Link>}
        {actionHref && actionContent && <a className="dealer-section-action" href={actionHref} aria-label={`${actionLabel}: ${title}`}>{actionContent}</a>}
      </div>
    </header>
  )
}
