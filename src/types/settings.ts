export type HomeGuardSettings = {
  id: string
  company_name: string
  logo_url: string | null
  logo_light_url: string | null
  email: string | null
  phone: string | null
  website: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  primary_color: string | null
  secondary_color: string | null
  visualizer_domain: string | null
  created_at: string
  updated_at: string
}

export type HomeGuardSettingsForm = {
  companyName: string
  email: string
  phone: string
  website: string
  address: string
  city: string
  state: string
  zip: string
  primaryColor: string
  secondaryColor: string
  visualizerDomain: string
}
