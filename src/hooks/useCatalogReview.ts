import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { CatalogRevision } from '../types/inventory'

export const changeLabels: Record<string, string> = {
  name: 'Name', status: 'Status', visibility: 'Visibility', order: 'Display order',
  availability: 'Material / series', grain_availability: 'Signature grain',
  thumbnail: 'Thumbnail', render: 'Render artwork', mask: 'Mask',
}
export type CatalogChange = {
  styleId: string; styleName: string; type: string; label: string
  before: string | number | boolean | null; after: string | number | boolean | null
  context: string; beforeAssetId: string | null; afterAssetId: string | null
  changedAt: string | null; changedBy: string | null
}
export type ReviewData = {
  revision: CatalogRevision; changes: CatalogChange[]; fingerprint: string
  errors: { message: string; styleId: string | null }[]
  styleCount: number; variantCount: number
  assets: { id: string; bucket: string | null; path: string | null }[]
  history: { id: string; status: string; base_revision_id: string | null; published_at: string; published_by: string | null; publication_change_count: number | null; publication_style_count: number | null }[]
}

export function useCatalogReview() {
  const [data, setData] = useState<ReviewData | null>(null)
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const refresh = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const result = await supabase.rpc('review_door_catalog')
      if (result.error) throw result.error
      const next = result.data as ReviewData
      const urls: Record<string, string> = {}
      const buckets = [...new Set(next.assets.map(asset => asset.bucket).filter((bucket): bucket is string => Boolean(bucket)))]
      await Promise.all(buckets.map(async bucket => {
        const assets = next.assets.filter(asset => asset.bucket === bucket && asset.path)
        const signed = await supabase.storage.from(bucket).createSignedUrls(assets.map(asset => asset.path!), 900)
        for (const asset of assets) {
          const url = signed.data?.find(item => item.path === asset.path)?.signedUrl
          if (url) urls[asset.id] = url
        }
      }))
      setAssetUrls(urls); setData(next)
      return next
    } catch (failure) {
      const message = failure && typeof failure === 'object' && 'message' in failure ? String(failure.message) : 'The catalog review could not be loaded.'
      setError(/function|schema cache/i.test(message) ? 'The inventory review database update is not installed yet. Ask the portal administrator to apply the DEV migration.' : message)
      return null
    } finally { setLoading(false) }
  }, [])
  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0)
    return () => window.clearTimeout(timer)
  }, [refresh])
  return { data, assetUrls, error, loading, refresh }
}
