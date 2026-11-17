import { useEffect, useRef, useState } from 'react'
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { useAdminData } from '../hooks/useAdminData'
import { useAdminNotifications, type PersistedAdminNotification } from '../hooks/useAdminNotifications'
import { useAiAdminIssues } from '../hooks/useAiAdminIssues'
import { AdminDashboardPage } from '../pages/AdminDashboardPage'
import { AddDealerPage } from '../pages/AddDealerPage'
import { AdminDealersPage } from '../pages/AdminDealersPage'
import { AdminLeadsPage } from '../pages/AdminLeadsPage'
import { AdminSettingsPage } from '../pages/AdminSettingsPage'
import { AdminAiUsagePage } from '../pages/AdminAiUsagePage'
import { AdminBillingPage } from '../pages/AdminBillingPage'
import { BillingAccessManagementPage } from '../pages/BillingAccessManagementPage'
import { AdminInventoryCategoryPage } from '../pages/AdminInventoryCategoryPage'
import { AdminInventoryPage } from '../pages/AdminInventoryPage'
import { AdminInventoryReviewPage } from '../pages/AdminInventoryReviewPage'
import { AdminDoorStylesPage } from '../pages/AdminDoorStylesPage'
import { AdminDoorStyleDetailPage } from '../pages/AdminDoorStyleDetailPage'
import { DealerDetailPage } from '../pages/DealerDetailPage'
import { AdminMarketingBannersPage } from '../pages/AdminMarketingBannersPage'
import { EditDealerPage } from '../pages/EditDealerPage'
import type { AdminDealer } from '../types/admin'
import { adminAccountInitial, adminRoleLabel } from './adminAccount'
import { NavIcon } from './NavIcon'
import { NotificationLauncher, type PortalNotification } from './NotificationLauncher'

const navigation: Array<{ label: string; path: string; icon: string; end?: boolean; internalOnly?: boolean; accessManagerOnly?: boolean }> = [
  { label: 'Dashboard', path: '/admin', icon: 'grid', end: true },
  { label: 'Dealers', path: '/admin/dealers', icon: 'building' },
  { label: 'All Leads', path: '/admin/leads', icon: 'users' },
  { label: 'Inventory', path: '/admin/inventory', icon: 'inventory' },
]

const drawerQuery = '(max-width: 960px)'
const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

type AdminLayoutProps = {
  email: string
  displayName?: string
  isInternalBillingAdmin: boolean
  isBillingAccessManager: boolean
  signOutError: string
  onSignOut: () => Promise<void>
}

function useDrawerLayout() {
  const [isDrawer, setIsDrawer] = useState(() => typeof window !== 'undefined' && window.matchMedia(drawerQuery).matches)

  useEffect(() => {
    const media = window.matchMedia(drawerQuery)
    const update = () => setIsDrawer(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  return isDrawer
}

export function AdminLayout({ email, displayName = '', isInternalBillingAdmin, isBillingAccessManager, signOutError, onSignOut }: AdminLayoutProps) {
  const location = useLocation()
  const isDrawer = useDrawerLayout()
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const sidebarRef = useRef<HTMLElement>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [trackedPath, setTrackedPath] = useState(location.pathname)
  const [trackedDrawer, setTrackedDrawer] = useState(isDrawer)
  if (trackedPath !== location.pathname || trackedDrawer !== isDrawer) {
    setTrackedPath(location.pathname)
    setTrackedDrawer(isDrawer)
    if (trackedPath !== location.pathname || !isDrawer) setIsMenuOpen(false)
  }
  const [isBillingNavOpen, setIsBillingNavOpen] = useState(() => location.pathname.startsWith('/admin/ai-usage') || location.pathname.startsWith('/admin/billing'))
  const [dealerSuccess, setDealerSuccess] = useState('')
  const [dealerDetailSuccess, setDealerDetailSuccess] = useState('')
  const adminData = useAdminData()
  const aiIssueState = useAiAdminIssues()
  const accountPrimary = displayName.trim() || email.trim()
  const accountRole = adminRoleLabel(isBillingAccessManager, isInternalBillingAdmin)
  const accountInitial = adminAccountInitial(accountPrimary)
  const visibleNavigation = navigation.filter((item) => (!item.internalOnly || isInternalBillingAdmin) && (!item.accessManagerOnly || isBillingAccessManager))
  const overviewItems = visibleNavigation.filter((item) => item.path === '/admin')
  const operationItems = visibleNavigation.filter((item) => item.path !== '/admin')
  const billingSectionActive = location.pathname.startsWith('/admin/ai-usage') || location.pathname.startsWith('/admin/billing')
  const allNotifications: PersistedAdminNotification[] = [
    ...aiIssueState.issues.map((issue) => ({
      id: `ai-issue-${issue.id}`,
      type: 'ai_issue' as const,
      title: issue.title,
      message: issue.admin_summary,
      actionLabel: 'View Issue',
      path: `/admin/ai-usage?issue=${issue.id}`,
      severity: issue.severity,
      occurredAt: issue.last_seen_at,
      occurrenceCount: issue.occurrence_count,
    })),
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

  useEffect(() => {
    if (!isDrawer || !isMenuOpen) return
    const sidebar = sidebarRef.current
    const restoreFocus = menuButtonRef.current
    closeButtonRef.current?.focus()
    document.body.classList.add('admin-drawer-open')

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        setIsMenuOpen(false)
        return
      }
      if (event.key !== 'Tab' || !sidebar) return
      const focusable = [...sidebar.querySelectorAll<HTMLElement>(focusableSelector)].filter((element) => !element.closest('[hidden]'))
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.classList.remove('admin-drawer-open')
      restoreFocus?.focus()
    }
  }, [isDrawer, isMenuOpen])

  function handleNotificationOpen(notification: PortalNotification) {
    const persistedNotification = allNotifications.find((item) => item.id === notification.id)
    if (persistedNotification?.receipt) notificationState.markAsRead(persistedNotification)
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

  function closeMenu() {
    setIsMenuOpen(false)
  }

  const drawerOpen = isDrawer && isMenuOpen

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
        <button
          ref={menuButtonRef}
          className="admin-menu"
          type="button"
          aria-label="Open navigation"
          aria-expanded={isMenuOpen}
          aria-controls="admin-sidebar"
          onClick={() => setIsMenuOpen(true)}
        >
          <span /><span /><span />
        </button>
      </header>

      {drawerOpen && (
        <button className="admin-sidebar__backdrop" type="button" aria-label="Close navigation" tabIndex={-1} onClick={closeMenu} />
      )}

      <aside
        ref={sidebarRef}
        className={`admin-sidebar ${isMenuOpen ? 'is-open' : ''}`}
        id="admin-sidebar"
        aria-label="Dealer Portal admin"
        role={drawerOpen ? 'dialog' : undefined}
        aria-modal={drawerOpen ? true : undefined}
        aria-hidden={isDrawer && !isMenuOpen ? true : undefined}
        inert={isDrawer && !isMenuOpen ? true : undefined}
      >
        <div className="admin-sidebar__header">
          <div className="admin-brand">
            <div className="brand-mark brand-mark--admin" aria-hidden="true">HG</div>
            <div className="admin-brand__copy">
              <span className="admin-brand__product" id="admin-sidebar-title">Dealer Portal</span>
              <span className="admin-brand__org">Home Guard</span>
            </div>
          </div>
          {isDrawer && (
            <button ref={closeButtonRef} className="admin-sidebar__close" type="button" aria-label="Close navigation" onClick={closeMenu}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6 18 18M18 6 6 18" /></svg>
            </button>
          )}
        </div>

        <nav className="admin-nav" aria-label="Home Guard Admin navigation">
          {overviewItems.length > 0 && (
            <div className="admin-nav__section">
              <h2 className="admin-nav__label">Overview</h2>
              {overviewItems.map((item) => (
                <NavLink className={({ isActive }) => `admin-nav__link ${isActive ? 'is-active' : ''}`} end={item.end} key={item.path} to={item.path} onClick={closeMenu}>
                  <NavIcon name={item.icon} />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          )}
          {operationItems.length > 0 && (
            <div className="admin-nav__section">
              <h2 className="admin-nav__label">Operations</h2>
              {operationItems.map((item) => (
                <NavLink className={({ isActive }) => `admin-nav__link ${isActive ? 'is-active' : ''}`} end={item.end} key={item.path} to={item.path} onClick={closeMenu}>
                  <NavIcon name={item.icon} />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          )}
          <div className="admin-nav__section">
            <h2 className="admin-nav__label">Billing</h2>
            <div className={`admin-nav__group ${billingSectionActive ? 'is-current' : ''}`}>
              <button className="admin-nav__toggle" type="button" aria-expanded={isBillingNavOpen} aria-controls="billing-navigation" onClick={() => setIsBillingNavOpen((open) => !open)}>
                <NavIcon name="billing" />
                <span>AI Usage &amp; Billing</span>
                <svg className="admin-nav__chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
              </button>
              <div className="admin-nav__children" id="billing-navigation" hidden={!isBillingNavOpen}>
                <NavLink className={({ isActive }) => `admin-nav__child ${isActive ? 'is-active' : ''}`} to="/admin/ai-usage" onClick={closeMenu}>AI Usage</NavLink>
                {isInternalBillingAdmin && <NavLink className={({ isActive }) => `admin-nav__child ${isActive ? 'is-active' : ''}`} end to="/admin/billing" onClick={closeMenu}>Billing</NavLink>}
                {(isBillingAccessManager || isInternalBillingAdmin) && <NavLink className={({ isActive }) => `admin-nav__child ${isActive ? 'is-active' : ''}`} to="/admin/billing/access" onClick={closeMenu}>Billing Access</NavLink>}
              </div>
            </div>
          </div>
          <div className="admin-nav__section">
            <h2 className="admin-nav__label">System</h2>
            <NavLink className={({ isActive }) => `admin-nav__link ${isActive ? 'is-active' : ''}`} to="/admin/settings" onClick={closeMenu}><NavIcon name="settings" /><span>Settings</span></NavLink>
          </div>
        </nav>

        <footer className="admin-account">
          <div className="admin-account__row">
            <span className="admin-account__avatar" aria-hidden="true">{accountInitial || '·'}</span>
            <div className="admin-account__meta">
              <strong title={email || undefined}>{accountPrimary || 'Signed in'}</strong>
              <span title={accountRole}>{accountRole}</span>
            </div>
          </div>
          {signOutError && <p className="message message--error" role="alert">{signOutError}</p>}
          <button className="admin-account__signout" type="button" onClick={() => void onSignOut()}>Sign Out</button>
        </footer>
      </aside>

      <main className="portal-main" inert={drawerOpen ? true : undefined}>
        <Routes>
          <Route
            path="/admin"
            element={
              <AdminDashboardPage
                {...adminData}
                notifications={notificationState.notifications}
                notificationsLoading={notificationState.isLoading || aiIssueState.isLoading}
                notificationError={notificationState.error || aiIssueState.error}
                aiIssues={aiIssueState.issues}
                aiIssuesLoading={aiIssueState.isLoading}
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
                canManageDealerUsers={isBillingAccessManager || isInternalBillingAdmin}
                canManageDealerCredentials={isBillingAccessManager}
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
          <Route path="/admin/marketing-banners" element={<AdminMarketingBannersPage dealers={adminData.dealers} />} />
          <Route path="/admin/leads/:leadId?" element={<AdminLeadsPage {...adminData} />} />
          <Route path="/admin/ai-usage" element={<AdminAiUsagePage showInternalDetails={isInternalBillingAdmin} />} />
          <Route path="/admin/billing" element={isInternalBillingAdmin ? <AdminBillingPage showInternalDetails /> : <Navigate to="/admin" replace />} />
          <Route path="/admin/billing/access" element={(isBillingAccessManager || isInternalBillingAdmin) ? <BillingAccessManagementPage canManageAdministrators={isBillingAccessManager} /> : <Navigate to="/admin" replace />} />
          <Route path="/admin/inventory" element={<AdminInventoryPage />} />
          <Route path="/admin/inventory/review" element={<AdminInventoryReviewPage />} />
          <Route path="/admin/inventory/door-styles" element={<AdminDoorStylesPage />} />
          <Route path="/admin/inventory/door-styles/:styleId" element={<AdminDoorStyleDetailPage />} />
          <Route path="/admin/inventory/:category" element={<AdminInventoryCategoryPage />} />
          <Route
            path="/admin/settings"
            element={<AdminSettingsPage />}
          />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </main>
      <NotificationLauncher
        notifications={notificationState.notifications}
        error={notificationState.error || aiIssueState.error}
        onNotificationOpen={handleNotificationOpen}
      />
    </div>
  )
}
