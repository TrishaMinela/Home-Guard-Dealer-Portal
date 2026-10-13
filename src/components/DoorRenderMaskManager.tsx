import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import type { DoorStyleEditorData, ManagedDoorAsset } from '../hooks/useDoorStyleEditor'
import { buildDoorAssetObjectPath, DOOR_ASSET_BUCKET, formatBytes, prepareDoorCatalogAsset, type PreparedDoorThumbnail } from '../lib/doorThumbnailUpload'
import { supabase } from '../lib/supabase'

type PendingAsset = { asset: ManagedDoorAsset; prepared: PreparedDoorThumbnail }

export function DoorRenderMaskManager({ data, refresh, announce }: {
  data: DoorStyleEditorData
  refresh: () => Promise<void>
  announce: (message: string) => void
}) {
  const [pending, setPending] = useState<Map<string, PendingAsset>>(() => new Map())
  const pendingRef = useRef(pending)
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const renders = useMemo(() => data.managedAssets.filter((asset) => asset.role === 'slab_render'), [data.managedAssets])
  const masks = useMemo(() => data.managedAssets.filter((asset) => asset.role === 'mask'), [data.managedAssets])
  useEffect(() => { pendingRef.current = pending }, [pending])
  useEffect(() => () => { for (const item of pendingRef.current.values()) URL.revokeObjectURL(item.prepared.previewUrl) }, [])

  function clearPending() {
    for (const item of pending.values()) URL.revokeObjectURL(item.prepared.previewUrl)
    setPending(new Map()); setError('')
  }
  async function stage(asset: ManagedDoorAsset, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ''
    if (!file) return
    setError('')
    try {
      const prepared = await prepareDoorCatalogAsset(file, { role: asset.role, expectedWidth: asset.width, expectedHeight: asset.height })
      setPending((current) => {
        const next = new Map(current); const previous = next.get(asset.bindingId)
        if (previous) URL.revokeObjectURL(previous.prepared.previewUrl)
        next.set(asset.bindingId, { asset, prepared }); return next
      })
    } catch (stageError) {
      console.error('Invalid Door Style render/mask selection.', stageError)
      setError(stageError instanceof Error ? stageError.message : 'The selected asset is invalid.')
    }
  }
  function discard(bindingId: string) {
    setPending((current) => {
      const next = new Map(current); const item = next.get(bindingId)
      if (item) URL.revokeObjectURL(item.prepared.previewUrl)
      next.delete(bindingId); return next
    })
  }
  async function saveDraft() {
    if (!pending.size) return
    const staged = [...pending.values()]
    if (new Set(staged.map((item) => item.asset.assetId)).size !== staged.length) {
      setError('A shared source asset can only be replaced in one scoped context per save. Save one context, refresh, then replace another if needed.'); return
    }
    setError(''); setIsSaving(true)
    const styleCode = data.productCode ?? data.internalCode ?? data.legacyId ?? data.id
    const uploads = staged.map((item) => ({
      item,
      path: buildDoorAssetObjectPath({
        revisionId: data.revisionId, styleCode, role: item.asset.role, context: item.asset.contextKey,
        contentVersion: item.asset.nextContentVersion, checksum: item.prepared.checksum,
        filename: item.prepared.file.name, mimeType: item.prepared.file.type,
      }),
    }))
    const uploadedPaths: string[] = []
    for (const upload of uploads) {
      const { error: uploadError } = await supabase.storage.from(DOOR_ASSET_BUCKET).upload(upload.path, upload.item.prepared.file, {
        contentType: upload.item.prepared.file.type, cacheControl: '3600', upsert: false,
      })
      if (uploadError) {
        console.error('Unable to upload a replacement Door Style asset.', uploadError)
        if (uploadedPaths.length) await supabase.storage.from(DOOR_ASSET_BUCKET).remove(uploadedPaths)
        setError('The replacement assets could not be uploaded. Existing DRAFT mappings were not changed.'); setIsSaving(false); return
      }
      uploadedPaths.push(upload.path)
    }
    const replacements = uploads.map(({ item, path }) => ({
      binding_id: item.asset.bindingId, previous_asset_id: item.asset.assetId, role: item.asset.role,
      storage_object_path: path, mime_type: item.prepared.file.type, width: item.prepared.width,
      height: item.prepared.height, byte_size: item.prepared.file.size, checksum: item.prepared.checksum,
      original_filename: item.prepared.file.name, has_transparency: item.prepared.hasTransparency,
    }))
    const { error: mappingError } = await supabase.rpc('replace_draft_door_style_assets', { p_door_style_id: data.id, p_replacements: replacements })
    if (mappingError) {
      console.error('Unable to map replacement Door Style assets.', mappingError)
      const { error: cleanupError } = await supabase.storage.from(DOOR_ASSET_BUCKET).remove(uploadedPaths)
      if (cleanupError) console.error('Unable to clean up orphaned Door Style asset uploads.', cleanupError)
      setError('The DRAFT mappings could not be updated. All previous assets remain active.'); setIsSaving(false); return
    }
    const count = pending.size; clearPending(); await refresh(); announce(`${count} render/mask ${count === 1 ? 'asset' : 'assets'} saved to the DRAFT catalog.`); setIsSaving(false)
  }

  function assetCard(asset: ManagedDoorAsset) {
    const staged = pending.get(asset.bindingId)
    const isShared = asset.usageCount > 1
    return <article className="door-managed-asset" key={asset.bindingId}>
      <div className={`door-managed-asset__preview ${asset.role === 'mask' ? 'door-managed-asset__preview--mask' : ''}`}><img src={staged?.prepared.previewUrl ?? asset.previewUrl ?? ''} alt={`${asset.contextLabel} ${asset.role === 'mask' ? 'mask' : 'render'}`} /></div>
      <div className="door-managed-asset__body"><div className="door-managed-asset__title"><div><strong>{asset.contextLabel || 'Default context'}</strong><small>{asset.role === 'mask' ? 'Mask' : 'Render / slab'}</small></div><div><span className="door-asset-pill door-asset-pill--success">Storage available</span><span className={`door-asset-pill ${isShared ? 'door-asset-pill--warning' : 'door-asset-pill--success'}`}>{isShared ? `Shared · ${asset.usageCount} uses / ${asset.styleUsageCount} styles` : 'Unique binding'}</span></div></div>
        {isShared && <p className="door-managed-asset__shared">Replacement is scoped to this exact binding. Other uses of the shared source asset will not change.</p>}
        <dl><div><dt>Source</dt><dd title={asset.sourcePath}>{asset.sourcePath}</dd></div><div><dt>Storage object</dt><dd title={asset.storageObjectPath ?? undefined}>{asset.storageObjectPath ?? '—'}</dd></div><div><dt>Type</dt><dd>{staged?.prepared.file.type ?? asset.mimeType ?? '—'}</dd></div><div><dt>Size</dt><dd>{formatBytes(staged?.prepared.file.size ?? asset.byteSize ?? 0)}</dd></div><div><dt>Dimensions</dt><dd>{staged ? `${staged.prepared.width} × ${staged.prepared.height}px` : asset.width && asset.height ? `${asset.width} × ${asset.height}px` : '—'}</dd></div><div><dt>Version</dt><dd>v{asset.contentVersion}</dd></div></dl>
        {staged && <div className="door-managed-asset__pending"><strong>Pending replacement: {staged.prepared.file.name}</strong>{staged.prepared.warning && <span>{staged.prepared.warning}</span>}</div>}
        <div className="door-managed-asset__actions">{staged && <button className="button button--outline" type="button" disabled={isSaving} onClick={() => discard(asset.bindingId)}>Cancel</button>}<label className="button button--outline">{staged ? 'Choose Different File' : 'Replace'}<input type="file" accept={asset.role === 'mask' ? 'image/png,image/webp' : 'image/png,image/jpeg,image/webp'} disabled={isSaving || data.revisionStatus !== 'draft'} onChange={(event) => void stage(asset, event)} /></label></div>
      </div>
    </article>
  }

  return <section className="content-card door-style-editor__section door-render-mask-manager"><div className="door-style-editor__section-heading"><div><h2>Render Assets &amp; Masks</h2><p>Versioned, binding-scoped DRAFT assets. Shared sources are never replaced globally.</p></div>{pending.size > 0 && <span className="door-style-editor__count">{pending.size} pending</span>}</div>
    <div className="door-managed-assets__group"><h3>Render / slab assets <span>{renders.length}</span></h3>{renders.length ? <div className="door-managed-assets__grid">{renders.map(assetCard)}</div> : <p>No render assets are mapped for this style.</p>}</div>
    <div className="door-managed-assets__group"><h3>Masks <span>{masks.length}</span></h3>{masks.length ? <div className="door-managed-assets__grid">{masks.map(assetCard)}</div> : <p>No masks are mapped for this style.</p>}</div>
    {error && <div className="portal-alert portal-alert--error" role="alert">{error}</div>}
    {pending.size > 0 && <div className="door-managed-assets__save"><span>Nothing changes until Save Draft succeeds.</span><div><button className="button button--outline" type="button" disabled={isSaving} onClick={clearPending}>Cancel All</button><button className="button button--primary" type="button" disabled={isSaving} onClick={() => void saveDraft()}>{isSaving ? 'Uploading...' : `Save ${pending.size} as Draft`}</button></div></div>}
  </section>
}
