export type Lead = {
  id: string
  submission_id: string | null
  dealer_id: string | null
  first_name: string
  last_name: string
  email: string
  phone: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  preferred_contact_method: string | null
  project_timeline: string | null
  status: string
  source: string | null
  comments: string | null
  visualizer_url: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_content: string | null
  door_configuration: {
    schemaVersion?: number
    configuration?: Record<string, unknown>
  } | null
  created_at: string
  updated_at: string
}

export type LeadDataState = {
  leads: Lead[]
  isLoading: boolean
  error: string
}
