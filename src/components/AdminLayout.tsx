import { useState } from 'react'
import { Navigate, NavLink, Route, Routes } from 'react-router-dom'
import { useAdminData } from '../hooks/useAdminData'
import { AdminDashboardPage } from '../pages/AdminDashboardPage'
import { AdminDealersPage } from '../pages/AdminDealersPage'
import { AdminLeadsPage } from '../pages/AdminLeadsPage'
import { PlaceholderPage } from '../pages/PlaceholderPage'
import { NavIcon } from './NavIcon'

const navigation = [
  { label: 'Dashboard', path: '/admin', icon: 'grid', end: true },
  { label: 'Dealers', path: '/admin/dealers', icon: 'building' },
  { label: 'All Leads', path: '/admin/leads', icon: 'users' },
  { label: 'Settings', path: '/admin/settings', icon: 'settings' },
]

type AdminLayoutProps = {
  email: string
  signOutError: string
  onSignOut: () => Promise<void>
}

export function AdminLayout({ email, signOutError, onSignOut }: AdminLayoutProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const adminData = useAdminData()

  return (
    <div className="portal-shell portal-shell--admin">
      <header className="mobile-header mobile-header--admin">
        <div className="brand-lockup brand-lockup--compact">
          <div className="brand-mark brand-mark--admin" aria-hidden="true">HG</div>
          <span className="brand-name">Home Guard Admin</span>
        </div>
        <button
          className="menu-button"
          type="button"
          aria-label="Open navigation"
          aria-expanded={isMenuOpen}
          onClick={() => setIsMenuOpen(true)}
        >
          <span /><span /><span />
        </button>
      </header>

      <button
        className={`sidebar-overlay ${isMenuOpen ? 'is-visible' : ''}`}
        type="button"
        aria-label="Close navigation"
        onClick={() => setIsMenuOpen(false)}
      />

      <aside className={`sidebar sidebar--admin ${isMenuOpen ? 'is-open' : ''}`}>
        <div className="sidebar__brand">
          <div className="brand-lockup">
            <div className="brand-mark brand-mark--admin" aria-hidden="true">HG</div>
            <div>
              <span className="brand-name">Home Guard</span>
              <span className="brand-subtitle">Admin</span>
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

        <nav className="sidebar-nav" aria-label="Home Guard Admin navigation">
          <span className="sidebar-nav__label">Administration</span>
          {navigation.map((item) => (
            <NavLink
              className={({ isActive }) => `sidebar-nav__link ${isActive ? 'is-active' : ''}`}
              end={item.end}
              key={item.path}
              to={item.path}
              onClick={() => setIsMenuOpen(false)}
            >
              <NavIcon name={item.icon} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-account sidebar-account--admin">
          <div className="dealer-avatar dealer-avatar--admin" aria-hidden="true">A</div>
          <div className="sidebar-account__details">
            <strong>Home Guard Admin</strong>
            <span title={email}>{email}</span>
          </div>
          {signOutError && <p className="message message--error">{signOutError}</p>}
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
          <Route path="/admin" element={<AdminDashboardPage {...adminData} />} />
          <Route path="/admin/dealers" element={<AdminDealersPage {...adminData} />} />
          <Route path="/admin/leads" element={<AdminLeadsPage {...adminData} />} />
          <Route
            path="/admin/settings"
            element={<PlaceholderPage title="Settings" eyebrow="Home Guard Admin" />}
          />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </main>
    </div>
  )
}
