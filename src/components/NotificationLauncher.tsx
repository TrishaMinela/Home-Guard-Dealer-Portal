import { useState } from 'react'
import { Link } from 'react-router-dom'

export type PortalNotification = {
  id: string
  type: 'request' | 'lead'
  title: string
  message: string
  actionLabel: string
  path: string
}

type NotificationLauncherProps = {
  notifications: PortalNotification[]
}

function BellIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </svg>
  )
}

export function NotificationLauncher({ notifications }: NotificationLauncherProps) {
  const [isOpen, setIsOpen] = useState(false)
  const count = notifications.length
  const badgeLabel = count > 99 ? '99+' : String(count)

  return (
    <div className="notification-launcher">
      {isOpen && (
        <aside className="notification-drawer" aria-labelledby="notification-drawer-title">
          <div className="notification-drawer__header">
            <div>
              <p className="eyebrow">Activity</p>
              <h2 id="notification-drawer-title">Notifications</h2>
            </div>
            <button
              className="notification-drawer__close"
              type="button"
              aria-label="Close notifications"
              onClick={() => setIsOpen(false)}
            >
              ×
            </button>
          </div>

          {count === 0 ? (
            <div className="notification-drawer__empty">No new notifications.</div>
          ) : (
            <div className="notification-drawer__list">
              {notifications.map((notification) => (
                <article className="notification-drawer__item" key={notification.id}>
                  <div className={`notification-icon notification-icon--${notification.type}`} aria-hidden="true">
                    {notification.type === 'request' ? 'URL' : 'Lead'}
                  </div>
                  <div className="notification-copy">
                    <p>{notification.title}</p>
                    <strong>{notification.message}</strong>
                    <Link to={notification.path} onClick={() => setIsOpen(false)}>
                      {notification.actionLabel}
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </aside>
      )}

      <button
        className="notification-bell"
        type="button"
        aria-label={isOpen ? 'Close notifications' : `Open notifications${count ? `, ${count} new` : ''}`}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <BellIcon />
        {count > 0 && <span className="notification-badge">{badgeLabel}</span>}
      </button>
    </div>
  )
}
