import './lead-routing.css'
import { statusLabel, type ReviewModel } from './types'

export function LeadReviewPage({
  review,
  accessDenied,
  notice,
  sending,
  onSend,
  onRepropose,
}: {
  review: ReviewModel | null
  accessDenied?: boolean
  notice?: string
  sending?: boolean
  onSend?: () => void
  onRepropose?: () => void
}) {
  if (accessDenied || !review) {
    return (
      <div className="lr-page">
        <p className="lr-kicker">Lead review</p>
        <h1>This lead is unavailable</h1>
        <div className="lr-denied" role="alert">
          <strong>You do not have access to this lead.</strong>
          <p>Review links require you to sign in as the assigned salesperson or a Home Guard admin. A forwarded link does not grant access.</p>
        </div>
      </div>
    )
  }
  const canSend = (review.status === 'awaiting_approval' || review.status === 'notification_failed') && review.dealerActive && Boolean(review.dealerId)
  const needsReproposal = review.status === 'blocked_dealer_inactive' || !review.dealerActive
  return (
    <div className="lr-page">
      <header>
        <p className="lr-kicker">Lead review</p>
        <h1>{review.name}</h1>
        <p className="lr-intro">ZIP {review.zip}. {statusLabel(review.status)}. No dealer email is sent until you click Send Notification.</p>
      </header>
      {notice && <p className="lr-note" role="status">{notice}</p>}
      <div className="lr-review">
        <section className="lr-card">
          <h2>Homeowner</h2>
          <dl>
            <div><dt>Email</dt><dd>{review.email}</dd></div>
            <div><dt>Phone</dt><dd>{review.phone || 'Not provided'}</dd></div>
            <div><dt>ZIP</dt><dd>{review.zip}</dd></div>
            <div><dt>Notes</dt><dd>{review.notes || 'None'}</dd></div>
            <div><dt>Salesperson</dt><dd>{review.salesperson}</dd></div>
          </dl>
          <h2>Door configuration</h2>
          <dl>
            {review.configuration.map(([label, value]) => (
              <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
            ))}
          </dl>
        </section>
        <aside className="lr-card">
          <h2>Proposed dealer</h2>
          <dl>
            <div><dt>Dealer</dt><dd>{review.dealerName || 'None proposed'}</dd></div>
            <div><dt>Email</dt><dd>{review.dealerEmail || 'No dealer email on file'}</dd></div>
            <div><dt>Rotation</dt><dd>Next eligible dealer for this ZIP. The rotation does not advance until delivery succeeds.</dd></div>
          </dl>
          {needsReproposal && (
            <p className="lr-note"><strong>Send is blocked.</strong> The proposed dealer is inactive. Re-propose the next eligible dealer. Another dealer will not be substituted automatically.</p>
          )}
          <div className="lr-sendbar">
            <button className="button button--primary" type="button" disabled={!canSend || sending} onClick={onSend}>Send Notification</button>
            <button className="button button--outline" type="button" disabled={!needsReproposal || sending} onClick={onRepropose}>Re-propose dealer</button>
          </div>
        </aside>
      </div>
      <section className="lr-card">
        <h2>Notification history</h2>
        <div className="lr-history">
          {review.history.map((entry) => (
            <article key={`${entry.at}-${entry.label}`}>
              <strong>{entry.label}</strong>
              <p className="lr-muted">{entry.at}</p>
              <p>{entry.detail}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
