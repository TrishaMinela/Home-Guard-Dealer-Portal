import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useDoorStyleEditor, type DoorStyleEditorData, type EditableDoorVariant } from '../hooks/useDoorStyleEditor'
import { supabase } from '../lib/supabase'
import { buildDoorThumbnailObjectPath, DOOR_ASSET_BUCKET, formatBytes, prepareDoorThumbnail, type PreparedDoorThumbnail } from '../lib/doorThumbnailUpload'

type FormState = { name: string; status: DoorStyleEditorData['status']; customerSelectable: boolean; displayOrder: string; variants: EditableDoorVariant[] }
type SaveSummary = { enabled: string[]; disabled: string[]; created: string[]; reviewRequired: string[] }
function formFromData(data: DoorStyleEditorData): FormState { return { name: data.name, status: data.status, customerSelectable: data.customerSelectable, displayOrder: String(data.displayOrder), variants: data.variants } }

export function AdminDoorStyleDetailPage() {
  const { styleId } = useParams(); const navigate = useNavigate()
  const { data, isLoading, error, refresh } = useDoorStyleEditor(styleId)
  const [form, setForm] = useState<FormState | null>(null)
  const [isSaving, setIsSaving] = useState(false); const [message, setMessage] = useState(''); const [saveError, setSaveError] = useState(''); const [saveSummary, setSaveSummary] = useState<SaveSummary | null>(null)
  const [pendingThumbnail, setPendingThumbnail] = useState<PreparedDoorThumbnail | null>(null)
  const [thumbnailError, setThumbnailError] = useState(''); const [isUploadingThumbnail, setIsUploadingThumbnail] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // The editable draft must reset only after a fresh server snapshot is loaded.
  // oxlint-disable-next-line react(set-state-in-effect)
  useEffect(() => { if (data) setForm(formFromData(data)) }, [data])
  useEffect(() => () => { if (pendingThumbnail) URL.revokeObjectURL(pendingThumbnail.previewUrl) }, [pendingThumbnail])
  const selectedVariants = useMemo(() => form?.variants.filter((variant) => variant.customerSelectable).length ?? 0, [form])
  const availabilityGroups = useMemo(() => {
    const groups = new Map<string, EditableDoorVariant[]>()
    for (const variant of form?.variants ?? []) groups.set(variant.series, [...(groups.get(variant.series) ?? []), variant])
    return [...groups.entries()]
  }, [form])

  function toggleVariant(variantId: string) {
    setMessage(''); setSaveError(''); setSaveSummary(null)
    setForm((current) => current ? { ...current, variants: current.variants.map((variant) => variant.id === variantId ? { ...variant, customerSelectable: !variant.customerSelectable } : variant) } : current)
  }
  function clearPendingThumbnail() {
    if (pendingThumbnail) URL.revokeObjectURL(pendingThumbnail.previewUrl)
    setPendingThumbnail(null); setThumbnailError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }
  async function selectThumbnail(file: File | undefined) {
    if (!file) return
    setThumbnailError('')
    try {
      const prepared = await prepareDoorThumbnail(file)
      if (pendingThumbnail) URL.revokeObjectURL(pendingThumbnail.previewUrl)
      setPendingThumbnail(prepared)
    } catch (selectionError) {
      console.error('Invalid Door Style thumbnail selection.', selectionError)
      setThumbnailError(selectionError instanceof Error ? selectionError.message : 'The selected thumbnail is invalid.')
    }
  }
  function handleThumbnailInput(event: ChangeEvent<HTMLInputElement>) { void selectThumbnail(event.target.files?.[0]) }
  function handleThumbnailDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault(); void selectThumbnail(event.dataTransfer.files?.[0])
  }
  async function saveThumbnailDraft() {
    if (!data || !pendingThumbnail || !data.thumbnailAssetId) { setThumbnailError('A current thumbnail mapping is required before it can be replaced.'); return }
    const styleCode = data.productCode ?? data.internalCode ?? data.legacyId ?? data.id
    const objectPath = buildDoorThumbnailObjectPath({
      revisionId: data.revisionId, styleCode, contentVersion: data.thumbnailContentVersion + 1,
      checksum: pendingThumbnail.checksum, filename: pendingThumbnail.file.name, mimeType: pendingThumbnail.file.type,
    })
    setThumbnailError(''); setMessage(''); setIsUploadingThumbnail(true)
    const { error: uploadError } = await supabase.storage.from(DOOR_ASSET_BUCKET).upload(objectPath, pendingThumbnail.file, {
      contentType: pendingThumbnail.file.type, cacheControl: '3600', upsert: false,
    })
    if (uploadError) {
      console.error('Unable to upload the replacement thumbnail.', uploadError)
      setThumbnailError(uploadError.message.includes('already exists') ? 'This exact thumbnail version already exists. Refresh and try again.' : 'The thumbnail could not be uploaded. Please try again.')
      setIsUploadingThumbnail(false); return
    }
    const { error: mappingError } = await supabase.rpc('replace_draft_door_style_thumbnail', {
      p_door_style_id: data.id, p_previous_asset_id: data.thumbnailAssetId,
      p_storage_object_path: objectPath, p_mime_type: pendingThumbnail.file.type,
      p_width: pendingThumbnail.width, p_height: pendingThumbnail.height,
      p_byte_size: pendingThumbnail.file.size, p_checksum: pendingThumbnail.checksum,
      p_original_filename: pendingThumbnail.file.name,
    })
    if (mappingError) {
      console.error('Unable to map the replacement thumbnail.', mappingError)
      const { error: cleanupError } = await supabase.storage.from(DOOR_ASSET_BUCKET).remove([objectPath])
      if (cleanupError) console.error('Unable to clean up the orphaned thumbnail upload.', cleanupError)
      setThumbnailError('The DRAFT mapping could not be updated. The original thumbnail is still active.')
      setIsUploadingThumbnail(false); return
    }
    clearPendingThumbnail(); await refresh(); setMessage('Thumbnail saved to the DRAFT catalog.'); setIsUploadingThumbnail(false)
  }
  async function handleSubmit(event: FormEvent) {
    event.preventDefault(); if (!data || !form) return
    setMessage(''); setSaveError(''); setSaveSummary(null)
    if (!form.name.trim()) { setSaveError('Door Style name is required.'); return }
    const displayOrder = Number(form.displayOrder)
    if (!Number.isInteger(displayOrder) || displayOrder < 0) { setSaveError('Display order must be a whole number of zero or greater.'); return }
    if (form.status === 'discontinued' && form.customerSelectable) { setSaveError('A discontinued Door Style cannot be customer visible.'); return }
    if (form.customerSelectable && selectedVariants === 0) { setSaveError('A customer-visible Door Style must have at least one available option.'); return }
    setIsSaving(true)
    const { data: rpcData, error: rpcError } = await supabase.rpc('update_draft_door_style', {
      p_door_style_id: data.id, p_display_name: form.name.trim(), p_status: form.status,
      p_customer_selectable: form.customerSelectable, p_display_order: displayOrder,
      p_variant_availability: form.variants.map((variant) => ({ door_line_id: variant.doorLineId, grain_id: variant.grainId, customer_selectable: variant.customerSelectable })),
    })
    setIsSaving(false)
    if (rpcError) { console.error('Unable to save Door Style draft.', rpcError); setSaveError('The Door Style could not be saved. Confirm the catalog is still DRAFT and try again.'); return }
    await refresh()
    const result = rpcData as { summary?: SaveSummary } | null
    setSaveSummary(result?.summary ?? null); setMessage('Saved Draft')
  }

  if (isLoading) return <div className="page-content"><div className="data-state">Loading Door Style...</div></div>
  if (error || !data || !form) return <div className="page-content"><section className="content-card inventory-error" role="alert"><strong>Door Style unavailable.</strong><p>{error || 'The Door Style could not be loaded.'}</p><Link className="button button--outline" to="/admin/inventory/door-styles">Back to Door Styles</Link></section></div>
  return <div className="page-content door-style-editor-page">
    <header className="door-style-editor__header"><div><p className="eyebrow">Inventory · Door Styles</p><h1>Edit {data.name}</h1><p>Update this style in the Supabase catalog. Customer-facing inventory remains unchanged.</p></div><span className={`catalog-status__badge catalog-status__badge--${data.revisionStatus}`}>{data.revisionStatus}</span></header>
    {message && <div className="portal-alert portal-alert--success" role="status"><strong>{message}</strong>{saveSummary && <ul>{saveSummary.enabled.map((item) => <li key={`enabled:${item}`}>{item} enabled</li>)}{saveSummary.disabled.map((item) => <li key={`disabled:${item}`}>{item} disabled</li>)}{saveSummary.created.map((item) => <li key={`created:${item}`}>{item} DRAFT relationship created</li>)}{saveSummary.reviewRequired.map((item) => <li key={`review:${item}`}>{item} requires compatibility and asset review before publication</li>)}</ul>}</div>}{saveError && <div className="portal-alert portal-alert--error" role="alert">{saveError}</div>}
    <form className="door-style-editor" onSubmit={handleSubmit}>
      <section className="content-card door-style-editor__section"><div className="door-style-editor__section-heading"><div><h2>Basic information</h2><p>Name, visibility, and catalog ordering.</p></div></div><div className="door-style-editor__fields">
        <label className="form-field door-style-editor__field--wide"><span>Door Style name</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        <label className="form-field"><span>Status</span><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as FormState['status'] })}><option value="active">Active</option><option value="legacy_only">Legacy only</option><option value="discontinued">Inactive / discontinued</option></select></label>
        <label className="form-field"><span>Door Style code <small>Read only</small></span><input value={data.productCode ?? data.internalCode ?? data.legacyId ?? ''} readOnly aria-readonly="true" /></label>
        <label className="form-field"><span>Display order</span><input type="number" min="0" step="1" value={form.displayOrder} onChange={(event) => setForm({ ...form, displayOrder: event.target.value })} /></label>
        <label className="form-field door-style-editor__field--wide"><span>Record ID <small>Read only</small></span><input value={data.id} readOnly aria-readonly="true" /></label>
        <label className="door-style-editor__toggle door-style-editor__field--wide"><span><strong>Customer visible</strong><small>Show this style in the DRAFT catalog.</small></span><input type="checkbox" checked={form.customerSelectable} onChange={(event) => setForm({ ...form, customerSelectable: event.target.checked })} /><i aria-hidden="true" /></label>
      </div></section>
      <section className="content-card door-style-editor__section"><div className="door-style-editor__section-heading"><div><h2>Availability</h2><p>Choose from the catalog's supported material, series, and grain options.</p></div><span className="door-style-editor__count">{selectedVariants} of {form.variants.length}</span></div>
        <div className="door-availability-chips" aria-label="Selected availability">{form.variants.filter((variant) => variant.customerSelectable).map((variant) => <span key={variant.id}>{variant.series}{variant.grain ? ` · ${variant.grain}` : ''}</span>)}{selectedVariants === 0 && <em>No availability selected</em>}</div>
        <details className="door-availability-select"><summary><span>Available in</span><strong>{selectedVariants === form.variants.length ? 'All supported options' : `${selectedVariants} selected`}</strong><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7.5 5 5 5-5" /></svg></summary><div className="door-availability-menu">{availabilityGroups.map(([series, variants]) => variants.length > 1 ? <fieldset className="door-availability-group" key={series}><legend>{series}<small>{variants[0].material} · Select grains</small></legend>{variants.map((variant) => <label className="door-availability-option door-availability-option--nested" key={variant.id}><input type="checkbox" checked={variant.customerSelectable} onChange={() => toggleVariant(variant.id)} /><span><strong>{variant.grain ?? variant.name}</strong><small>{variant.relationshipExists ? 'Existing DRAFT relationship' : 'Creates a minimum DRAFT relationship; review required before publish'}</small></span></label>)}</fieldset> : <label className="door-availability-option" key={variants[0].id}><input type="checkbox" checked={variants[0].customerSelectable} onChange={() => toggleVariant(variants[0].id)} /><span><strong>{series}</strong><small>{variants[0].material}{variants[0].grain ? ` · ${variants[0].grain} surface` : ''}{!variants[0].relationshipExists ? ' · Creates a minimum DRAFT relationship; review required before publish' : ''}</small></span></label>)}</div></details>
      </section>
      <section className="content-card door-style-editor__section door-thumbnail-manager"><div className="door-style-editor__section-heading"><div><h2>Thumbnail</h2><p>Selection image shown for this Door Style. Replacements remain DRAFT until the catalog is published.</p></div><span className={`door-asset-pill ${data.thumbnailStorageAvailable ? 'door-asset-pill--success' : 'door-asset-pill--warning'}`}>{data.thumbnailStorageAvailable ? 'Storage available' : 'Storage missing'}</span></div>
        <div className="door-thumbnail-manager__current"><div className="door-style-editor__thumbnail">{data.thumbnailPath ? <img src={data.thumbnailPath} alt={`${data.name} thumbnail`} /> : <span>No thumbnail</span>}</div><div className="door-thumbnail-manager__details"><strong>Current DRAFT asset</strong><dl><div><dt>Source path</dt><dd title={data.thumbnailSourcePath ?? undefined}>{data.thumbnailSourcePath ?? '—'}</dd></div><div><dt>Storage object</dt><dd title={data.thumbnailStorageObjectPath ?? undefined}>{data.thumbnailStorageObjectPath ?? '—'}</dd></div><div><dt>File type</dt><dd>{data.thumbnailMimeType ?? '—'}</dd></div><div><dt>File size</dt><dd>{data.thumbnailByteSize != null ? formatBytes(data.thumbnailByteSize) : '—'}</dd></div><div><dt>Dimensions</dt><dd>{data.thumbnailWidth && data.thumbnailHeight ? `${data.thumbnailWidth} × ${data.thumbnailHeight}px` : '—'}</dd></div><div><dt>Version</dt><dd>v{data.thumbnailContentVersion}</dd></div></dl></div></div>
        {!pendingThumbnail ? <div className="door-thumbnail-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={handleThumbnailDrop}><strong>Replace selection thumbnail</strong><p>Drag a PNG, JPEG, or WebP here, or choose a file. Maximum 10 MiB.</p><button className="button button--outline" type="button" disabled={data.revisionStatus !== 'draft'} onClick={() => fileInputRef.current?.click()}>Replace Thumbnail</button><input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleThumbnailInput} /></div> : <div className="door-thumbnail-manager__pending"><div className="door-style-editor__thumbnail"><img src={pendingThumbnail.previewUrl} alt="Replacement thumbnail preview" /></div><div><strong>Replacement preview</strong><dl><div><dt>Filename</dt><dd>{pendingThumbnail.file.name}</dd></div><div><dt>File type</dt><dd>{pendingThumbnail.file.type}</dd></div><div><dt>File size</dt><dd>{formatBytes(pendingThumbnail.file.size)}</dd></div><div><dt>Dimensions</dt><dd>{pendingThumbnail.width} × {pendingThumbnail.height}px</dd></div></dl>{pendingThumbnail.warning && <p className="door-thumbnail-manager__warning">{pendingThumbnail.warning}</p>}<div className="door-thumbnail-manager__buttons"><button className="button button--outline" type="button" disabled={isUploadingThumbnail} onClick={clearPendingThumbnail}>Cancel</button><button className="button button--primary" type="button" disabled={isUploadingThumbnail} onClick={() => void saveThumbnailDraft()}>{isUploadingThumbnail ? 'Uploading...' : 'Save as Draft'}</button></div></div></div>}
        {thumbnailError && <div className="portal-alert portal-alert--error" role="alert">{thumbnailError}</div>}
        <div className="door-thumbnail-manager__coverage"><span>Renders: {data.renderCount}</span><span>Masks: {data.maskCount}</span><span>Local/source: {data.localAssetCount}</span><span>Storage: {data.storageAssetCount}</span><span>Missing: {data.missingAssetCount}</span></div>
      </section>
      <div className="door-style-editor__actions"><span>{data.revisionStatus === 'draft' ? 'Saving updates the DRAFT catalog only.' : 'This catalog is read only.'}</span><div><button className="button button--outline" type="button" disabled={isSaving} onClick={() => navigate('/admin/inventory/door-styles')}>Cancel</button><button className="button button--primary" type="submit" disabled={isSaving || data.revisionStatus !== 'draft'}>{isSaving ? 'Saving...' : 'Save Draft'}</button></div></div>
    </form>
  </div>
}
