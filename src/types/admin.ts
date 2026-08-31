export type AdminDealer = {
  id: string
  company_name: string
  slug: string
  primary_contact_name: string | null
  email: string | null
  phone: string | null
  is_active: boolean
}

export type AdminLead = {
  id: string
  dealer_id: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  zip: string | null
  status: string
  created_at: string
}

export type AdminDataState = {
  dealers: AdminDealer[]
  leads: AdminLead[]
  isLoading: boolean
  error: string
  refresh: () => void
}
