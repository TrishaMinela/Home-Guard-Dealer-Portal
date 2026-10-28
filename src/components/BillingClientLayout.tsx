import { useState } from 'react'
import { Navigate, NavLink, Route, Routes } from 'react-router-dom'
import { AdminBillingPage } from '../pages/AdminBillingPage'
import { NavIcon } from './NavIcon'

type Props = {
  email: string
  accounts: Array<{ id: string; name: string }>
  signOutError: string
  onSignOut: () => Promise<void>
}

const links = [
  { label: 'Billing Overview', path: '/billing', icon: 'billing', end: true },
  { label: 'AI Usage Charges', path: '/billing/usage', icon: 'activity' },
  { label: 'Billing History', path: '/billing/history', icon: 'history' },
]

export function BillingClientLayout({ email, accounts, signOutError, onSignOut }: Props) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const page = <AdminBillingPage accounts={accounts} />
  return (
    <div className="portal-shell portal-shell--billing-client">
      <header className="mobile-header mobile-header--admin">
        <div className="brand-lockup brand-lockup--compact"><div className="brand-mark brand-mark--admin" aria-hidden="true">HG</div><span className="brand-name">Home Guard Billing</span></div>
        <button className="menu-button" type="button" aria-label="Open navigation" aria-expanded={isMenuOpen} onClick={() => setIsMenuOpen(true)}><span /><span /><span /></button>
      </header>
      <button className={`sidebar-overlay ${isMenuOpen ? 'is-visible' : ''}`} type="button" aria-label="Close navigation" onClick={() => setIsMenuOpen(false)} />
      <aside className={`sidebar sidebar--admin ${isMenuOpen ? 'is-open' : ''}`}>
        <div className="sidebar__brand">
          <div className="brand-lockup"><div className="brand-mark brand-mark--admin" aria-hidden="true">HG</div><div><span className="brand-name">Home Guard</span><span className="brand-subtitle">Billing</span></div></div>
          <button className="sidebar-close" type="button" aria-label="Close navigation" onClick={() => setIsMenuOpen(false)}>×</button>
        </div>
        <nav className="sidebar-nav" aria-label="Billing navigation">
          <span className="sidebar-nav__label">Billing</span>
          {links.map((link) => <NavLink key={link.path} end={link.end} to={link.path} className={({ isActive }) => `sidebar-nav__link ${isActive ? 'is-active' : ''}`} onClick={() => setIsMenuOpen(false)}><NavIcon name={link.icon} />{link.label}</NavLink>)}
        </nav>
        <div className="sidebar-account sidebar-account--admin">
          <div className="dealer-avatar dealer-avatar--admin" aria-hidden="true">B</div>
          <div className="sidebar-account__details"><strong>Billing Client</strong><span title={email}>{email}</span></div>
          {signOutError && <p className="message message--error">{signOutError}</p>}
          <button className="button button--secondary button--full" type="button" onClick={() => void onSignOut()}>Sign Out</button>
        </div>
      </aside>
      <main className="portal-main"><Routes><Route path="/billing" element={page} /><Route path="/billing/usage" element={page} /><Route path="/billing/history" element={page} /><Route path="*" element={<Navigate to="/billing" replace />} /></Routes></main>
    </div>
  )
}
