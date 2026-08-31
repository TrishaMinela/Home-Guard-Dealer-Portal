export type AdminDealer = {
  id: string
  company_name: string
  slug: string
  primary_contact_name: string | null
  email: string | null
  phone: string | null
  website: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  primary_color: string | null
  secondary_color: string | null
  is_active: boolean
  created_at: string
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
