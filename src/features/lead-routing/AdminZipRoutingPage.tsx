import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { postLeadRouting } from './api'
import { SalesLeadReviewPage } from './SalespersonPages'
import { TerritoryAdminPage } from './TerritoryAdminPage'
import type { CoverageRow, QueueLead, RoutingStatus, SalespersonRow, TerritoryRow } from './types'

type Person = SalespersonRow & { id: string }
type DealerOption = { id: string; companyName: string }

export function AdminZipRoutingPage() {
  const navigate = useNavigate()
  const [territories, setTerritories] = useState<TerritoryRow[]>([])
  const [coverage, setCoverage] = useState<CoverageRow[]>([])
  const [salespeople, setSalespeople] = useState<Person[]>([])
  const [dealers, setDealers] = useState<DealerOption[]>([])
  const [unassigned, setUnassigned] = useState<QueueLead[]>([])
  const [notice, setNotice] = useState('')
  useEffect(() => {
    let current = true
    void Promise.all([
      supabase.from('zip_territory_assignments').select('zip_code, is_active, salespeople(display_name)').order('zip_code'),
      supabase.from('dealer_zip_coverage').select('zip_code, is_active, dealers(company_name)').order('zip_code'),
      supabase.from('salespeople').select('id, display_name, email, is_active').order('display_name'),
      supabase.from('dealers').select('id, company_name').order('company_name'),
      supabase.from('lead_routing_cases').select('id, lead_id, normalized_zip, status, created_at, leads(first_name, last_name)').eq('status', 'unassigned').order('created_at', { ascending: false }),
    ]).then(([territoryResult, coverageResult, peopleResult, dealerResult, queueResult]) => {
      if (!current) return
      if (territoryResult.error || coverageResult.error || peopleResult.error) {
        setNotice('ZIP routing tables are not available in this environment yet. Nothing was changed.')
        return
      }
      setTerritories((territoryResult.data ?? []).map((row) => ({ zip: row.zip_code, salesperson: label(row.salespeople, 'display_name'), active: row.is_active })))
      setCoverage((coverageResult.data ?? []).map((row) => ({ zip: row.zip_code, dealer: label(row.dealers, 'company_name'), active: row.is_active })))
      setSalespeople((peopleResult.data ?? []).map((row) => ({ id: row.id, name: row.display_name, email: row.email, active: row.is_active })))
      setDealers((dealerResult.data ?? []).map((row) => ({ id: row.id, companyName: row.company_name })))
      setUnassigned((queueResult.data ?? []).map((row) => ({
        caseId: row.id,
        leadId: row.lead_id,
        name: leadName(row.leads),
        zip: row.normalized_zip ?? 'Invalid',
        status: row.status as RoutingStatus,
        reason: 'No active salesperson for this ZIP.',
        dealerName: 'Not proposed',
        createdLabel: row.created_at.slice(0, 16).replace('T', ' '),
      })))
    })
    return () => { current = false }
  }, [])

  async function save(action: string, body: Record<string, unknown>, success: string) {
    const result = await postLeadRouting({ action, ...body })
    const disabled = result.payload.error === 'lead_routing_disabled' || result.payload.result === 'disabled'
    setNotice(disabled ? 'Lead routing is disabled in this environment, so nothing was saved and no notification was sent.' : result.ok ? success : 'The change was not saved.')
  }

  return (
    <TerritoryAdminPage
      territories={territories}
      coverage={coverage}
      salespeople={salespeople}
      unassigned={unassigned}
      notice={notice}
      onOpen={(leadId) => navigate(`/admin/lead-routing/${leadId}`)}
      onSaveTerritory={(zip, salesperson) => {
        const match = salespeople.find((person) => person.name === salesperson)
        void save('save_territory', { zip, salespersonId: match?.id ?? null, active: true }, 'Territory saved.')
      }}
      onSaveCoverage={(zip, dealer) => {
        const match = dealers.find((item) => item.companyName === dealer)
        if (!match) {
          setNotice('Enter the dealer company name exactly. Coverage was not saved.')
          return
        }
        void save('save_coverage', { dealerId: match.id, zip, active: true }, 'Dealer coverage saved.')
      }}
    />
  )
}

export function AdminLeadRoutingReviewPage() {
  return <SalesLeadReviewPage />
}

function label(value: unknown, key: 'display_name' | 'company_name') {
  const row = Array.isArray(value) ? value[0] : value
  if (!row || typeof row !== 'object') return 'Unassigned'
  const record = row as Record<string, unknown>
  return typeof record[key] === 'string' ? record[key] : 'Unassigned'
}

function leadName(value: unknown) {
  const row = Array.isArray(value) ? value[0] : value
  if (!row || typeof row !== 'object') return 'Homeowner'
  const record = row as { first_name?: string; last_name?: string }
  return `${record.first_name ?? ''} ${record.last_name ?? ''}`.trim() || 'Homeowner'
}
