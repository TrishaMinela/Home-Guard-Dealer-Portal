import type { MouseEvent } from 'react'
import { scrollToDealerDetailTarget } from './dealerDetailSections'
import { dealerSetupChecklist, dealerSetupDestination, type DealerSetupSource, type SetupDestination, type SetupStatus } from '../features/dealer-setup/checklist'

const labels: Record<SetupStatus, string> = {
  ready: 'Found on the dealer',
  'needs-info': 'Still needed',
  confirm: 'Confirm manually',
}

function revealTarget(destination: SetupDestination) {
  const target = document.getElementById(destination.anchorId) ?? (destination.fallbackAnchorId ? document.getElementById(destination.fallbackAnchorId) : null)
  if (!target) return
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1')
  window.dispatchEvent(new CustomEvent('dealer-detail-section', { detail: { sectionId: destination.sectionId } }))
  scrollToDealerDetailTarget(target)
  target.classList.remove('dealer-setup-target')
  void target.offsetWidth
  target.classList.add('dealer-setup-target')
  window.setTimeout(() => target.classList.remove('dealer-setup-target'), 1800)
  target.focus({ preventScroll: true })
  const hash = `#${target.id}`
  if (window.location.hash !== hash) window.history.pushState(null, '', hash)
}

function destinationHref(destination: SetupDestination, dealerId?: string) {
  if (destination.editFocusId && dealerId) return `/admin/dealers/${dealerId}/edit#${destination.editFocusId}`
  return `#${destination.anchorId}`
}

export function DealerSetupChecklist({ dealer, dealerId }: { dealer: DealerSetupSource; dealerId?: string }) {
  const items = dealerSetupChecklist(dealer)

  function openDestination(event: MouseEvent<HTMLAnchorElement>, destination: SetupDestination) {
    if (destination.editFocusId && dealerId) return
    event.preventDefault()
    revealTarget(destination)
  }

  return (
    <section className="content-card dealer-setup" id="setup" aria-labelledby="dealer-setup-title">
      <div className="content-card__header">
        <p className="eyebrow">Setup</p>
        <h2 id="dealer-setup-title">Dealer setup checklist</h2>
        <p>Items marked “Found on the dealer” come from information already saved. Items marked “Confirm manually” are not completed by this page. Opening a row does not mark it complete.</p>
      </div>
      <ol className="dealer-setup__list">
        {items.map((item) => {
          const destination = dealerSetupDestination(item.id)
          const body = (
            <>
              <span className={`status-badge ${item.status === 'ready' ? 'status-badge--active' : 'status-badge--inactive'}`}>{labels[item.status]}</span>
              <strong>{item.title}</strong>
              <p>{item.detail}{destination ? '' : ' There is no portal screen for this step, so it stays a manual confirmation.'}</p>
            </>
          )
          return (
            <li key={item.id}>
              {destination ? (
                <a
                  className="dealer-setup__link"
                  href={destinationHref(destination, dealerId)}
                  aria-label={`Go to ${destination.tabLabel}: ${destination.targetLabel}`}
                  onClick={(event) => openDestination(event, destination)}
                >
                  {body}
                </a>
              ) : (
                <div className="dealer-setup__static">{body}</div>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
