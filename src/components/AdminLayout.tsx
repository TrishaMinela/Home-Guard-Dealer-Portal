import { useState } from 'react'
import { Navigate, NavLink, Route, Routes } from 'react-router-dom'
import { useAdminData } from '../hooks/useAdminData'
import { useAdminNotifications, type PersistedAdminNotification } from '../hooks/useAdminNotifications'
import { AdminDashboardPage } from '../pages/AdminDashboardPage'
import { AddDealerPage } from '../pages/AddDealerPage'
import { AdminDealersPage } from '../pages/AdminDealersPage'
import { AdminLeadsPage } from '../pages/AdminLeadsPage'
import { AdminSettingsPage } from '../pages/AdminSettingsPage'
import { DealerDetailPage } from '../pages/DealerDetailPage'
import { EditDealerPage } from '../pages/EditDealerPage'
import type { AdminDealer } from '../types/admin'
import { NavIcon } from './NavIcon'
import { NotificationLauncher, type PortalNotification } from './NotificationLauncher'

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
  const [dealerSuccess, setDealerSuccess] = useState('')
  const [dealerDetailSuccess, setDealerDetailSuccess] = useState('')
  const adminData = useAdminData()
  const allNotifications: PersistedAdminNotification[] = [
    ...adminData.dealers
      .filter((dealer) => dealer.slug_request_status === 'pending' && dealer.requested_slug)
      .map((dealer) => ({
        id: `slug-${dealer.id}`,
        type: 'request' as const,
        title: 'Visualizer URL request',
        message: `${dealer.company_name} requested /${dealer.requested_slug}`,
        actionLabel: 'View Request',
        path: `/admin/dealers/${dealer.id}`,
        receipt: {
          notificationType: 'slug_request' as const,
          sourceId: dealer.id,
          sourceVersion: dealer.slug_requested_at ?? dealer.requested_slug ?? '',
        },
      })),
    ...adminData.leads
      .filter((lead) => lead.status.trim().toLowerCase() === 'new')
      .map((lead) => ({
        id: `lead-${lead.id}`,
        type: 'lead' as const,
        title: 'New Lead',
        message: `${lead.first_name} ${lead.last_name} submitted a request`,
        actionLabel: 'View Lead',
        path: `/admin/leads/${lead.id}`,
        receipt: {
          notificationType: 'lead' as const,
          sourceId: lead.id,
          sourceVersion: '',
        },
      })),
  ]
  const notificationState = useAdminNotifications(allNotifications)

  function handleNotificationOpen(notification: PortalNotification) {
    const persistedNotification = allNotifications.find((item) => item.id === notification.id)
    if (persistedNotification) notificationState.markAsRead(persistedNotification)
  }

  function handleDealerCreated(companyName: string) {
    adminData.refresh()
    setDealerSuccess(`${companyName} was added successfully.`)
  }

  function handleDealerSaved(dealer: AdminDealer) {
    adminData.replaceDealer(dealer)
    setDealerDetailSuccess(`${dealer.company_name} was updated successfully.`)
  }

  function handleDealerDetailUpdated(dealer: AdminDealer, message: string) {
    adminData.replaceDealer(dealer)
    setDealerDetailSuccess(message)
  }

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
          <Route
            path="/admin"
            element={
              <AdminDashboardPage
                {...adminData}
                notifications={notificationState.notifications}
                notificationsLoading={notificationState.isLoading}
                notificationError={notificationState.error}
                onNotificationOpen={notificationState.markAsRead}
              />
            }
          />
          <Route
            path="/admin/dealers"
            element={
              <AdminDealersPage
                {...adminData}
                successMessage={dealerSuccess}
                onClearSuccess={() => setDealerSuccess('')}
              />
            }
          />
          <Route
            path="/admin/dealers/new"
            element={<AddDealerPage onCreated={handleDealerCreated} />}
          />
          <Route
            path="/admin/dealers/:dealerId"
            element={
              <DealerDetailPage
                dealers={adminData.dealers}
                isLoading={adminData.isLoading}
                error={adminData.error}
                successMessage={dealerDetailSuccess}
                onDealerUpdated={handleDealerDetailUpdated}
                onClearSuccess={() => setDealerDetailSuccess('')}
              />
            }
          />
          <Route
            path="/admin/dealers/:dealerId/edit"
            element={
              <EditDealerPage
                dealers={adminData.dealers}
                isLoading={adminData.isLoading}
                error={adminData.error}
                onSaved={handleDealerSaved}
              />
            }
          />
          <Route path="/admin/leads/:leadId?" element={<AdminLeadsPage {...adminData} />} />
          <Route
            path="/admin/settings"
            element={<AdminSettingsPage />}
          />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </main>
      <NotificationLauncher
        notifications={notificationState.notifications}
        error={notificationState.error}
        onNotificationOpen={handleNotificationOpen}
      />
    </div>
  )
}
