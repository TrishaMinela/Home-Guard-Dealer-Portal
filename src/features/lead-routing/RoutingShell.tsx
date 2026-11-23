import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

const drawerQuery = '(max-width: 960px)'

export function RoutingShell({
  email,
  role,
  links,
  children,
  onSignOut,
}: {
  email: string
  role: string
  links: Array<{ to: string; label: string; end?: boolean }>
  children: ReactNode
  onSignOut?: () => void
}) {
  const [isDrawer, setIsDrawer] = useState(() => typeof window !== 'undefined' && window.matchMedia(drawerQuery).matches)
  const [open, setOpen] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const media = window.matchMedia(drawerQuery)
    const update = () => setIsDrawer(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    if (!isDrawer || !open) return
    closeRef.current?.focus()
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isDrawer, open])
  const drawerOpen = isDrawer && open
  return (
    <div className="portal-shell portal-shell--admin">
      <header className="admin-topbar">
        <div className="admin-brand admin-brand--bar">
          <div className="brand-mark brand-mark--admin" aria-hidden="true">HG</div>
          <div className="admin-brand__copy">
            <span className="admin-brand__product">Dealer Portal</span>
            <span className="admin-brand__org">Home Guard</span>
          </div>
        </div>
        <button className="admin-menu" type="button" aria-label="Open navigation" aria-expanded={open} aria-controls="lead-routing-sidebar" onClick={() => setOpen(true)}>
          <span /><span /><span />
        </button>
      </header>
      {drawerOpen && <button className="admin-sidebar__backdrop" type="button" aria-label="Close navigation" onClick={() => setOpen(false)} />}
      <aside className={`admin-sidebar ${open ? 'is-open' : ''}`} id="lead-routing-sidebar" aria-label="Lead routing">
        <div className="admin-sidebar__header">
          <div className="admin-brand">
            <div className="brand-mark brand-mark--admin" aria-hidden="true">HG</div>
            <div className="admin-brand__copy">
              <span className="admin-brand__product">Dealer Portal</span>
              <span className="admin-brand__org">Home Guard</span>
            </div>
          </div>
          {isDrawer && <button ref={closeRef} className="admin-sidebar__close" type="button" aria-label="Close navigation" onClick={() => setOpen(false)}>×</button>}
        </div>
        <nav className="admin-nav" aria-label="Lead routing navigation">
          <div className="admin-nav__section">
            <h2 className="admin-nav__label">Lead routing</h2>
            {links.map((link) => (
              <NavLink key={link.to} className={({ isActive }) => `admin-nav__link ${isActive ? 'is-active' : ''}`} end={link.end} to={link.to} onClick={() => setOpen(false)}>{link.label}</NavLink>
            ))}
          </div>
        </nav>
        <footer className="admin-account">
          <div className="admin-account__row">
            <span className="admin-account__avatar" aria-hidden="true">{email.slice(0, 1).toUpperCase()}</span>
            <div className="admin-account__meta">
              <strong>{email}</strong>
              <span>{role}</span>
            </div>
          </div>
          {onSignOut && <button className="admin-account__signout" type="button" onClick={onSignOut}>Sign Out</button>}
        </footer>
      </aside>
      <main className="portal-main">
        <div className="page-content">{children}</div>
      </main>
    </div>
  )
}
