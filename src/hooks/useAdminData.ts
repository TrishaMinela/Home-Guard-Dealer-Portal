import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { AdminDataState, AdminDealer, AdminLead } from '../types/admin'

export function useAdminData(): AdminDataState {
  const [dealers, setDealers] = useState<AdminDealer[]>([])
  const [leads, setLeads] = useState<AdminLead[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshVersion, setRefreshVersion] = useState(0)

  const refresh = useCallback(() => {
    setIsLoading(true)
    setRefreshVersion((version) => version + 1)
  }, [])

  useEffect(() => {
    let isCurrent = true

    async function loadAdminData() {
      const [dealerResult, leadResult] = await Promise.all([
        supabase
          .from('dealers')
          .select('id, company_name, slug, primary_contact_name, email, phone, is_active')
          .order('company_name', { ascending: true }),
        supabase
          .from('leads')
          .select('id, dealer_id, first_name, last_name, email, phone, zip, status, created_at')
          .order('created_at', { ascending: false }),
      ])

      if (!isCurrent) return

      if (dealerResult.error || leadResult.error) {
        if (dealerResult.error) {
          console.error('Failed to load dealers for Home Guard Admin.', dealerResult.error)
        }
        if (leadResult.error) {
          console.error('Failed to load leads for Home Guard Admin.', leadResult.error)
        }
        setError('We could not load all Home Guard Admin data. Please try again later.')
      } else {
        setError('')
      }

      setDealers(dealerResult.data ?? [])
      setLeads(leadResult.data ?? [])
      setIsLoading(false)
    }

    void loadAdminData()

    return () => {
      isCurrent = false
    }
  }, [refreshVersion])

  return { dealers, leads, isLoading, error, refresh }
}
