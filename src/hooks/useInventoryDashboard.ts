import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { CatalogRevision, InventoryCategoryCount } from '../types/inventory'

type InventoryDashboardState = {
  revision: CatalogRevision | null
  categories: InventoryCategoryCount[]
  isLoading: boolean
  error: string
}

const categoryDefinitions = [
  {
    key: 'door-styles',
    label: 'Door Styles',
    description: 'Door designs and product style records.',
    tables: ['door_styles'],
  },
  {
    key: 'materials-series',
    label: 'Door Materials / Series',
    description: 'Door construction materials and their product series.',
    tables: ['materials', 'series'],
  },
  {
    key: 'finishes',
    label: 'Finishes',
    description: 'Paint and stain finish options.',
    tables: ['finishes'],
  },
  {
    key: 'glass',
    label: 'Glass',
    description: 'Selectable glass options and their scoped designs.',
    tables: ['glass_options'],
  },
  {
    key: 'sidelites',
    label: 'Sidelites',
    description: 'Sidelite product variants available with entry doors.',
    tables: ['sidelite_variants'],
  },
  {
    key: 'hardware',
    label: 'Hardware',
    description: 'Sellable hardware variants, styles, and finishes.',
    tables: ['hardware_variants'],
  },
  {
    key: 'grids',
    label: 'Grids',
    description: 'Grid patterns available for configured glass.',
    tables: ['grid_patterns'],
  },
] as const

async function countRevisionRows(table: string, revisionId: string) {
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq('catalog_revision_id', revisionId)

  if (error) throw error
  return count ?? 0
}

export function useInventoryDashboard() {
  const [state, setState] = useState<InventoryDashboardState>({
    revision: null,
    categories: [],
    isLoading: true,
    error: '',
  })

  const loadInventory = useCallback(async () => {
    setState((current) => ({ ...current, isLoading: true, error: '' }))

    const { data: revisionData, error: revisionError } = await supabase
      .from('catalog_revisions')
      .select('id, status, source_commit, created_at, updated_at, published_at')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (revisionError) {
      console.error('Unable to load the inventory catalog revision.', revisionError)
      setState({
        revision: null,
        categories: [],
        isLoading: false,
        error: 'We could not load the inventory catalog right now. Please try again later.',
      })
      return
    }

    if (!revisionData) {
      setState({ revision: null, categories: [], isLoading: false, error: '' })
      return
    }

    try {
      const categories = await Promise.all(
        categoryDefinitions.map(async (definition) => {
          const tableCounts = await Promise.all(
            definition.tables.map((table) => countRevisionRows(table, revisionData.id)),
          )
          const count = tableCounts.reduce((total, value) => total + value, 0)
          const countLabel = definition.tables.length === 2
            ? `${tableCounts[0]} materials · ${tableCounts[1]} series`
            : `${count} ${count === 1 ? 'record' : 'records'}`

          return {
            key: definition.key,
            label: definition.label,
            description: definition.description,
            count,
            countLabel,
          }
        }),
      )

      setState({
        revision: revisionData as CatalogRevision,
        categories,
        isLoading: false,
        error: '',
      })
    } catch (countError) {
      console.error('Unable to load inventory category counts.', countError)
      setState({
        revision: revisionData as CatalogRevision,
        categories: [],
        isLoading: false,
        error: 'The catalog was found, but its inventory counts could not be loaded.',
      })
    }
  }, [])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadInventory(), 0)
    return () => window.clearTimeout(timeoutId)
  }, [loadInventory])

  return { ...state, refresh: loadInventory }
}
