import { useState } from 'react'
import { Navigate, NavLink, Route, Routes } from 'react-router-dom'
import { useLeads } from '../hooks/useLeads'
import { DashboardPage } from '../pages/DashboardPage'
import { LeadsPage } from '../pages/LeadsPage'
import { DealerCompanyProfilePage } from '../pages/DealerCompanyProfilePage'
import { PlaceholderPage } from '../pages/PlaceholderPage'
import type { DealerAccount } from '../types/account'
import { NavIcon } from './NavIcon'
import { NotificationLauncher, type PortalNotification } from './NotificationLauncher'

const navigation = [
  { label: 'Dashboard', path: '/dashboard', icon: 'grid' },
  { label: 'Leads', path: '/leads', icon: 'users' },
  { label: 'Marketing Tools', path: '/marketing', icon: 'megaphone' },
  { label: 'Company Profile', path: '/company', icon: 'building' },
  { label: 'Settings', path: '/settings', icon: 'settings' },
]

type PortalLayoutProps = {
  dealer: DealerAccount
  email: string
  signOutError: string
  onSignOut: () => Promise<void>
  onDealerUpdated: (dealer: DealerAccount) => void
}

export function PortalLayout({
  dealer,
  email,
  signOutError,
  onSignOut,
  onDealerUpdated,
}: PortalLayoutProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const leadData = useLeads()
  const notifications: PortalNotification[] = leadData.leads
    .filter((lead) => lead.status.trim().toLowerCase() === 'new')
    .map((lead) => ({
      id: `lead-${lead.id}`,
      type: 'lead',
      title: 'New Lead',
      message: `${lead.first_name} ${lead.last_name} submitted a request`,
      actionLabel: 'View Lead',
      path: '/leads',
    }))

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
            {dealer.company_name.charAt(0).toUpperCase()}
          </div>
          <div className="sidebar-account__details">
            <strong>{dealer.company_name}</strong>
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
          <Route
            path="/dashboard"
            element={<DashboardPage dealerName={dealer.company_name} {...leadData} />}
          />
          <Route path="/leads" element={<LeadsPage {...leadData} />} />
          <Route
            path="/marketing"
            element={<PlaceholderPage title="Marketing Tools" />}
          />
          <Route
            path="/company"
            element={
              <DealerCompanyProfilePage
                dealer={dealer}
                onDealerUpdated={onDealerUpdated}
              />
            }
          />
          <Route path="/settings" element={<PlaceholderPage title="Settings" />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
      <NotificationLauncher notifications={notifications} />
    </div>
  )
}
