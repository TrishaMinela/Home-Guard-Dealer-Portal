export type LeadSubmission = {
  firstName: string
  lastName: string
  email: string
  dealerSlug?: string | null
  phone?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  preferredContactMethod?: string | null
  projectTimeline?: string | null
  comments?: string | null
  source?: string | null
  visualizerUrl?: string | null
  utmSource?: string | null
  utmMedium?: string | null
  utmCampaign?: string | null
  utmContent?: string | null
}

