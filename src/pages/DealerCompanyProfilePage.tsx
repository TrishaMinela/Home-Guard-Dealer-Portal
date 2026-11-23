import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import type { DealerAccount } from '../types/account'
import type { DealerFormValues } from '../types/admin'
import { isReservedDealerSlug, normalizeDealerSlug } from '../utils/dealerSlug'
import {
  UNSAVED_PROFILE_LEAVE_MESSAGE,
  UNSAVED_PROFILE_SECTION_MESSAGE,
  unsavedProfileClickFromEvent,
  unsavedProfileNavigationKind,
} from '../utils/unsavedProfileNavigation'
import { getDealerVisualizerDisplayUrl } from '../config/visualizer'
import { DealerTypographySettings } from '../components/DealerTypographySettings'
import { BrandingAppearanceWorkspace } from '../components/BrandingAppearanceWorkspace'
import { dealerTypographyValues, typographyPayload, type DealerTypographyValues } from '../utils/dealerTypography'
import { generateDefaultDealerLightLogo } from '../utils/dealerLightLogo'
import { DealerLogoPlacementSettings, type DealerLogoPlacement } from '../components/DealerLogoPlacementSettings'
import { DoorBuilderAppearanceSettings } from '../components/DoorBuilderAppearanceSettings'
import { appearanceEquals, appearanceRpcArgs, type DoorBuilderAppearance } from '../utils/doorBuilderAppearance'
import { DealerLogoDisplaySettings } from '../components/DealerLogoDisplaySettings'
import { normalizeLogoDisplay, type DealerLogoDisplay } from '../utils/dealerLogoVariants'
import { DealerLogoVariantSettings } from '../components/DealerLogoVariantSettings'
import { LogoBackgroundDialog } from '../components/LogoBackgroundDialog'
import { readLogoForRemoval } from '../utils/readLogoForRemoval'
import { generatedLightLogoMessage, lightLogoEyebrow, logoVariantSavePlan, type DealerLogoVariant } from '../utils/dealerLogoVariants'

type DealerCompanyProfilePageProps = {
  dealer: DealerAccount
  canEditAppearance?: boolean
  onDealerUpdated: (dealer: DealerAccount) => void
}

function dealerToForm(dealer: DealerAccount): DealerFormValues {
  return {
    companyName: dealer.company_name,
    slug: dealer.slug,
    primaryContactName: dealer.primary_contact_name ?? '',
    email: dealer.email ?? '',
    phone: dealer.phone ?? '',
    website: dealer.website ?? '',
    address: dealer.address ?? '',
    city: dealer.city ?? '',
    state: dealer.state ?? '',
    zip: dealer.zip ?? '',
    primaryColor: dealer.primary_color ?? '',
    secondaryColor: dealer.secondary_color ?? '',
  }
}

const logoExtensions: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
}

export function DealerCompanyProfilePage({
  dealer,
  canEditAppearance = false,
  onDealerUpdated,
}: DealerCompanyProfilePageProps) {
  const [form, setForm] = useState(() => dealerToForm(dealer))
  const [placementDraft, setPlacementDraft] = useState<DealerLogoPlacement | null>(null)
  const [displayDraft, setDisplayDraft] = useState<DealerLogoDisplay | null>(null)
  const [variantDraft, setVariantDraft] = useState<Partial<DealerAccount> | null>(null)
  const [typographyDraft, setTypographyDraft] = useState<DealerTypographyValues | null>(null)
  const [appearanceDraft, setAppearanceDraft] = useState<DoorBuilderAppearance | null | undefined>(undefined)
  const profileDirty = JSON.stringify(form) !== JSON.stringify(dealerToForm(dealer))
  useEffect(() => {
    if (!profileDirty) return
    const onLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    // BrowserRouter has no useBlocker. Capture same-tab link clicks, including the sidebar, while this form is dirty.
    const onClick = (event: MouseEvent) => {
      const kind = unsavedProfileNavigationKind(unsavedProfileClickFromEvent(event, true), window.location.href)
      if (kind === 'allow') return
      const message = kind === 'section' ? UNSAVED_PROFILE_SECTION_MESSAGE : UNSAVED_PROFILE_LEAVE_MESSAGE
      if (window.confirm(message)) return
      event.preventDefault()
      event.stopPropagation()
    }
    window.addEventListener('beforeunload', onLeave)
    document.addEventListener('click', onClick, true)
    return () => {
      window.removeEventListener('beforeunload', onLeave)
      document.removeEventListener('click', onClick, true)
    }
  }, [profileDirty])
  const [requestedSlug, setRequestedSlug] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState<'primary' | 'light' | 'black' | null>(null)
  const [removal, setRemoval] = useState<{ file: File; originalUrl: string; removedUrl: string; reason: string; png: Blob } | null>(null)
  const [removalNotice, setRemovalNotice] = useState('')
  const [isGeneratingLightLogo, setIsGeneratingLightLogo] = useState(false)
  const [isRequestingSlug, setIsRequestingSlug] = useState(false)
  const normalizedRequestedSlug = normalizeDealerSlug(requestedSlug)

  function updateField(field: keyof DealerFormValues, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function updateProfile(
    values: DealerFormValues,
    logoUrl: string | null,
    logoLightUrl: string | null,
  ) {
    return supabase
      .rpc('update_my_dealer_profile', {
        p_dealer_id: dealer.id,
        p_company_name: values.companyName,
        p_primary_contact_name: values.primaryContactName,
        p_email: values.email,
        p_phone: values.phone,
        p_website: values.website,
        p_address: values.address,
        p_city: values.city,
        p_state: values.state,
        p_zip: values.zip,
        p_primary_color: values.primaryColor,
        p_secondary_color: values.secondaryColor,
        p_logo_url: logoUrl ?? '',
        p_logo_light_url: logoLightUrl ?? '',
      })
      .single()
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')
    setError('')
    setIsSaving(true)

    const { data, error: updateError } = await updateProfile(
      form,
      dealer.logo_url,
      dealer.logo_light_url,
    )

    if (updateError) {
      console.error('Failed to update dealer profile.', updateError)
      setError('We could not save your company profile. Please try again.')
      setIsSaving(false)
      return
    }

    const updatedDealer = data as DealerAccount
    onDealerUpdated(updatedDealer)
    setForm(dealerToForm(updatedDealer))
    setMessage('Company profile saved successfully.')
    setIsSaving(false)
  }

  async function saveRemovedBackground(file: File, png: Blob, reason: string) {
    setUploadingLogo('primary')
    const sourceExtension = logoExtensions[file.type] ?? 'png'
    const sourcePath = `${dealer.id}/logo-source.${sourceExtension}`
    const transparentPath = `${dealer.id}/logo.png`
    const [sourceUpload, transparentUpload] = await Promise.all([
      supabase.storage.from('dealer-logos').upload(sourcePath, file, { contentType: file.type, upsert: true }),
      supabase.storage.from('dealer-logos').upload(transparentPath, png, { contentType: 'image/png', upsert: true }),
    ])
    if (sourceUpload.error || transparentUpload.error) {
      setError('We could not save the transparent logo. The original was not replaced.')
      setUploadingLogo(null)
      return false
    }
    const sourceUrl = `${supabase.storage.from('dealer-logos').getPublicUrl(sourcePath).data.publicUrl}?v=${Date.now()}`
    const transparentUrl = `${supabase.storage.from('dealer-logos').getPublicUrl(transparentPath).data.publicUrl}?v=${Date.now()}`
    const { data, error: saveError } = await supabase.rpc('update_my_dealer_logo_assets', {
      p_dealer_id: dealer.id,
      p_logo_url: transparentUrl,
      p_logo_source_url: sourceUrl,
      p_logo_light_url: dealer.logo_light_url ?? '',
      p_logo_black_url: dealer.logo_black_url ?? '',
    }).single()
    if (saveError) {
      setError('The files uploaded, but the logo record could not be saved.')
      setUploadingLogo(null)
      return false
    }
    let updatedDealer: DealerAccount = { ...dealer, ...(data as DealerAccount), logo_url: transparentUrl, logo_source_url: sourceUrl }
    setIsGeneratingLightLogo(true)
    const generated = await generateDefaultDealerLightLogo(dealer.id)
    setIsGeneratingLightLogo(false)
    setUploadingLogo(null)
    if (generated.error || !generated.generatedLightLogoUrl) {
      onDealerUpdated(updatedDealer)
      setError('The transparent logo was saved, but its default light version could not be generated. You can retry below.')
      return true
    }
    updatedDealer = {
      ...updatedDealer,
      logo_generated_light_url: generated.generatedLightLogoUrl,
      logo_generated_light_usable: generated.generatedLightUsable,
    }
    onDealerUpdated(updatedDealer)
    setMessage(`${reason.replace(/\.$/, '')} removed. ${generatedLightLogoMessage(generated.generatedLightUsable, 'primary')}`)
    return true
  }

  async function handleLogoUpload(
    event: ChangeEvent<HTMLInputElement>,
    logoType: 'primary' | 'light' | 'black',
  ) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setMessage('')
    setError('')

    const extension = logoExtensions[file.type]
    if (!extension) {
      setError('Choose a PNG, JPEG, WebP, or SVG logo.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Dealer logos must be 5 MB or smaller.')
      return
    }

    if (logoType === 'primary' && file.type !== 'image/svg+xml') {
      const inspected = await readLogoForRemoval(file)
      if (inspected.confident && inspected.png) {
        setRemovalNotice('')
        setRemoval({
          file,
          originalUrl: URL.createObjectURL(file),
          removedUrl: URL.createObjectURL(inspected.png),
          reason: inspected.reason,
          png: inspected.png,
        })
        return
      }
      setRemovalNotice(inspected.confident
        ? 'The background could be removed, but this browser could not save a PNG. The original file was kept.'
        : inspected.reason)
    }

    await storeUploadedLogo(file, logoType)
  }

  async function storeUploadedLogo(file: File, logoType: 'primary' | 'light' | 'black') {
    const extension = logoExtensions[file.type]
    if (!extension) return
    setUploadingLogo(logoType)
    const filename = logoType === 'primary' ? 'logo' : logoType === 'black' ? 'logo-black' : 'logo-light'
    const objectPath = `${dealer.id}/${filename}.${extension}`
    const { error: uploadError } = await supabase.storage
      .from('dealer-logos')
      .upload(objectPath, file, { contentType: file.type, upsert: true })

    if (uploadError) {
      console.error('Failed to upload dealer logo.', uploadError)
      setError('We could not upload your logo. Please try again.')
      setUploadingLogo(null)
      return
    }

    const { data: publicUrlData } = supabase.storage
      .from('dealer-logos')
      .getPublicUrl(objectPath)
    const versionedPublicUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`
    if (logoType === 'black') {
      const { data: blackData, error: blackError } = await supabase.rpc('update_my_dealer_logo_assets', {
        p_dealer_id: dealer.id,
        p_logo_url: dealer.logo_url ?? '',
        p_logo_source_url: dealer.logo_source_url ?? '',
        p_logo_light_url: dealer.logo_light_url ?? '',
        p_logo_black_url: versionedPublicUrl,
      }).single()
      setUploadingLogo(null)
      if (blackError) {
        setError('The black logo uploaded, but it could not be saved. Apply the logo migration, then try again.')
        return
      }
      onDealerUpdated({ ...dealer, ...(blackData as DealerAccount), logo_black_url: versionedPublicUrl })
      setMessage('Custom black logo updated successfully.')
      return
    }
    const { data, error: profileError } = await updateProfile(
      dealerToForm(dealer),
      logoType === 'primary' ? versionedPublicUrl : dealer.logo_url,
      logoType === 'light' ? versionedPublicUrl : dealer.logo_light_url,
    )

    if (profileError) {
      console.error('Logo uploaded but profile URL could not be saved.', profileError)
      setError('The logo uploaded, but we could not save it to your profile.')
      setUploadingLogo(null)
      return
    }

    let updatedDealer = data as DealerAccount
    let generatedUsable: boolean | null = null
    if (logoType === 'primary') {
      setIsGeneratingLightLogo(true)
      const generated = await generateDefaultDealerLightLogo(dealer.id)
      setIsGeneratingLightLogo(false)
      if (generated.error || !generated.generatedLightLogoUrl) {
        onDealerUpdated(updatedDealer)
        setError('The primary logo was saved, but its default light version could not be generated. You can retry below.')
        setUploadingLogo(null)
        return
      }
      generatedUsable = generated.generatedLightUsable
      updatedDealer = {
        ...updatedDealer,
        logo_generated_light_url: generated.generatedLightLogoUrl,
        logo_generated_light_usable: generated.generatedLightUsable,
      }
    }

    onDealerUpdated(updatedDealer)
    setMessage(logoType === 'primary'
      ? generatedLightLogoMessage(generatedUsable, 'primary')
      : 'Custom white logo updated successfully.')
    setUploadingLogo(null)
  }

  async function handleGenerateLightLogo() {
    setMessage('')
    setError('')
    setIsGeneratingLightLogo(true)
    const result = await generateDefaultDealerLightLogo(dealer.id)
    setIsGeneratingLightLogo(false)
    if (result.error || !result.generatedLightLogoUrl) {
      setError(result.error ?? 'We could not generate the default light logo.')
      return
    }
    onDealerUpdated({
      ...dealer,
      logo_generated_light_url: result.generatedLightLogoUrl,
      logo_generated_light_usable: result.generatedLightUsable,
    })
    setMessage(generatedLightLogoMessage(result.generatedLightUsable, 'regenerate'))
  }

  async function handleGenerateBlackLogo() {
    setMessage('')
    setError('')
    setIsGeneratingLightLogo(true)
    const result = await generateDefaultDealerLightLogo(dealer.id, 'black')
    setIsGeneratingLightLogo(false)
    if (result.error || !result.generatedLogoUrl) {
      setError(result.error ?? 'We could not generate the black logo.')
      return
    }
    onDealerUpdated({ ...dealer, logo_generated_black_url: result.generatedLogoUrl, logo_generated_black_usable: result.generatedLogoUsable })
    setMessage(result.generatedLogoUsable ? 'Black logo generated.' : 'A black logo was generated, but it is not readable enough to offer.')
  }

  function dismissRemoval() {
    if (!removal) return
    URL.revokeObjectURL(removal.originalUrl)
    URL.revokeObjectURL(removal.removedUrl)
    setRemoval(null)
  }

  async function acceptTransparentLogo() {
    if (!removal) return
    const saved = await saveRemovedBackground(removal.file, removal.png, removal.reason)
    if (saved) dismissRemoval()
  }

  async function keepOriginalLogo() {
    if (!removal) return
    const file = removal.file
    dismissRemoval()
    await storeUploadedLogo(file, 'primary')
  }

  async function restoreOriginalLogo() {
    if (!dealer.logo_source_url) return
    const { data, error: saveError } = await supabase.rpc('update_my_dealer_logo_assets', {
      p_dealer_id: dealer.id,
      p_logo_url: dealer.logo_source_url,
      p_logo_source_url: dealer.logo_source_url,
      p_logo_light_url: dealer.logo_light_url ?? '',
      p_logo_black_url: dealer.logo_black_url ?? '',
    }).single()
    if (saveError) {
      setError('We could not restore the original logo.')
      return
    }
    onDealerUpdated({ ...dealer, ...(data as DealerAccount), logo_url: dealer.logo_source_url })
    setMessage('Original logo restored.')
  }

  async function handleRemoveCustomLightLogo() {
    setMessage('')
    setError('')
    setIsGeneratingLightLogo(true)
    const { data, error: updateError } = await updateProfile(dealerToForm(dealer), dealer.logo_url, null)
    setIsGeneratingLightLogo(false)
    if (updateError) {
      setError('We could not remove the custom light logo. Please try again.')
      return
    }
    onDealerUpdated({ ...dealer, ...(data as DealerAccount), logo_light_url: null })
    setMessage(dealer.logo_generated_light_usable === true
      ? 'Custom light logo removed. The generated default is now in use.'
      : 'Custom light logo removed.')
  }

  async function handleSlugRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')
    setError('')

    if (!normalizedRequestedSlug) {
      setError('Enter a valid Visualizer URL slug.')
      return
    }
    if (isReservedDealerSlug(normalizedRequestedSlug)) {
      setError('This dealer slug is reserved for the Door Builder. Please choose another URL.')
      return
    }

    setIsRequestingSlug(true)
    const { data, error: requestError } = await supabase
      .rpc('request_my_dealer_slug', {
        p_dealer_id: dealer.id,
        p_requested_slug: requestedSlug,
      })
      .single()

    if (requestError) {
      console.error('Failed to request dealer slug.', requestError)
      setError(
        requestError.code === '23505'
          ? 'This Visualizer URL is already in use or awaiting approval.'
          : 'We could not submit your URL request. Please try again.',
      )
      setIsRequestingSlug(false)
      return
    }

    onDealerUpdated(data as DealerAccount)
    setRequestedSlug('')
    setMessage('Visualizer URL request submitted for Home Guard approval.')
    setIsRequestingSlug(false)
  }

  async function saveTypography(values: DealerTypographyValues) {
    const payload=typographyPayload(values)
    const {data,error:saveError}=await supabase.rpc('update_my_dealer_typography',{
      p_dealer_id:dealer.id,p_heading_font_family:payload.heading_font_family,p_heading_font_weight:payload.heading_font_weight,p_heading_font_size:payload.heading_font_size,
      p_body_font_family:payload.body_font_family,p_body_font_weight:payload.body_font_weight,p_body_font_size:payload.body_font_size,
      p_custom_heading_font_url:payload.custom_heading_font_url,p_custom_heading_font_name:payload.custom_heading_font_name,p_custom_heading_font_weight:payload.custom_heading_font_weight,
      p_custom_body_font_url:payload.custom_body_font_url,p_custom_body_font_name:payload.custom_body_font_name,p_custom_body_font_weight:payload.custom_body_font_weight,
    }).single()
    if(saveError) throw saveError
    return data as DealerAccount
  }

  async function saveLogoVariants(variants: {
    header: DealerLogoVariant | null
    pages: DealerLogoVariant | null
    secondaryHeader: DealerLogoVariant | null
    secondaryPages: DealerLogoVariant | null
  }) {
    const plan = logoVariantSavePlan(dealer.logo_display, variants.header, variants.pages, variants.secondaryHeader, variants.secondaryPages)
    if (plan.mode === 'primary') {
      const written = plan.fields
      const { data, error: saveError } = await supabase
        .rpc('update_my_dealer_logo_variants', {
          p_dealer_id: dealer.id,
          p_logo_header_variant: written.logo_header_variant,
          p_logo_pages_variant: written.logo_pages_variant,
        })
        .single()
      if (saveError) throw saveError
      return { ...dealer, ...(data as DealerAccount), ...written }
    }
    const { data, error: saveError } = await supabase
      .rpc('update_my_dealer_all_logo_variants', {
        p_dealer_id: dealer.id,
        p_logo_header_variant: plan.fields.logo_header_variant,
        p_logo_pages_variant: plan.fields.logo_pages_variant,
        p_logo_secondary_header_variant: plan.fields.logo_secondary_header_variant,
        p_logo_secondary_pages_variant: plan.fields.logo_secondary_pages_variant,
      })
      .single()
    if (saveError) throw saveError
    return { ...dealer, ...(data as DealerAccount), ...plan.fields }
  }

  async function saveLogoDisplay(display: DealerLogoDisplay) {
    const { data, error: saveError } = await supabase.rpc('update_my_dealer_logo_display', {
      p_dealer_id: dealer.id,
      p_logo_display: display,
    }).single()
    if (saveError) throw saveError
    return { ...dealer, ...(data as DealerAccount), logo_display: display }
  }

  async function saveSecondaryLogos(assets: {
    logo_secondary_url: string | null
    logo_secondary_source_url: string | null
    logo_secondary_light_url: string | null
    logo_secondary_black_url: string | null
  }) {
    const { data, error: saveError } = await supabase.rpc('update_my_dealer_secondary_logo_assets', {
      p_dealer_id: dealer.id,
      p_logo_secondary_url: assets.logo_secondary_url ?? '',
      p_logo_secondary_source_url: assets.logo_secondary_source_url ?? '',
      p_logo_secondary_light_url: assets.logo_secondary_light_url ?? '',
      p_logo_secondary_black_url: assets.logo_secondary_black_url ?? '',
    }).single()
    if (saveError) throw saveError
    return { ...dealer, ...(data as DealerAccount), ...assets }
  }

  async function saveLogoWebsite(slot: 'primary' | 'secondary', url: string | null) {
    const rpc = slot === 'primary' ? 'update_my_dealer_logo_website_url' : 'update_my_dealer_secondary_logo_website_url'
    const { data, error: saveError } = await supabase.rpc(rpc, {
      p_dealer_id: dealer.id,
      ...(slot === 'primary' ? { p_logo_website_url: url ?? '' } : { p_logo_secondary_website_url: url ?? '' }),
    }).single()
    if (saveError) throw saveError
    const column = slot === 'primary' ? 'logo_website_url' : 'logo_secondary_website_url'
    return { ...dealer, ...(data as DealerAccount), [column]: url }
  }

  async function saveAppearance(appearance: DoorBuilderAppearance | null) {
    const { error: saveError } = await supabase.rpc('update_my_dealer_door_builder_appearance', appearanceRpcArgs(dealer.id, appearance))
    if (saveError) throw saveError
    onDealerUpdated({ ...dealer, door_builder_appearance: appearance })
  }

  async function saveLogoPlacement(placement: DealerLogoPlacement) {
    const { data, error: saveError } = await supabase
      .rpc('update_my_dealer_logo_placement', {
        p_dealer_id: dealer.id,
        p_logo_placement: placement,
      })
      .single()
    if (saveError) throw saveError
    return data as DealerAccount
  }

  return (
    <div className="page-content">
      <header className="page-header">
        <p className="eyebrow">Dealer Portal</p>
        <h1>Company Profile</h1>
        <p>Manage your company information and dealer branding.</p>
      </header>

      {message && <div className="portal-alert portal-alert--success" role="status">{message}</div>}
      {error && <div className="portal-alert" role="alert">{error}</div>}
      {profileDirty && <div className="portal-alert" role="status">Company details or colors have unsaved changes.</div>}

      <nav className="dealer-settings-nav" aria-label="Company profile sections">
        <a href="#company-details">Company Details</a>
        <a href="#logos">Logos</a>
        <a href="#door-builder-branding">Door Builder Branding</a>
        {canEditAppearance && <a href="#door-builder-appearance">Door Builder Appearance</a>}
        <a href="#colors-and-typography">Colors and Typography</a>
        <a href="#website-address">Website Address</a>
      </nav>

      <form onSubmit={handleSave}>
      <section className="content-card dealer-form" id="company-details">
        <div className="dealer-form__section">
          <div className="dealer-form__section-heading">
            <h2>Company Details</h2>
            <p>Name, contact, and address for this dealership. Colors are saved with these details from the Colors section.</p>
          </div>
          <div className="form-grid">
            <div className="filter-field form-field--wide">
              <label htmlFor="profile-company-name">Company Name *</label>
              <input id="profile-company-name" value={form.companyName} onChange={(event) => updateField('companyName', event.target.value)} required />
            </div>
            <div className="filter-field"><label htmlFor="profile-contact">Primary Contact Name</label><input id="profile-contact" value={form.primaryContactName} onChange={(event) => updateField('primaryContactName', event.target.value)} /></div>
            <div className="filter-field"><label htmlFor="profile-email">Email</label><input id="profile-email" type="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} /></div>
            <div className="filter-field"><label htmlFor="profile-phone">Phone</label><input id="profile-phone" type="tel" value={form.phone} onChange={(event) => updateField('phone', event.target.value)} /></div>
            <div className="filter-field"><label htmlFor="profile-website">Website</label><input id="profile-website" value={form.website} onChange={(event) => updateField('website', event.target.value)} /></div>
            <div className="filter-field form-field--wide"><label htmlFor="profile-address">Address</label><input id="profile-address" value={form.address} onChange={(event) => updateField('address', event.target.value)} /></div>
            <div className="filter-field"><label htmlFor="profile-city">City</label><input id="profile-city" value={form.city} onChange={(event) => updateField('city', event.target.value)} /></div>
            <div className="filter-field"><label htmlFor="profile-state">State</label><input id="profile-state" value={form.state} onChange={(event) => updateField('state', event.target.value)} /></div>
            <div className="filter-field"><label htmlFor="profile-zip">ZIP</label><input id="profile-zip" value={form.zip} onChange={(event) => updateField('zip', event.target.value)} /></div>
          </div>
        </div>
      </section>

      <section id="logos">
      <p className="profile-section-note">The original logo is the source file. The white logo is for dark backgrounds. The black logo is for light backgrounds. Marketing banners use whichever of these logos you pick in Marketing Tools. Door Builder homepage and other pages use the choices in the next section.</p>
      <div className="profile-logo-grid" id="dealer-logos">
        <section className="content-card profile-logo-card">
          <div className="profile-logo-preview">
            {dealer.logo_url ? (
              <img src={dealer.logo_url} alt={`${dealer.company_name} primary logo`} />
            ) : (
              <span>{dealer.company_name.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div>
            <p className="eyebrow">Primary Logo</p>
            <h2>Primary Logo</h2>
            <p>Upload your standard logo. A flat outer background is detected automatically. Nothing is saved until you accept the transparent PNG or keep the upload.</p>
            <p>PNG, JPEG, WebP, or SVG. Maximum file size 5 MB.</p>
            {removalNotice && <p className="logo-helper-note" role="status">{removalNotice}</p>}
          </div>
          <label className={`button button--outline upload-button ${uploadingLogo ? 'is-disabled' : ''}`}>
            {uploadingLogo === 'primary' ? 'Uploading...' : 'Upload Primary Logo'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              disabled={uploadingLogo !== null}
              onChange={(event) => void handleLogoUpload(event, 'primary')}
            />
          </label>
        </section>

        <section className="content-card profile-logo-card">
          <div className="profile-logo-preview profile-logo-preview--dark">
            {dealer.logo_light_url || dealer.logo_generated_light_url ? (
              <img src={dealer.logo_light_url ?? dealer.logo_generated_light_url ?? ''} alt={`${dealer.company_name} light logo`} />
            ) : (
              <span>{dealer.company_name.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div>
            <p className="eyebrow">{lightLogoEyebrow(dealer)}</p>
            <h2>White Logo</h2>
            <p>A white logo is generated from the original. Upload a custom version to replace it.</p>
            {!dealer.logo_light_url && dealer.logo_generated_light_url && dealer.logo_generated_light_usable !== true && (
              <p className="logo-helper-note">{dealer.logo_generated_light_usable === false
                ? 'This generated file is not readable enough to offer as the White/Light logo.'
                : 'This generated file has not passed the readability check, so it is not offered as the White/Light logo.'}</p>
            )}
          </div>
          <label className={`button button--outline upload-button ${uploadingLogo ? 'is-disabled' : ''}`}>
            {uploadingLogo === 'light' ? 'Uploading...' : 'Upload White Logo'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              disabled={uploadingLogo !== null}
              onChange={(event) => void handleLogoUpload(event, 'light')}
            />
          </label>
          <div className="page-actions">
            {dealer.logo_url && (
              <button className="button button--outline" type="button" disabled={isGeneratingLightLogo || uploadingLogo !== null} onClick={() => void handleGenerateLightLogo()}>
                {isGeneratingLightLogo ? 'Generating...' : 'Generate White'}
              </button>
            )}
            {dealer.logo_light_url && (
              <button className="button button--danger-outline" type="button" disabled={isGeneratingLightLogo || uploadingLogo !== null} onClick={() => void handleRemoveCustomLightLogo()}>
                Remove Custom Logo
              </button>
            )}
          </div>
        </section>
        <section className="content-card profile-logo-card">
          <div className="profile-logo-preview">
            {dealer.logo_black_url || (dealer.logo_generated_black_usable && dealer.logo_generated_black_url) ? (
              <img src={dealer.logo_black_url ?? dealer.logo_generated_black_url ?? ''} alt={`${dealer.company_name} black logo`} />
            ) : <span>{dealer.company_name.charAt(0).toUpperCase()}</span>}
          </div>
          <div>
            <p className="eyebrow">{dealer.logo_black_url ? 'Custom black' : dealer.logo_generated_black_usable ? 'Generated black' : 'Black logo'}</p>
            <h2>Black Logo</h2>
            <p>Generate a black version from the original, or upload your own. An unreadable result is not offered.</p>
          </div>
          <label className={`button button--outline upload-button ${uploadingLogo ? 'is-disabled' : ''}`}>
            {uploadingLogo === 'black' ? 'Uploading...' : 'Upload Black Logo'}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" disabled={uploadingLogo !== null} onChange={(event) => void handleLogoUpload(event, 'black')} />
          </label>
          {dealer.logo_url && (
            <button className="button button--outline" type="button" disabled={isGeneratingLightLogo || uploadingLogo !== null} onClick={() => void handleGenerateBlackLogo()}>Generate Black</button>
          )}
        </section>
      </div>
      {dealer.logo_source_url && (
        <button className="button button--outline" type="button" onClick={() => void restoreOriginalLogo()}>Restore Original</button>
      )}
      {removal && (
        <LogoBackgroundDialog
          originalUrl={removal.originalUrl}
          removedUrl={removal.removedUrl}
          reason={removal.reason}
          busy={uploadingLogo !== null}
          onAccept={() => void acceptTransparentLogo()}
          onKeep={() => void keepOriginalLogo()}
          onCancel={dismissRemoval}
        />
      )}
      </section>

      <BrandingAppearanceWorkspace
        dealer={{
          ...dealer,
          ...(placementDraft ? { logo_placement: placementDraft } : {}),
          ...(displayDraft ? { logo_display: displayDraft } : {}),
          ...(variantDraft ?? {}),
          ...(typographyDraft ? {
            heading_font_family: typographyDraft.headingFontFamily || null,
            heading_font_weight: typographyDraft.headingFontWeight ? Number(typographyDraft.headingFontWeight) : null,
            heading_font_size: typographyDraft.headingFontSize ? Number(typographyDraft.headingFontSize) : null,
            body_font_family: typographyDraft.bodyFontFamily || null,
            body_font_weight: typographyDraft.bodyFontWeight ? Number(typographyDraft.bodyFontWeight) : null,
            body_font_size: typographyDraft.bodyFontSize ? Number(typographyDraft.bodyFontSize) : null,
          } : {}),
        }}
        appearance={appearanceDraft === undefined ? dealer.door_builder_appearance ?? null : appearanceDraft}
        unsaved={
          (placementDraft != null && placementDraft !== (dealer.logo_placement === 'header' ? 'header' : 'hero'))
          || (displayDraft != null && displayDraft !== normalizeLogoDisplay(dealer.logo_display))
          || (canEditAppearance && appearanceDraft !== undefined && !appearanceEquals(appearanceDraft, dealer.door_builder_appearance ?? null))
          || (typographyDraft != null && JSON.stringify(typographyDraft) !== JSON.stringify(dealerTypographyValues(dealer)))
          || (variantDraft != null && (
            (variantDraft.logo_header_variant ?? null) !== (dealer.logo_header_variant ?? null)
            || (variantDraft.logo_pages_variant ?? null) !== (dealer.logo_pages_variant ?? null)
          ))
        }
        panels={{
          logos: (
            <section id="door-builder-branding">
              <p className="profile-section-note">The homepage logo and the logo on other Door Builder pages are chosen here. Marketing banners do not use these choices; they use the logo you select in Marketing Tools.</p>
              <DealerLogoVariantSettings dealer={dealer} embedded placement={placementDraft ?? (dealer.logo_placement === 'header' ? 'header' : 'hero')} onDraftChange={setVariantDraft} onSave={saveLogoVariants} onSaveWebsite={saveLogoWebsite} onUpdated={onDealerUpdated} onHydrated={onDealerUpdated} />
            </section>
          ),
          placement: (
            <>
              <DealerLogoDisplaySettings dealer={dealer} embedded onDraftChange={setDisplayDraft} onSaveDisplay={saveLogoDisplay} onSaveSecondary={saveSecondaryLogos} onUpdated={onDealerUpdated} />
              <DealerLogoPlacementSettings dealer={dealer} onDraftChange={setPlacementDraft} onSave={saveLogoPlacement} onUpdated={onDealerUpdated} />
            </>
          ),
          colors: canEditAppearance ? <DoorBuilderAppearanceSettings dealer={dealer} mode="dealer" canEdit embedded onDraftChange={setAppearanceDraft} onSave={saveAppearance} /> : <p>Appearance settings are available to dealer admins.</p>,
          typography: <DealerTypographySettings dealer={dealer} embedded onDraftChange={setTypographyDraft} onSave={saveTypography} onUpdated={onDealerUpdated} />,
        }}
      />

      <section id="colors-and-typography">
        <div className="content-card dealer-form">
          <div className="dealer-form__section">
            <div className="dealer-form__section-heading">
              <h2>Colors</h2>
              <p>These colors are used in Door Builder. Marketing banner templates keep their own colors and only add your logo.</p>
            </div>
            <div className="form-grid">
              <div className="filter-field"><label htmlFor="profile-primary-color">Primary Brand Color</label><input id="profile-primary-color" value={form.primaryColor} onChange={(event) => updateField('primaryColor', event.target.value)} placeholder="#0d666c" /></div>
              <div className="filter-field"><label htmlFor="profile-secondary-color">Secondary Brand Color</label><input id="profile-secondary-color" value={form.secondaryColor} onChange={(event) => updateField('secondaryColor', event.target.value)} placeholder="#f8d30e" /></div>
            </div>
          </div>
          <div className="dealer-form__actions">
            <button className="button button--outline" type="button" disabled={isSaving || !profileDirty} onClick={() => setForm(dealerToForm(dealer))}>Cancel</button>
            <button className="button button--primary" type="submit" disabled={isSaving || !profileDirty}>
              {isSaving ? 'Saving...' : 'Save details and colors'}
            </button>
          </div>
        </div>
      </section>
      </form>

      <section className="content-card visualizer-request-card" id="website-address">
        <div className="dealer-form__section-heading">
          <p className="eyebrow">Visualizer URL</p>
          <h2>Request New Visualizer URL</h2>
          <p><strong>Current URL:</strong> {getDealerVisualizerDisplayUrl(dealer.slug)}</p>
        </div>

        {dealer.slug_request_status === 'pending' ? (
          <div className="slug-request-state slug-request-state--pending">
            <strong>Pending Home Guard Approval</strong>
            <span>{getDealerVisualizerDisplayUrl(dealer.requested_slug ?? '')}</span>
            <p>Your live URL will not change until Home Guard approves this request.</p>
          </div>
        ) : (
          <form className="slug-request-form" onSubmit={handleSlugRequest}>
            {dealer.slug_request_status === 'rejected' && (
              <div className="slug-request-state slug-request-state--rejected">
                <strong>Previous request rejected</strong>
                <p>You may submit a different Visualizer URL for approval.</p>
              </div>
            )}
            <div className="filter-field">
              <label htmlFor="requested-slug">Requested slug</label>
              <input id="requested-slug" value={requestedSlug} onChange={(event) => setRequestedSlug(event.target.value)} onBlur={() => setRequestedSlug(normalizedRequestedSlug)} placeholder="new-dealer-url" required />
              <p className="slug-preview"><strong>Preview:</strong> {getDealerVisualizerDisplayUrl(normalizedRequestedSlug || '[requested-slug]')}</p>
            </div>
            <p className="visualizer-warning">Changing your Visualizer URL may affect existing website links, QR codes, and marketing materials.</p>
            <button className="button button--primary" type="submit" disabled={isRequestingSlug}>
              {isRequestingSlug ? 'Submitting...' : 'Submit for Approval'}
            </button>
          </form>
        )}
      </section>
    </div>
  )
}
