export type SetupStatus = 'ready' | 'needs-info' | 'confirm'

export type SetupItem = {
  id: string
  title: string
  detail: string
  status: SetupStatus
}

export type DealerSetupSource = {
  company_name?: string | null
  slug?: string | null
  primary_contact_name?: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  logo_url?: string | null
  logo_light_url?: string | null
  logo_generated_light_url?: string | null
  logo_generated_light_usable?: boolean | null
  logo_black_url?: string | null
  logo_generated_black_url?: string | null
  logo_generated_black_usable?: boolean | null
  logo_header_variant?: string | null
  logo_pages_variant?: string | null
  primary_color?: string | null
  secondary_color?: string | null
  heading_font_family?: string | null
  body_font_family?: string | null
}

function filled(value: string | null | undefined) {
  return Boolean(value?.trim())
}

function hasWhiteLogo(dealer: DealerSetupSource) {
  return filled(dealer.logo_light_url) || (dealer.logo_generated_light_usable === true && filled(dealer.logo_generated_light_url))
}

function hasBlackLogo(dealer: DealerSetupSource) {
  return filled(dealer.logo_black_url) || (dealer.logo_generated_black_usable === true && filled(dealer.logo_generated_black_url))
}

export function dealerSetupChecklist(dealer: DealerSetupSource): SetupItem[] {
  const missingCompany = [
    ['primary contact', dealer.primary_contact_name],
    ['email', dealer.email],
    ['phone', dealer.phone],
    ['address', dealer.address],
    ['city', dealer.city],
    ['state', dealer.state],
    ['ZIP', dealer.zip],
  ].filter(([, value]) => !filled(value as string | null)).map(([label]) => label)

  return [
    {
      id: 'company-details',
      title: 'Company details',
      status: missingCompany.length === 0 ? 'ready' : 'needs-info',
      detail: missingCompany.length === 0
        ? 'Contact, address, and phone are saved on this dealer.'
        : `Still needed: ${missingCompany.join(', ')}.`,
    },
    {
      id: 'door-builder-url',
      title: 'Dealer slug and Door Builder URL',
      status: filled(dealer.slug) ? 'ready' : 'needs-info',
      detail: filled(dealer.slug)
        ? `The public Door Builder address uses /${dealer.slug?.trim()}.`
        : 'A slug is required before the Door Builder URL can be shared.',
    },
    {
      id: 'dealer-admin',
      title: 'Dealer admin access',
      status: 'confirm',
      detail: 'Confirm in Dealer Users that a person can sign in. This checklist cannot see invitations.',
    },
    {
      id: 'logo-original',
      title: 'Original logo',
      status: filled(dealer.logo_url) ? 'ready' : 'needs-info',
      detail: filled(dealer.logo_url) ? 'An original logo is saved.' : 'Upload the original logo in Branding.',
    },
    {
      id: 'logo-white',
      title: 'White logo',
      status: hasWhiteLogo(dealer) ? 'ready' : 'needs-info',
      detail: hasWhiteLogo(dealer) ? 'A white logo is saved and readable.' : 'Add a white logo, or generate one that passes the readability check.',
    },
    {
      id: 'logo-black',
      title: 'Black logo',
      status: hasBlackLogo(dealer) ? 'ready' : 'needs-info',
      detail: hasBlackLogo(dealer) ? 'A black logo is saved and readable.' : 'Add a black logo, or generate one that passes the readability check.',
    },
    {
      id: 'homepage-logo',
      title: 'Homepage logo selection',
      status: filled(dealer.logo_header_variant) ? 'ready' : 'needs-info',
      detail: filled(dealer.logo_header_variant)
        ? `Homepage logo is set to ${dealer.logo_header_variant}.`
        : 'Choose the Original, White, or Black logo for the Door Builder homepage.',
    },
    {
      id: 'pages-logo',
      title: 'Normal Pages logo selection',
      status: filled(dealer.logo_pages_variant) ? 'ready' : 'needs-info',
      detail: filled(dealer.logo_pages_variant)
        ? `Other pages use the ${dealer.logo_pages_variant} logo.`
        : 'Choose the logo used on Door Builder pages other than the homepage.',
    },
    {
      id: 'colors',
      title: 'Branding colors',
      status: filled(dealer.primary_color) && filled(dealer.secondary_color) ? 'ready' : 'needs-info',
      detail: 'Colors are edited on the Branding screen. They change Door Builder, not marketing banners.',
    },
    {
      id: 'typography',
      title: 'Typography',
      status: filled(dealer.heading_font_family) || filled(dealer.body_font_family) ? 'ready' : 'needs-info',
      detail: filled(dealer.heading_font_family) || filled(dealer.body_font_family)
        ? 'Custom typography is saved for Door Builder.'
        : 'Door Builder is still using Home Guard default type. Review it before calling setup finished.',
    },
    {
      id: 'marketing',
      title: 'Marketing Tools and Banner Library',
      status: 'confirm',
      detail: 'Open Marketing Tools and try a banner. This list does not mark that done automatically.',
    },
    {
      id: 'workflows',
      title: 'Zapier, Google Sheets, and Personify',
      status: 'confirm',
      detail: 'Confirm these workflows outside the portal. A saved portal field does not mean they are connected.',
    },
    {
      id: 'crm',
      title: 'CRM integration',
      status: 'confirm',
      detail: 'Lead delivery stays off on purpose. A saved CRM record does not mean leads are being delivered.',
    },
    {
      id: 'lead-routing',
      title: 'Lead routing verification',
      status: 'confirm',
      detail: 'Have someone confirm a real lead reaches this dealer. This checklist cannot verify routing.',
    },
  ]
}
