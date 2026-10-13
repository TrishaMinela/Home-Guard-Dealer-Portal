import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { CatalogRevision, DoorStyleAdminRow, DoorStyleFilterOption } from '../types/inventory'

type DoorStyleRecord = {
  id: string; legacy_id: string | null; internal_code: string | null; product_code: string | null
  display_name: string; status: DoorStyleAdminRow['status']; customer_selectable: boolean; display_order: number
}
type DoorVariantRecord = { id: string; door_style_id: string; door_line_id: string; grain_id: string | null }
type DoorLineRecord = { id: string; material_id: string; series_id: string | null; display_name: string }
type NamedRecord = { id: string; display_name: string }
type DoorAssetBinding = {
  door_variant_id: string; asset_id: string
  role: 'thumbnail' | 'slab_render' | 'glass_overlay' | 'mask'; display_order: number
}
type AssetRecord = {
  id: string
  current_path: string
  storage_bucket: string | null
  storage_object_path: string | null
}
type DoorStylesState = {
  revision: CatalogRevision | null; styles: DoorStyleAdminRow[]; materialSeriesOptions: DoorStyleFilterOption[]
  variantCount: number; isLoading: boolean; error: string
}

function uniqueSorted(values: Array<string | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b))
}

export function useDoorStylesAdmin() {
  const [state, setState] = useState<DoorStylesState>({
    revision: null, styles: [], materialSeriesOptions: [], variantCount: 0, isLoading: true, error: '',
  })

  const loadDoorStyles = useCallback(async () => {
    setState((current) => ({ ...current, isLoading: true, error: '' }))
    const { data: revisionData, error: revisionError } = await supabase
      .from('catalog_revisions')
      .select('id, status, source_commit, created_at, updated_at, published_at')
      .order('updated_at', { ascending: false }).limit(1).maybeSingle()

    if (revisionError) {
      console.error('Unable to load the door catalog revision.', revisionError)
      setState((current) => ({ ...current, isLoading: false, error: 'We could not load the Door Styles catalog.' }))
      return
    }
    if (!revisionData) {
      setState({ revision: null, styles: [], materialSeriesOptions: [], variantCount: 0, isLoading: false, error: '' })
      return
    }

    const revisionId = revisionData.id
    const results = await Promise.all([
      supabase.from('door_styles').select('id, legacy_id, internal_code, product_code, display_name, status, customer_selectable, display_order').eq('catalog_revision_id', revisionId).order('display_order'),
      supabase.from('door_variants').select('id, door_style_id, door_line_id, grain_id').eq('catalog_revision_id', revisionId),
      supabase.from('door_lines').select('id, material_id, series_id, display_name').eq('catalog_revision_id', revisionId),
      supabase.from('materials').select('id, display_name').eq('catalog_revision_id', revisionId),
      supabase.from('series').select('id, display_name').eq('catalog_revision_id', revisionId),
      supabase.from('grains').select('id, display_name').eq('catalog_revision_id', revisionId),
      supabase.from('door_variant_assets').select('door_variant_id, asset_id, role, display_order').eq('catalog_revision_id', revisionId),
      supabase.from('assets').select('id, current_path, storage_bucket, storage_object_path').eq('catalog_revision_id', revisionId),
    ])
    const [stylesResult, variantsResult, linesResult, materialsResult, seriesResult, grainsResult, bindingsResult, assetsResult] = results
    const failedResult = results.find((result) => result.error)
    if (failedResult?.error) {
      console.error('Unable to load Door Styles inventory relationships.', failedResult.error)
      setState((current) => ({ ...current, revision: revisionData as CatalogRevision, isLoading: false, error: 'Door Styles or their catalog relationships could not be loaded.' }))
      return
    }

    const styleRecords = (stylesResult.data ?? []) as DoorStyleRecord[]
    const variants = (variantsResult.data ?? []) as DoorVariantRecord[]
    const lines = (linesResult.data ?? []) as DoorLineRecord[]
    const materials = (materialsResult.data ?? []) as NamedRecord[]
    const series = (seriesResult.data ?? []) as NamedRecord[]
    const grains = (grainsResult.data ?? []) as NamedRecord[]
    const bindings = (bindingsResult.data ?? []) as DoorAssetBinding[]
    const assets = (assetsResult.data ?? []) as AssetRecord[]
    const lineById = new Map(lines.map((line) => [line.id, line]))
    const materialById = new Map(materials.map((item) => [item.id, item.display_name]))
    const seriesById = new Map(series.map((item) => [item.id, item.display_name]))
    const grainById = new Map(grains.map((item) => [item.id, item.display_name]))
    const assetById = new Map(assets.map((asset) => [asset.id, asset]))
    const thumbnailStoragePaths = [...new Set(bindings.filter((binding) => binding.role === 'thumbnail')
      .map((binding) => assetById.get(binding.asset_id)?.storage_object_path).filter((path): path is string => Boolean(path)))]
    const signedThumbnailByPath = new Map<string, string>()
    if (thumbnailStoragePaths.length) {
      const { data: signedThumbnails, error: signedThumbnailError } = await supabase.storage.from('door-catalog-assets').createSignedUrls(thumbnailStoragePaths, 3600)
      if (signedThumbnailError) console.error('Unable to create DRAFT thumbnail preview URLs.', signedThumbnailError)
      else for (const signed of signedThumbnails ?? []) if (signed.path && signed.signedUrl) signedThumbnailByPath.set(signed.path, signed.signedUrl)
    }
    const bindingsByVariant = new Map<string, DoorAssetBinding[]>()
    for (const binding of bindings) bindingsByVariant.set(binding.door_variant_id, [...(bindingsByVariant.get(binding.door_variant_id) ?? []), binding])

    const styles = styleRecords.map((style) => {
      const styleVariants = variants.filter((variant) => variant.door_style_id === style.id)
      const styleLines = styleVariants.map((variant) => lineById.get(variant.door_line_id)).filter((line): line is DoorLineRecord => Boolean(line))
      const styleBindings = styleVariants.flatMap((variant) => bindingsByVariant.get(variant.id) ?? [])
      const thumbnailBindings = styleBindings.filter((binding) => binding.role === 'thumbnail')
      const renderBindings = styleBindings.filter((binding) => binding.role === 'slab_render')
      const maskBindings = styleBindings.filter((binding) => binding.role === 'mask')
      const uniqueAssetCount = (records: DoorAssetBinding[]) => new Set(records.map((record) => record.asset_id)).size
      const styleAssetIds = [...new Set(styleBindings.map((binding) => binding.asset_id))]
      const styleAssets = styleAssetIds.map((assetId) => assetById.get(assetId))
      const thumbnailPath = thumbnailBindings.sort((a, b) => a.display_order - b.display_order)
        .map((binding) => assetById.get(binding.asset_id)).map((asset) => asset?.storage_object_path ? signedThumbnailByPath.get(asset.storage_object_path) ?? asset.current_path : asset?.current_path).find(Boolean) ?? null
      const signatureGrains = uniqueSorted(styleVariants.map((variant) => {
        const line = lineById.get(variant.door_line_id)
        const seriesName = line?.series_id ? seriesById.get(line.series_id) : undefined
        return seriesName?.toLowerCase().includes('signature') && variant.grain_id ? grainById.get(variant.grain_id) : undefined
      }))
      return {
        id: style.id, legacyId: style.legacy_id, internalCode: style.internal_code, productCode: style.product_code,
        name: style.display_name, status: style.status, customerSelectable: style.customer_selectable,
        displayOrder: style.display_order, variantCount: styleVariants.length,
        materials: uniqueSorted(styleLines.map((line) => materialById.get(line.material_id))),
        series: uniqueSorted(styleLines.map((line) => line.series_id ? seriesById.get(line.series_id) : undefined)),
        signatureGrains, thumbnailPath, thumbnailCount: uniqueAssetCount(thumbnailBindings),
        renderAssetCount: uniqueAssetCount(renderBindings), maskCount: uniqueAssetCount(maskBindings),
        localAssetCount: styleAssets.filter((asset) => Boolean(asset?.current_path)).length,
        storageAssetCount: styleAssets.filter((asset) => Boolean(asset?.storage_bucket && asset.storage_object_path)).length,
        missingAssetCount: styleAssets.filter((asset) => !asset?.current_path && !asset?.storage_object_path).length,
        hasRequiredAssets: styleVariants.length > 0
          && new Set(thumbnailBindings.map((binding) => binding.door_variant_id)).size === styleVariants.length
          && new Set(renderBindings.map((binding) => binding.door_variant_id)).size === styleVariants.length,
      } satisfies DoorStyleAdminRow
    })
    const materialSeriesOptions = [
      ...materials.map((item) => ({ value: `material:${item.id}`, label: `Material: ${item.display_name}` })),
      ...series.map((item) => ({ value: `series:${item.id}`, label: `Series: ${item.display_name}` })),
    ].sort((a, b) => a.label.localeCompare(b.label))
    setState({ revision: revisionData as CatalogRevision, styles, materialSeriesOptions, variantCount: variants.length, isLoading: false, error: '' })
  }, [])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadDoorStyles(), 0)
    return () => window.clearTimeout(timeoutId)
  }, [loadDoorStyles])

  return { ...state, refresh: loadDoorStyles }
}
