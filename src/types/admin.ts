import type { Lead } from './lead'

export type AdminDealer = {
  id: string
  company_name: string
  slug: string
  primary_contact_name: string | null
  email: string | null
  phone: string | null
  logo_url: string | null
  logo_light_url: string | null
  logo_generated_light_url?: string | null
  logo_placement?: 'header' | 'hero' | null
  website: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  primary_color: string | null
  secondary_color: string | null
  heading_font_family?: string | null
  heading_font_weight?: number | null
  heading_font_size?: number | null
  body_font_family?: string | null
  body_font_weight?: number | null
  body_font_size?: number | null
  custom_heading_font_url?: string | null
  custom_heading_font_name?: string | null
  custom_heading_font_weight?: number | null
  custom_body_font_url?: string | null
  custom_body_font_name?: string | null
  custom_body_font_weight?: number | null
  is_active: boolean
  created_at: string
  requested_slug: string | null
  slug_request_status: 'pending' | 'rejected' | null
  slug_requested_at: string | null
}

export type AdminLead = Lead

export type AdminDataState = {
  dealers: AdminDealer[]
  leads: AdminLead[]
  isLoading: boolean
  error: string
  refresh: () => void
  replaceDealer: (dealer: AdminDealer) => void
}

export type DealerFormValues = {
  companyName: string
  slug: string
  primaryContactName: string
  email: string
  phone: string
  website: string
  address: string
  city: string
  state: string
  zip: string
  primaryColor: string
  secondaryColor: string
}
