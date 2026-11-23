// Door-field strings are produced by Door Builder's buildDoorBuilderSubmissionPayload
// for a French F764 door with catalog glass, hardware, and sidelites. Hinge option
// is "Not applicable" because that is the live value for a French door.
// scripts/verifySampleLeadParity.ts in Door Builder fails if the live builder drifts.
export const SAMPLE_DOOR_FIELDS = {
  door_configuration: 'French Door',
  door_line: 'Paintable and Stainable Steel',
  door_style: 'F764 - FULL TWIN LITE',
  sidelite_placement: 'Sidelites on Both Sides',
  sidelite_slab: 'FSL - Full Sidelite',
  sidelite_glass: 'Clear Glass',
  main_door_glass: 'Clear Glass',
  door_finish_type: 'Paint',
  door_finish_color: 'White',
  jamb_type: 'Timber',
  jamb_finish_type: 'Paint',
  jamb_finish_color: 'White',
  hardware: 'Schlage Century Handleset - Matte Black',
  lock_setup: 'Lock on Main Door Only',
  door_swing: 'Both slabs operable',
  hinge_option: 'Not applicable',
} as const

export const DEFAULT_SAMPLE_CONTACT = {
  fullName: 'Trisha Sumiran',
  firstName: 'Trisha',
  lastName: 'Sumiran',
  email: 'Trisha.byu@gmail.com',
  phone: '8083934057',
  postalCode: '91762',
}

export const SAMPLE_LEAD_NOTE = 'TEST LEAD — NOT A REAL CUSTOMER'

export type SampleContact = {
  fullName: string
  firstName: string
  lastName: string
  email: string
  phone: string
  postalCode: string
  note: string
}

function requiredText(value: unknown, label: string, max: number) {
  if (typeof value !== 'string') throw new Error(`${label} is required.`)
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > max) throw new Error(`${label} is required.`)
  return trimmed
}

export function sampleContactFromInput(input: unknown): SampleContact {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {}
  const fullName = requiredText(source.fullName ?? DEFAULT_SAMPLE_CONTACT.fullName, 'Full name', 80)
  const firstName = requiredText(source.firstName ?? DEFAULT_SAMPLE_CONTACT.firstName, 'First name', 40)
  const lastName = requiredText(source.lastName ?? DEFAULT_SAMPLE_CONTACT.lastName, 'Last name', 40)
  const email = requiredText(source.email ?? DEFAULT_SAMPLE_CONTACT.email, 'Email', 120)
  const phone = requiredText(source.phone ?? DEFAULT_SAMPLE_CONTACT.phone, 'Phone', 20)
  const postalCode = requiredText(source.postalCode ?? DEFAULT_SAMPLE_CONTACT.postalCode, 'Postal code', 10)
  const note = typeof source.note === 'string' ? source.note.trim().slice(0, 200) : ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter an email address for the sample lead.')
  if (!/^[0-9]{7,15}$/.test(phone)) throw new Error('Enter the sample phone as digits.')
  if (!/^[0-9]{5}$/.test(postalCode)) throw new Error('Enter a 5-digit sample postal code.')
  return { fullName, firstName, lastName, email, phone, postalCode, note }
}

export function buildSampleZapierLead(input: {
  contact: SampleContact
  dealer: { slug: string; companyName: string; leadSource: string }
  submittedAt: string
  testSubmissionId: string
}) {
  const extra = input.contact.note.replace(/^TEST LEAD — NOT A REAL CUSTOMER\s*/, '').trim()
  const dealerName = input.dealer.companyName.replace(/\s+/g, ' ').trim()
  const dealerAnswer = `Working with a dealer: Yes — Dealer: ${dealerName}`
  const notes = `${extra ? `${SAMPLE_LEAD_NOTE} ${extra}` : SAMPLE_LEAD_NOTE}\n${dealerAnswer}`
  return {
    test: true as const,
    test_submission_id: input.testSubmissionId,
    submitted_at: input.submittedAt,
    first_name: input.contact.firstName,
    last_name: input.contact.lastName,
    full_name: input.contact.fullName,
    email: input.contact.email,
    phone: input.contact.phone,
    postal_code: input.contact.postalCode,
    notes,
    working_with_dealer: 'yes' as const,
    working_dealer_name: dealerName,
    ...SAMPLE_DOOR_FIELDS,
    lead_source: input.dealer.leadSource,
    dealer_name: input.dealer.companyName,
    dealer_slug: input.dealer.slug,
  }
}
