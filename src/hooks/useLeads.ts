import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Lead, LeadDataState } from '../types/lead'

export function useLeads(): LeadDataState {
  const [leads, setLeads] = useState<Lead[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let isCurrent = true

    async function loadLeads() {
      const { data, error: queryError } = await supabase
        .from('leads')
        .select('id, first_name, last_name, email, phone, address, city, state, zip, status, source, visualizer_url, created_at')
        .order('created_at', { ascending: false })

      if (!isCurrent) return

      if (queryError) {
        console.error('Failed to load dealer leads from Supabase.', queryError)
        setError('We could not load your leads. Please try again later.')
        setLeads([])
      } else {
        setLeads(data ?? [])
        setError('')
      }

      setIsLoading(false)
    }

    void loadLeads()

    return () => {
      isCurrent = false
    }
  }, [])

  return { leads, isLoading, error }
}
