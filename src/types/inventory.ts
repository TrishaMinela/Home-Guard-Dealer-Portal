export type CatalogRevision = {
  id: string
  status: 'draft' | 'published' | 'retired'
  source_commit: string | null
  created_at: string
  updated_at: string
  published_at: string | null
}

export type InventoryCategoryKey =
  | 'door-styles'
  | 'materials-series'
  | 'finishes'
  | 'glass'
  | 'sidelites'
  | 'hardware'
  | 'grids'

export type InventoryCategoryCount = {
  key: InventoryCategoryKey
  label: string
  description: string
  count: number
  countLabel: string
}

export type DoorStyleAdminRow = {
  id: string
  legacyId: string | null
  internalCode: string | null
  productCode: string | null
  name: string
  status: 'active' | 'legacy_only' | 'discontinued'
  customerSelectable: boolean
  displayOrder: number
  variantCount: number
  materials: string[]
  series: string[]
  signatureGrains: string[]
  thumbnailPath: string | null
  thumbnailCount: number
  renderAssetCount: number
  maskCount: number
  localAssetCount: number
  storageAssetCount: number
  missingAssetCount: number
  hasRequiredAssets: boolean
}

export type DoorStyleFilterOption = {
  value: string
  label: string
}
