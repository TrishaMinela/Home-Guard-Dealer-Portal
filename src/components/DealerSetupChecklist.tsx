import type { MouseEvent } from 'react'
import { dealerSetupChecklist, dealerSetupDestination, type DealerSetupSource, type SetupDestination, type SetupStatus } from '../features/dealer-setup/checklist'
import { scrollToDealerDetailTarget } from './dealerDetailSections'
import { DealerCardIcon, DealerOutlineIcon } from './DealerOutlineIcon'

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
  if (destination.studioSection && dealerId) return `/admin/dealers/${dealerId}/branding?section=${destination.studioSection}`
  if (destination.editFocusId && dealerId) return `/admin/dealers/${dealerId}/edit#${destination.editFocusId}`
  return `#${destination.anchorId}`
}

export function DealerSetupChecklist({ dealer, dealerId }: { dealer: DealerSetupSource; dealerId?: string }) {
  const items = dealerSetupChecklist(dealer)
  const completeCount = items.filter((item) => item.status === 'ready').length
  const rows = Math.ceil(items.length / 2)
  const progress = items.length === 0 ? 0 : Math.round((completeCount / items.length) * 100)

  function openDestination(event: MouseEvent<HTMLAnchorElement>, destination: SetupDestination) {
    if ((destination.studioSection || destination.editFocusId) && dealerId) return
    event.preventDefault()
    revealTarget(destination)
  }

  return (
    <section className="content-card dealer-setup" id="setup" aria-labelledby="dealer-setup-title">
      <header className="dealer-section-header dealer-setup__header">
        <DealerCardIcon name="clipboard" />
        <div className="dealer-section-header__copy">
          <h2 id="dealer-setup-title">Setup Checklist</h2>
          <p>Complete the key configuration steps to finish setting up this dealer.</p>
          <p className="dealer-setup__note">Items marked “Found on the dealer” come from information already saved. Items marked “Confirm manually” are not completed by this page. Opening a row does not mark it complete.</p>
        </div>
        <div className="dealer-setup__progress">
          <span id="dealer-setup-progress-label">{completeCount} of {items.length} complete</span>
          <div
            className="dealer-setup__track"
            role="progressbar"
            aria-labelledby="dealer-setup-progress-label"
            aria-valuenow={completeCount}
            aria-valuemin={0}
            aria-valuemax={items.length}
          >
            <span style={{ width: `${progress}%` }} />
          </div>
        </div>
      </header>
      <ol className="dealer-setup__list" style={{ gridTemplateRows: `repeat(${rows}, auto)` }}>
        {items.map((item) => {
          const destination = dealerSetupDestination(item.id)
          const done = item.status === 'ready'
          const body = (
            <>
              <span className={`dd-check${done ? ' dd-check--ready' : ''}`} aria-hidden="true">
                {done ? <DealerOutlineIcon name="check" /> : null}
              </span>
              <span className="dealer-setup__copy">
                <strong>{item.title}</strong>
                <span className="sr-only">{labels[item.status]}. </span>
                <p>{item.detail}{destination ? '' : ' There is no portal screen for this step, so it stays a manual confirmation.'}</p>
              </span>
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
