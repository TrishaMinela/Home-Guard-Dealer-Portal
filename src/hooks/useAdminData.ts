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

  const replaceDealer = useCallback((updatedDealer: AdminDealer) => {
    setDealers((current) =>
      current
        .map((dealer) =>
          dealer.id === updatedDealer.id ? updatedDealer : dealer,
        )
        .sort((a, b) => a.company_name.localeCompare(b.company_name)),
    )
  }, [])

  useEffect(() => {
    let isCurrent = true

    async function loadAdminData() {
      const [dealerResult, leadResult] = await Promise.all([
        supabase
          .from('dealers')
          .select('id, company_name, slug, logo_url, logo_light_url, primary_contact_name, email, phone, website, address, city, state, zip, primary_color, secondary_color, is_active, created_at, requested_slug, slug_request_status, slug_requested_at')
          .order('company_name', { ascending: true }),
        supabase
          .from('leads')
          .select('id, submission_id, dealer_id, first_name, last_name, email, phone, address, city, state, zip, preferred_contact_method, project_timeline, comments, status, source, visualizer_url, utm_source, utm_medium, utm_campaign, utm_content, door_configuration, created_at, updated_at')
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

  return { dealers, leads, isLoading, error, refresh, replaceDealer }
}
