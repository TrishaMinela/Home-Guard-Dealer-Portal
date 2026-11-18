import { dealerSetupChecklist, type DealerSetupSource, type SetupStatus } from '../features/dealer-setup/checklist'

const labels: Record<SetupStatus, string> = {
  ready: 'Found on the dealer',
  'needs-info': 'Still needed',
  confirm: 'Confirm manually',
}

export function DealerSetupChecklist({ dealer }: { dealer: DealerSetupSource }) {
  const items = dealerSetupChecklist(dealer)
  return (
    <section className="content-card dealer-setup" id="setup" aria-labelledby="dealer-setup-title">
      <div className="content-card__header">
        <p className="eyebrow">Setup</p>
        <h2 id="dealer-setup-title">Dealer setup checklist</h2>
        <p>Items marked “Found on the dealer” come from information already saved. Items marked “Confirm manually” are not completed by this page.</p>
      </div>
      <ol className="dealer-setup__list">
        {items.map((item) => (
          <li key={item.id}>
            <span className={`status-badge ${item.status === 'ready' ? 'status-badge--active' : 'status-badge--inactive'}`}>{labels[item.status]}</span>
            <strong>{item.title}</strong>
            <p>{item.detail}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}
