export type Lead = {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  status: string
  source: string | null
  visualizer_url: string | null
  created_at: string
}

export type LeadDataState = {
  leads: Lead[]
  isLoading: boolean
  error: string
}
