import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { changeLabels, useCatalogReview, type CatalogChange } from '../hooks/useCatalogReview'
import { supabase } from '../lib/supabase'
import './InventoryReview.css'

const date = (value: string | null) => value ? new Date(value).toLocaleString() : 'Not recorded'
function display(value: CatalogChange['before'], type: string) {
  if (value === null) return 'Not previously set'
  if (typeof value === 'boolean') return type === 'visibility' ? value ? 'Visible' : 'Hidden' : value ? 'Available' : 'Not available'
  return ({ active: 'Active', legacy_only: 'Historical', discontinued: 'Discontinued' } as Record<string, string>)[String(value)] ?? String(value)
}

export function AdminInventoryReviewPage() {
  const { data, assetUrls, loading, error, refresh } = useCatalogReview()
  const [styleFilter, setStyleFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [checking, setChecking] = useState(false)
  const [message, setMessage] = useState('')
  const [publishError, setPublishError] = useState('')
  const modal = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const changes = data?.changes ?? []
  const styleIds = [...new Set(changes.map(change => change.styleId))]
  const filtered = changes.filter(change => (!styleFilter || change.styleId === styleFilter) && (!typeFilter || change.type === typeFilter))
  const groups = [...new Set(filtered.map(change => change.styleId))].map(id => ({ id, changes: filtered.filter(change => change.styleId === id) }))
  const availabilityCount = changes.filter(change => ['availability','grain_availability'].includes(change.type)).length
  const imageCount = changes.filter(change => ['thumbnail','render','mask'].includes(change.type)).length

  async function confirmReview() {
    setChecking(true); setPublishError(''); setMessage('')
    const latest = await refresh()
    setChecking(false)
    if (latest && latest.changes.length && !latest.errors.length) modal.current?.showModal()
  }
  async function publish() {
    if (!data || publishing) return
    setPublishing(true); setPublishError('')
    const result = await supabase.rpc('publish_door_catalog', { p_revision: data.revision.id, p_fingerprint: data.fingerprint })
    setPublishing(false)
    if (result.error) { setPublishError(result.error.message); modal.current?.close(); await refresh(); return }
    modal.current?.close()
    setMessage('Catalog published. A fresh DRAFT is ready for future edits. The customer Door Builder has not been switched to Supabase.')
    setStyleFilter(''); setTypeFilter('')
    await refresh()
  }

  return <div className="page-content inventory-review-page">
    <header className="page-header admin-page-header"><p className="eyebrow">Inventory</p><h1>Review changes</h1><p>Review saved door changes before deliberately publishing the catalog.</p><Link to="/admin/inventory">Back to Inventory</Link></header>
    {message && <p className="portal-alert portal-alert--success" role="status">{message}</p>}
    {(error || publishError) && <section className="content-card inventory-error" role="alert"><p>{error || publishError}</p><button className="button button--outline" onClick={() => void refresh()}>Refresh review</button></section>}
    {loading && <p role="status">Checking the current draft…</p>}
    {data && <>
      <section className="content-card inventory-review-summary">
        <div><span className="catalog-status__badge catalog-status__badge--draft">DRAFT</span><h2>{changes.length} pending {changes.length === 1 ? 'change' : 'changes'}</h2><p>{styleIds.length} affected Door Styles · {data.styleCount} Door Styles · {data.variantCount} variants</p></div>
        <button ref={trigger} className="button button--primary" disabled={loading || checking || publishing || !changes.length || Boolean(data.errors.length)} onClick={() => void confirmReview()}>{checking ? 'Validating…' : 'Publish Catalog'}</button>
        <p className="inventory-review-note">Publishing updates the backend catalog only. The customer Door Builder continues to use its existing local inventory.</p>
      </section>
      {data.errors.length > 0 && <section className="content-card inventory-validation" aria-labelledby="inventory-validation-title"><h2 id="inventory-validation-title">Publication checks</h2><p>Publication is blocked until these items are resolved.</p><ul>{data.errors.map((issue,index) => <li key={index}>{issue.message} {issue.styleId && <Link to={`/admin/inventory/door-styles/${issue.styleId}`}>Review Door Style</Link>}</li>)}</ul></section>}
      <section className="inventory-review-filters" aria-label="Filter pending changes">
        <div className="form-field"><label htmlFor="review-style-filter">Door Style</label><select id="review-style-filter" value={styleFilter} onChange={event => setStyleFilter(event.target.value)}><option value="">All Door Styles</option>{styleIds.map(id => <option value={id} key={id}>{changes.find(change => change.styleId === id)!.styleName}</option>)}</select></div>
        <div className="form-field"><label htmlFor="review-type-filter">Change type</label><select id="review-type-filter" value={typeFilter} onChange={event => setTypeFilter(event.target.value)}><option value="">All changes</option>{Object.entries(changeLabels).map(([key,label]) => <option value={key} key={key}>{label}</option>)}</select></div>
      </section>
      {!filtered.length && <section className="content-card empty-state"><strong>{changes.length ? 'No changes match these filters.' : 'No pending door changes.'}</strong><p>Save a Door Style draft to see its changes here. Saving never publishes automatically.</p><Link className="button button--outline" to="/admin/inventory/door-styles">Manage Door Styles</Link></section>}
      {groups.map(group => <section className="content-card inventory-review-group" key={group.id}>
        <header><div><h2>{group.changes[0].styleName}</h2><p>Last edit: {date(group.changes[0].changedAt)} · {group.changes[0].changedBy ?? 'Admin not recorded'}</p></div><Link to={`/admin/inventory/door-styles/${group.id}`}>Edit Door Style</Link></header>
        <ul>{group.changes.map((change,index) => <li key={index}>
          <span className="inventory-change-badge">{changeLabels[change.type] ?? change.label}</span>
          {change.context && <strong>{change.context}</strong>}
          {change.afterAssetId ? <div className="inventory-review-images">{[['Before',change.beforeAssetId],['Draft',change.afterAssetId]].map(([label,id]) => <figure key={label}><figcaption>{label}</figcaption>{id && assetUrls[id] ? <img src={assetUrls[id]} alt={`${label} ${change.label.toLowerCase()} for ${change.styleName}`} /> : <span>Preview not available</span>}</figure>)}</div>
            : <p className="inventory-change-values"><span>{display(change.before,change.type)}</span><span aria-label="changes to">→</span><strong>{display(change.after,change.type)}</strong></p>}
        </li>)}</ul>
      </section>)}
      <section className="content-card inventory-publication-history"><h2>Publication history</h2>{!data.history.length ? <p>No catalog has been published yet.</p> : <div className="inventory-history-scroll"><table><thead><tr><th>Revision</th><th>Published</th><th>Published by</th><th>Source revision</th><th>Changes</th><th>Status</th></tr></thead><tbody>{data.history.map(item => <tr key={item.id}><td>{item.id}</td><td>{date(item.published_at)}</td><td>{item.published_by ?? 'Not recorded'}</td><td>{item.base_revision_id ?? 'Initial catalog'}</td><td>{item.publication_change_count ?? 'Not recorded'}</td><td>{item.status === 'published' ? 'Current' : 'Historical'}</td></tr>)}</tbody></table></div>}</section>
    </>}
    <dialog className="inventory-publish-dialog" ref={modal} aria-labelledby="inventory-publish-title" onClose={() => trigger.current?.focus()}
      onCancel={event => { if (publishing) event.preventDefault() }}
      onClick={event => { if (publishing || event.target !== event.currentTarget) return; const r=event.currentTarget.getBoundingClientRect(); if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom) modal.current?.close() }}>
      <h2 id="inventory-publish-title">Publish Door Catalog?</h2><p>You are about to publish the reviewed draft:</p>
      <ul><li>{styleIds.length} Door Styles changed</li><li>{availabilityCount} availability changes</li><li>{imageCount} image replacements</li><li>{changes.length} total pending changes</li></ul>
      <p>This revision becomes the current published catalog. A new editable DRAFT will be created from it. Existing publication history is preserved.</p><p>The customer Door Builder remains on local inventory.</p>
      <div><button autoFocus type="button" className="button button--outline" disabled={publishing} onClick={() => modal.current?.close()}>Cancel</button><button type="button" className="button button--primary" disabled={publishing} onClick={() => void publish()}>{publishing ? 'Publishing…' : 'Publish'}</button></div>
    </dialog>
  </div>
}
