import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export type EditableDoorVariant = {
  id: string
  variantId: string | null
  doorLineId: string
  grainId: string | null
  name: string
  material: string
  series: string
  grain: string | null
  customerSelectable: boolean
  relationshipExists: boolean
}
export type DoorStyleEditorData = {
  id: string; revisionId: string; revisionStatus: 'draft' | 'published' | 'retired'; name: string
  legacyId: string | null; internalCode: string | null; productCode: string | null
  status: 'active' | 'legacy_only' | 'discontinued'; customerSelectable: boolean; displayOrder: number
  variants: EditableDoorVariant[]; thumbnailPath: string | null; thumbnailStorageAvailable: boolean
  thumbnailCount: number; renderCount: number; maskCount: number
  localAssetCount: number; storageAssetCount: number; missingAssetCount: number
}
type State = { data: DoorStyleEditorData | null; isLoading: boolean; error: string }

export function useDoorStyleEditor(styleId: string | undefined) {
  const [state, setState] = useState<State>({ data: null, isLoading: true, error: '' })
  const load = useCallback(async () => {
    if (!styleId) { setState({ data: null, isLoading: false, error: 'Door Style ID is missing.' }); return }
    setState((current) => ({ ...current, isLoading: true, error: '' }))
    const { data: style, error: styleError } = await supabase.from('door_styles').select('id,catalog_revision_id,legacy_id,internal_code,product_code,display_name,status,customer_selectable,display_order').eq('id', styleId).maybeSingle()
    if (styleError || !style) { console.error('Unable to load Door Style.', styleError); setState({ data: null, isLoading: false, error: styleError ? 'The Door Style could not be loaded.' : 'Door Style not found.' }); return }
    const revisionId = style.catalog_revision_id
    const results = await Promise.all([
      supabase.from('catalog_revisions').select('status').eq('id', revisionId).single(),
      supabase.from('door_variants').select('id,display_name,door_line_id,grain_id,customer_selectable,display_order').eq('door_style_id', styleId).order('display_order'),
      supabase.from('door_variants').select('door_line_id,grain_id').eq('catalog_revision_id', revisionId),
      supabase.from('door_lines').select('id,material_id,series_id').eq('catalog_revision_id', revisionId).eq('status', 'active').eq('customer_selectable', true).order('display_order'),
      supabase.from('materials').select('id,display_name').eq('catalog_revision_id', revisionId),
      supabase.from('series').select('id,display_name').eq('catalog_revision_id', revisionId),
      supabase.from('grains').select('id,display_name').eq('catalog_revision_id', revisionId),
      supabase.from('door_variant_assets').select('door_variant_id,asset_id,role,display_order').eq('catalog_revision_id', revisionId),
      supabase.from('assets').select('id,current_path,storage_bucket,storage_object_path').eq('catalog_revision_id', revisionId),
    ])
    const failure = results.find((result) => result.error)
    if (failure?.error) { console.error('Unable to load Door Style editor relationships.', failure.error); setState({ data: null, isLoading: false, error: 'The Door Style relationships could not be loaded.' }); return }
    const [revisionResult, variantsResult, catalogVariantsResult, linesResult, materialsResult, seriesResult, grainsResult, bindingsResult, assetsResult] = results
    const lines = linesResult.data ?? []
    const materials = new Map((materialsResult.data ?? []).map((item) => [item.id, item.display_name]))
    const series = new Map((seriesResult.data ?? []).map((item) => [item.id, item.display_name]))
    const grains = new Map((grainsResult.data ?? []).map((item) => [item.id, item.display_name]))
    const variantRows = variantsResult.data ?? []
    const variantIds = new Set(variantRows.map((variant) => variant.id))
    const bindings = (bindingsResult.data ?? []).filter((binding) => variantIds.has(binding.door_variant_id))
    const assetById = new Map((assetsResult.data ?? []).map((asset) => [asset.id, asset]))
    const assets = [...new Set(bindings.map((binding) => binding.asset_id))].map((id) => assetById.get(id))
    const thumbnailBindings = bindings.filter((binding) => binding.role === 'thumbnail').sort((a, b) => a.display_order - b.display_order)
    const thumbnailAsset = thumbnailBindings.map((binding) => assetById.get(binding.asset_id)).find(Boolean)
    const uniqueRoleCount = (role: string) => new Set(bindings.filter((binding) => binding.role === role).map((binding) => binding.asset_id)).size
    setState({ isLoading: false, error: '', data: {
      id: style.id, revisionId, revisionStatus: revisionResult.data!.status, name: style.display_name,
      legacyId: style.legacy_id, internalCode: style.internal_code, productCode: style.product_code,
      status: style.status, customerSelectable: style.customer_selectable, displayOrder: style.display_order,
      variants: lines.flatMap((line) => {
        const catalogPairs = (catalogVariantsResult.data ?? []).filter((variant) => variant.door_line_id === line.id)
        const grainIds = [...new Set(catalogPairs.map((variant) => variant.grain_id))]
        return grainIds.map((grainId) => {
          const existing = variantRows.find((variant) => variant.door_line_id === line.id && variant.grain_id === grainId)
          const grain = grainId ? grains.get(grainId) ?? 'Unknown grain' : null
          const lineSeries = line.series_id ? series.get(line.series_id) ?? 'Unknown series' : 'No series'
          return {
            id: `${line.id}:${grainId ?? 'none'}`, variantId: existing?.id ?? null,
            doorLineId: line.id, grainId, name: existing?.display_name ?? `${style.display_name} — ${lineSeries}${grain ? ` · ${grain}` : ''}`,
            material: materials.get(line.material_id) ?? 'Unknown material', series: lineSeries, grain,
            customerSelectable: existing?.customer_selectable ?? false, relationshipExists: Boolean(existing),
          }
        })
      }),
      thumbnailPath: thumbnailAsset?.current_path ?? null,
      thumbnailStorageAvailable: Boolean(thumbnailAsset?.storage_bucket && thumbnailAsset.storage_object_path),
      thumbnailCount: uniqueRoleCount('thumbnail'), renderCount: uniqueRoleCount('slab_render'), maskCount: uniqueRoleCount('mask'),
      localAssetCount: assets.filter((asset) => Boolean(asset?.current_path)).length,
      storageAssetCount: assets.filter((asset) => Boolean(asset?.storage_bucket && asset.storage_object_path)).length,
      missingAssetCount: assets.filter((asset) => !asset?.current_path && !asset?.storage_object_path).length,
    } })
  }, [styleId])
  // Loading is intentionally driven by the route-bound style ID.
  // oxlint-disable-next-line react(set-state-in-effect)
  useEffect(() => { void load() }, [load])
  return { ...state, refresh: load }
}
