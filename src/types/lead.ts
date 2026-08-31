export type Lead = {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  zip: string | null
  status: string
  created_at: string
}

export type LeadDataState = {
  leads: Lead[]
  isLoading: boolean
  error: string
}
