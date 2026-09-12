import { supabase } from './supabase'
import type { LeadSubmission } from '../types/leadSubmission'

export async function submitLead(submission: LeadSubmission) {
  const { data, error } = await supabase.rpc('submit_public_lead', {
    p_first_name: submission.firstName,
    p_last_name: submission.lastName,
    p_email: submission.email,
    p_dealer_slug: submission.dealerSlug ?? null,
    p_phone: submission.phone ?? null,
    p_address: submission.address ?? null,
    p_city: submission.city ?? null,
    p_state: submission.state ?? null,
    p_zip: submission.zip ?? null,
    p_preferred_contact_method: submission.preferredContactMethod ?? null,
    p_project_timeline: submission.projectTimeline ?? null,
    p_comments: submission.comments ?? null,
    p_source: submission.source ?? null,
    p_visualizer_url: submission.visualizerUrl ?? null,
    p_utm_source: submission.utmSource ?? null,
    p_utm_medium: submission.utmMedium ?? null,
    p_utm_campaign: submission.utmCampaign ?? null,
    p_utm_content: submission.utmContent ?? null,
  })

  if (error) {
    console.error('Lead submission failed.', error)
    throw new Error(error.message)
  }

  return { leadId: data as string }
}
