import { useState } from 'react'
import { Navigate, NavLink, Route, Routes } from 'react-router-dom'
import { DashboardPage } from '../pages/DashboardPage'
import { PlaceholderPage } from '../pages/PlaceholderPage'

const navigation = [
  { label: 'Dashboard', path: '/dashboard', icon: 'grid' },
  { label: 'Leads', path: '/leads', icon: 'users' },
  { label: 'Marketing Tools', path: '/marketing', icon: 'megaphone' },
  { label: 'Company Profile', path: '/company', icon: 'building' },
  { label: 'Settings', path: '/settings', icon: 'settings' },
]

type PortalLayoutProps = {
  dealerName: string
  email: string
  signOutError: string
  onSignOut: () => Promise<void>
}

type NavIconProps = {
  name: string
}

function NavIcon({ name }: NavIconProps) {
  const paths: Record<string, React.ReactNode> = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    megaphone: (
      <>
        <path d="m3 11 18-5v12L3 14v-3Z" />
        <path d="M11.6 16.2 13 21H7l-1.5-6" />
      </>
    ),
    building: (
      <>
        <path d="M3 21h18M6 21V5l6-2v18M18 21V9l-6-2" />
        <path d="M9 8v1M9 12v1M9 16v1M15 12v1M15 16v1" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1 1.55V21h-4v-.08A1.7 1.7 0 0 0 9 19.37a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.63 15a1.7 1.7 0 0 0-1.55-1H3v-4h.08A1.7 1.7 0 0 0 4.63 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.63a1.7 1.7 0 0 0 1-1.55V3h4v.08A1.7 1.7 0 0 0 15 4.63a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.37 9a1.7 1.7 0 0 0 1.55 1H21v4h-.08a1.7 1.7 0 0 0-1.52 1Z" />
      </>
    ),
  }

  return (
    <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
      {paths[name]}
    </svg>
  )
}

export function PortalLayout({
  dealerName,
  email,
  signOutError,
  onSignOut,
}: PortalLayoutProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  return (
    <div className="portal-shell">
      <header className="mobile-header">
        <div className="brand-lockup brand-lockup--compact">
          <div className="brand-mark" aria-hidden="true">
            HG
          </div>
          <span className="brand-name">Dealer Portal</span>
        </div>
        <button
          className="menu-button"
          type="button"
          aria-label="Open navigation"
          aria-expanded={isMenuOpen}
          onClick={() => setIsMenuOpen(true)}
        >
          <span />
          <span />
          <span />
        </button>
      </header>

      <button
        className={`sidebar-overlay ${isMenuOpen ? 'is-visible' : ''}`}
        type="button"
        aria-label="Close navigation"
        onClick={() => setIsMenuOpen(false)}
      />

      <aside className={`sidebar ${isMenuOpen ? 'is-open' : ''}`}>
        <div className="sidebar__brand">
          <div className="brand-lockup">
            <div className="brand-mark" aria-hidden="true">
              HG
            </div>
            <div>
              <span className="brand-name">Home Guard</span>
              <span className="brand-subtitle">Dealer Portal</span>
            </div>
          </div>
          <button
            className="sidebar-close"
            type="button"
            aria-label="Close navigation"
            onClick={() => setIsMenuOpen(false)}
          >
            ×
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Portal navigation">
          <span className="sidebar-nav__label">Menu</span>
          {navigation.map((item) => (
            <NavLink
              className={({ isActive }) =>
                `sidebar-nav__link ${isActive ? 'is-active' : ''}`
              }
              key={item.path}
              to={item.path}
              onClick={() => setIsMenuOpen(false)}
            >
              <NavIcon name={item.icon} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-account">
          <div className="dealer-avatar" aria-hidden="true">
            {dealerName.charAt(0).toUpperCase()}
          </div>
          <div className="sidebar-account__details">
            <strong>{dealerName}</strong>
            <span title={email}>{email}</span>
          </div>
          {signOutError && (
            <p className="message message--error">{signOutError}</p>
          )}
          <button
            className="button button--secondary button--full"
            type="button"
            onClick={() => void onSignOut()}
          >
            Sign Out
          </button>
        </div>
      </aside>

      <main className="portal-main">
        <Routes>
          <Route path="/dashboard" element={<DashboardPage dealerName={dealerName} />} />
          <Route path="/leads" element={<PlaceholderPage title="Leads" />} />
          <Route
            path="/marketing"
            element={<PlaceholderPage title="Marketing Tools" />}
          />
          <Route
            path="/company"
            element={<PlaceholderPage title="Company Profile" />}
          />
          <Route path="/settings" element={<PlaceholderPage title="Settings" />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  )
}
