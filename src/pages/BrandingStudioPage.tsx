import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { BrandColorField } from '../components/BrandColorField'
import { DoorBuilderAppearancePreview } from '../components/DoorBuilderAppearancePreview'
import { DoorBuilderAppearanceSettings } from '../components/DoorBuilderAppearanceSettings'
import { DealerLogoDisplaySettings } from '../components/DealerLogoDisplaySettings'
import { DealerLogoPlacementSettings, type DealerLogoPlacement } from '../components/DealerLogoPlacementSettings'
import { DealerLogoVariantSettings } from '../components/DealerLogoVariantSettings'
import { DealerTypographySettings } from '../components/DealerTypographySettings'
import { LogoBackgroundDialog } from '../components/LogoBackgroundDialog'
import { LogoFileStatus, type LogoFileStatusState } from '../components/LogoFileStatus'
import { getDealerVisualizerUrl } from '../config/visualizer'
import { STUDIO_SECTIONS, isLegacyBrandingTarget, runBrandingSave, studioSectionFromValue, type StudioSectionId } from '../features/branding-studio/sections'
import { supabase } from '../lib/supabase'
import '../styles/brandingStudio.css'
import type { AdminDealer } from '../types/admin'
import { appearanceEquals, appearanceRpcArgs, appearanceUpdate, type DoorBuilderAppearance } from '../utils/doorBuilderAppearance'
import { normalizeLogoWebsiteUrl } from '../utils/logoWebsiteUrl'
import { generateDefaultDealerLightLogo } from '../utils/dealerLightLogo'
import { generatedLightLogoMessage, logoVariantSavePlan, normalizeLogoDisplay, type DealerLogoDisplay, type DealerLogoVariant } from '../utils/dealerLogoVariants'
import { dealerTypographyValues, typographyPayload, type DealerTypographyValues } from '../utils/dealerTypography'
import { unsavedProfileClickFromEvent, unsavedProfileNavigationKind } from '../utils/unsavedProfileNavigation'

function linkChanged(draft: string | null, saved: string | null | undefined) {
  if (draft == null) return false
  const parsed = normalizeLogoWebsiteUrl(draft)
  if (parsed.error) return true
  return (parsed.url ?? '') !== (saved ?? '')
}

function joinLabels(labels: string[]) {
  const unique = [...new Set(labels)]
  if (unique.length <= 1) return unique[0] ?? ''
  return `${unique.slice(0, -1).join(', ')} and ${unique[unique.length - 1]}`
}
import { readLogoForRemoval } from '../utils/readLogoForRemoval'

const logoExtensions: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
}

type Mode = 'admin' | 'dealer'

type Props = {
  mode: Mode
  dealer: AdminDealer
  canEditAppearance: boolean
  backTo: string
  onDealerUpdated: (dealer: AdminDealer) => void
}

export function AdminBrandingStudioRoute({
  dealers,
  onDealerUpdated,
}: {
  dealers: AdminDealer[]
  onDealerUpdated: (dealer: AdminDealer, message: string) => void
}) {
  const { dealerId } = useParams()
  const dealer = dealers.find((item) => item.id === dealerId)
  if (!dealer) {
    return <div className="page-content"><div className="content-card"><h1>Dealer not found</h1><Link to="/admin/dealers">Back to Dealers</Link></div></div>
  }
  return (
    <BrandingStudioPage
      mode="admin"
      dealer={dealer}
      canEditAppearance
      backTo={`/admin/dealers/${dealer.id}`}
      onDealerUpdated={(next) => onDealerUpdated(next, 'Branding saved.')}
    />
  )
}

export function BrandingStudioPage({ mode, dealer, canEditAppearance, backTo, onDealerUpdated }: Props) {
  const [params, setParams] = useSearchParams()
  const requested = studioSectionFromValue(params.get('section')) ?? studioSectionFromValue(window.location.hash) ?? 'logos'
  const section: StudioSectionId = requested
  const [panel, setPanel] = useState<StudioSectionId>(section)
  const [logoView, setLogoView] = useState<'cards' | 'primary-variants' | 'secondary-variants'>('cards')
  const [editing, setEditing] = useState(false)
  const [surface, setSurface] = useState<'homepage' | 'builder' | 'find'>('builder')
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 767px)').matches)
  const [placementDraft, setPlacementDraft] = useState<DealerLogoPlacement | null>(null)
  const [displayDraft, setDisplayDraft] = useState<DealerLogoDisplay | null>(null)
  const [variantDraft, setVariantDraft] = useState<Partial<AdminDealer> | null>(null)
  const [typographyDraft, setTypographyDraft] = useState<DealerTypographyValues | null>(null)
  const [appearanceDraft, setAppearanceDraft] = useState<DoorBuilderAppearance | null | undefined>(undefined)
  const [brandDraft, setBrandDraft] = useState<{ primary: string; secondary: string } | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [removal, setRemoval] = useState<{ file: File; originalUrl: string; removedUrl: string; reason: string; png: Blob } | null>(null)
  const [removalNotice, setRemovalNotice] = useState('')
  const [uploading, setUploading] = useState(false)
  const [draftEpoch, setDraftEpoch] = useState(0)
  const [primaryLinkDraft, setPrimaryLinkDraft] = useState<string | null>(null)
  const [secondaryLinkDraft, setSecondaryLinkDraft] = useState<string | null>(null)
  const [logoSize, setLogoSize] = useState<Record<string, string>>({})
  const primaryLink = primaryLinkDraft ?? dealer.logo_website_url ?? ''
  const secondaryLink = secondaryLinkDraft ?? dealer.logo_secondary_website_url ?? ''

  const savedPlacement: DealerLogoPlacement = dealer.logo_placement === 'header' ? 'header' : 'hero'
  const placement = placementDraft ?? savedPlacement
  const display = displayDraft ?? normalizeLogoDisplay(dealer.logo_display)
  const brand = brandDraft ?? { primary: dealer.primary_color ?? '', secondary: dealer.secondary_color ?? '' }
  const previewDealer = useMemo(() => ({
    ...dealer,
    primary_color: brand.primary || null,
    secondary_color: brand.secondary || null,
    logo_placement: placement,
    logo_display: display,
    ...(variantDraft ?? {}),
    ...(typographyDraft ? {
      heading_font_family: typographyDraft.headingFontFamily || null,
      heading_font_weight: typographyDraft.headingFontWeight ? Number(typographyDraft.headingFontWeight) : null,
      heading_font_size: typographyDraft.headingFontSize ? Number(typographyDraft.headingFontSize) : null,
      body_font_family: typographyDraft.bodyFontFamily || null,
      body_font_weight: typographyDraft.bodyFontWeight ? Number(typographyDraft.bodyFontWeight) : null,
      body_font_size: typographyDraft.bodyFontSize ? Number(typographyDraft.bodyFontSize) : null,
    } : {}),
  }), [brand.primary, brand.secondary, dealer, display, placement, typographyDraft, variantDraft])
  const appearance = appearanceDraft === undefined ? dealer.door_builder_appearance ?? null : appearanceDraft
  const dirty = (placementDraft != null && placementDraft !== savedPlacement)
    || (displayDraft != null && displayDraft !== normalizeLogoDisplay(dealer.logo_display))
    || (variantDraft != null && (
      (variantDraft.logo_header_variant ?? null) !== (dealer.logo_header_variant ?? null)
      || (variantDraft.logo_pages_variant ?? null) !== (dealer.logo_pages_variant ?? null)
      || (variantDraft.logo_secondary_header_variant ?? null) !== (dealer.logo_secondary_header_variant ?? null)
      || (variantDraft.logo_secondary_pages_variant ?? null) !== (dealer.logo_secondary_pages_variant ?? null)
    ))
    || (typographyDraft != null && JSON.stringify(typographyDraft) !== JSON.stringify(dealerTypographyValues(dealer)))
    || (canEditAppearance && appearanceDraft !== undefined && !appearanceEquals(appearanceDraft, dealer.door_builder_appearance ?? null))
    || (brandDraft != null && (brandDraft.primary !== (dealer.primary_color ?? '') || brandDraft.secondary !== (dealer.secondary_color ?? '')))
    || linkChanged(primaryLinkDraft, dealer.logo_website_url)
    || linkChanged(secondaryLinkDraft, dealer.logo_secondary_website_url)

  useEffect(() => {
    if (!dirty) return
    const onClick = (event: globalThis.MouseEvent) => {
      const kind = unsavedProfileNavigationKind(unsavedProfileClickFromEvent(event, true), window.location.href)
      if (kind === 'allow') return
      if (window.confirm('You have unsaved branding changes. Leave without saving?')) return
      event.preventDefault()
      event.stopPropagation()
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [dirty])

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  useEffect(() => {
    const redirect = () => {
      if (!isLegacyBrandingTarget(window.location.hash)) return
      const next = studioSectionFromValue(window.location.hash)
      if (!next) return
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
      setParams({ section: next }, { replace: true })
      setPanel(next)
      setEditing(true)
    }
    redirect()
    window.addEventListener('hashchange', redirect)
    return () => window.removeEventListener('hashchange', redirect)
  }, [setParams])

  function choose(next: StudioSectionId) {
    setPanel(next)
    setLogoView('cards')
    if (window.matchMedia('(max-width: 1023px)').matches) setEditing(true)
    setParams({ section: next })
  }

  async function saveBrand(current: AdminDealer, colors: { primary: string; secondary: string }) {
    const primary = colors.primary.trim() || null
    const secondary = colors.secondary.trim() || null
    if (mode === 'admin') {
      const { error: updateError } = await supabase.from('dealers').update({ primary_color: primary, secondary_color: secondary }).eq('id', current.id)
      if (updateError) throw updateError
      return { ...current, primary_color: primary, secondary_color: secondary }
    }
    const { error: saveError } = await supabase.rpc('update_my_dealer_profile', {
      p_dealer_id: current.id,
      p_company_name: current.company_name,
      p_primary_contact_name: current.primary_contact_name ?? '',
      p_email: current.email ?? '',
      p_phone: current.phone ?? '',
      p_website: current.website ?? '',
      p_address: current.address ?? '',
      p_city: current.city ?? '',
      p_state: current.state ?? '',
      p_zip: current.zip ?? '',
      p_primary_color: primary ?? '',
      p_secondary_color: secondary ?? '',
      p_logo_url: current.logo_url ?? '',
      p_logo_light_url: current.logo_light_url ?? '',
    })
    if (saveError) throw saveError
    return { ...current, primary_color: primary, secondary_color: secondary }
  }

  function discard() {
    if (dirty && !window.confirm('Discard unsaved branding changes?')) return
    setPlacementDraft(null)
    setDisplayDraft(null)
    setVariantDraft(null)
    setTypographyDraft(null)
    setAppearanceDraft(undefined)
    setBrandDraft(null)
    setPrimaryLinkDraft(null)
    setSecondaryLinkDraft(null)
    setDraftEpoch((value) => value + 1)
    setMessage('Draft discarded.')
    setError('')
  }

  async function saveAll() {
    if (!dirty || saving) return
    setSaving(true)
    setMessage('')
    setError('')
    let current = dealer
    const tasks: Array<{ id: string; label: string; run: () => Promise<void> }> = []
    if (displayDraft != null && displayDraft !== normalizeLogoDisplay(dealer.logo_display)) {
      tasks.push({ id: 'display', label: 'Logo Display & Placement', run: async () => { current = await saveDisplay(current, displayDraft) } })
    }
    if (placementDraft != null && placementDraft !== savedPlacement) {
      tasks.push({ id: 'placement', label: 'Logo Display & Placement', run: async () => { current = await savePlacement(current, placementDraft) } })
    }
    for (const link of [
      { id: 'primary-link', label: 'Logo 1 link', slot: 'primary' as const, draft: primaryLinkDraft, saved: dealer.logo_website_url },
      { id: 'secondary-link', label: 'Logo 2 link', slot: 'secondary' as const, draft: secondaryLinkDraft, saved: dealer.logo_secondary_website_url },
    ]) {
      if (!linkChanged(link.draft, link.saved) || link.draft == null) continue
      const parsed = normalizeLogoWebsiteUrl(link.draft)
      tasks.push({
        id: link.id,
        label: link.label,
        run: async () => {
          if (parsed.error) throw new Error(parsed.error)
          current = await saveWebsite(link.slot, parsed.url)
        },
      })
    }
    if (variantDraft) {
      tasks.push({ id: 'variants', label: 'Logo variants', run: async () => { current = await saveVariants(current, variantDraft) } })
    }
    if (canEditAppearance && appearanceDraft !== undefined && !appearanceEquals(appearanceDraft, dealer.door_builder_appearance ?? null)) {
      tasks.push({ id: 'appearance', label: 'Colors', run: async () => { current = await saveAppearance(current, appearanceDraft) } })
    }
    if (typographyDraft && JSON.stringify(typographyDraft) !== JSON.stringify(dealerTypographyValues(dealer))) {
      tasks.push({ id: 'typography', label: 'Typography', run: async () => { current = await saveTypography(current, typographyDraft) } })
    }
    if (brandDraft && (brandDraft.primary !== (dealer.primary_color ?? '') || brandDraft.secondary !== (dealer.secondary_color ?? ''))) {
      tasks.push({ id: 'brand', label: 'Brand colors', run: async () => { current = await saveBrand(current, brandDraft) } })
    }
    const result = await runBrandingSave(tasks)
    onDealerUpdated(current)
    if (result.failed.length === 0) {
      setPlacementDraft(null)
      setDisplayDraft(null)
      setVariantDraft(null)
      setTypographyDraft(null)
      setAppearanceDraft(undefined)
      setBrandDraft(null)
      setPrimaryLinkDraft(null)
      setSecondaryLinkDraft(null)
      setMessage('Changes saved.')
    } else {
      const saved = joinLabels(result.saved.map((id) => tasks.find((task) => task.id === id)?.label ?? id))
      const failed = result.failed.map((item) => `${item.label} failed: ${item.message}`).join(' ')
      setError(`${saved ? `Saved ${saved}. ` : ''}${failed}`)
    }
    setSaving(false)
  }

  async function saveDisplay(current: AdminDealer, value: DealerLogoDisplay) {
    if (mode === 'admin') {
      const { error: updateError } = await supabase.from('dealers').update({ logo_display: value }).eq('id', current.id)
      if (updateError) throw updateError
      return { ...current, logo_display: value }
    }
    const { error: saveError } = await supabase.rpc('update_my_dealer_logo_display', { p_dealer_id: current.id, p_logo_display: value })
    if (saveError) throw saveError
    return { ...current, logo_display: value }
  }

  async function savePlacement(current: AdminDealer, value: DealerLogoPlacement) {
    if (mode === 'admin') {
      const { error: updateError } = await supabase.from('dealers').update({ logo_placement: value }).eq('id', current.id)
      if (updateError) throw updateError
      return { ...current, logo_placement: value }
    }
    const { error: saveError } = await supabase.rpc('update_my_dealer_logo_placement', { p_dealer_id: current.id, p_logo_placement: value })
    if (saveError) throw saveError
    return { ...current, logo_placement: value }
  }

  async function saveVariants(current: AdminDealer, patch: Partial<AdminDealer>) {
    const variants = {
      header: (patch.logo_header_variant ?? current.logo_header_variant ?? null) as DealerLogoVariant | null,
      pages: (patch.logo_pages_variant ?? current.logo_pages_variant ?? null) as DealerLogoVariant | null,
      secondaryHeader: (patch.logo_secondary_header_variant ?? current.logo_secondary_header_variant ?? null) as DealerLogoVariant | null,
      secondaryPages: (patch.logo_secondary_pages_variant ?? current.logo_secondary_pages_variant ?? null) as DealerLogoVariant | null,
    }
    const plan = logoVariantSavePlan(current.logo_display, variants.header, variants.pages, variants.secondaryHeader, variants.secondaryPages)
    if (mode === 'admin') {
      const { error: updateError } = await supabase.from('dealers').update(plan.fields).eq('id', current.id)
      if (updateError) throw updateError
      return { ...current, ...plan.fields }
    }
    if (plan.mode === 'primary') {
      const { error: saveError } = await supabase.rpc('update_my_dealer_logo_variants', {
        p_dealer_id: current.id,
        p_logo_header_variant: plan.fields.logo_header_variant,
        p_logo_pages_variant: plan.fields.logo_pages_variant,
      })
      if (saveError) throw saveError
    } else {
      const { error: saveError } = await supabase.rpc('update_my_dealer_all_logo_variants', {
        p_dealer_id: current.id,
        p_logo_header_variant: plan.fields.logo_header_variant,
        p_logo_pages_variant: plan.fields.logo_pages_variant,
        p_logo_secondary_header_variant: plan.fields.logo_secondary_header_variant,
        p_logo_secondary_pages_variant: plan.fields.logo_secondary_pages_variant,
      })
      if (saveError) throw saveError
    }
    return { ...current, ...plan.fields }
  }

  async function saveAppearance(current: AdminDealer, value: DoorBuilderAppearance | null) {
    if (mode === 'admin') {
      const { error: updateError } = await supabase.from('dealers').update(appearanceUpdate(value)).eq('id', current.id)
      if (updateError) throw updateError
    } else {
      const { error: saveError } = await supabase.rpc('update_my_dealer_door_builder_appearance', appearanceRpcArgs(current.id, value))
      if (saveError) throw saveError
    }
    return { ...current, door_builder_appearance: value }
  }

  async function saveTypography(current: AdminDealer, values: DealerTypographyValues) {
    const payload = typographyPayload(values)
    if (mode === 'admin') {
      const { error: saveError } = await supabase.from('dealers').update(payload).eq('id', current.id)
      if (saveError) throw saveError
    } else {
      const { error: saveError } = await supabase.rpc('update_my_dealer_typography', {
        p_dealer_id: current.id,
        p_heading_font_family: payload.heading_font_family,
        p_heading_font_weight: payload.heading_font_weight,
        p_heading_font_size: payload.heading_font_size,
        p_body_font_family: payload.body_font_family,
        p_body_font_weight: payload.body_font_weight,
        p_body_font_size: payload.body_font_size,
        p_custom_heading_font_url: payload.custom_heading_font_url,
        p_custom_heading_font_name: payload.custom_heading_font_name,
        p_custom_heading_font_weight: payload.custom_heading_font_weight,
        p_custom_body_font_url: payload.custom_body_font_url,
        p_custom_body_font_name: payload.custom_body_font_name,
        p_custom_body_font_weight: payload.custom_body_font_weight,
      })
      if (saveError) throw saveError
    }
    return {
      ...current,
      heading_font_family: payload.heading_font_family,
      heading_font_weight: payload.heading_font_weight,
      heading_font_size: payload.heading_font_size,
      body_font_family: payload.body_font_family,
      body_font_weight: payload.body_font_weight,
      body_font_size: payload.body_font_size,
    }
  }

  async function saveWebsite(slot: 'primary' | 'secondary', url: string | null) {
    if (mode === 'admin') {
      const column = slot === 'primary' ? 'logo_website_url' : 'logo_secondary_website_url'
      const { error: updateError } = await supabase.from('dealers').update({ [column]: url }).eq('id', dealer.id)
      if (updateError) throw updateError
      onDealerUpdated({ ...dealer, [column]: url })
      return { ...dealer, [column]: url }
    }
    const rpc = slot === 'primary' ? 'update_my_dealer_logo_website_url' : 'update_my_dealer_secondary_logo_website_url'
    const { error: saveError } = await supabase.rpc(rpc, {
      p_dealer_id: dealer.id,
      ...(slot === 'primary' ? { p_logo_website_url: url ?? '' } : { p_logo_secondary_website_url: url ?? '' }),
    })
    if (saveError) throw saveError
    const column = slot === 'primary' ? 'logo_website_url' : 'logo_secondary_website_url'
    onDealerUpdated({ ...dealer, [column]: url })
    return { ...dealer, [column]: url }
  }

  async function uploadLogo(event: ChangeEvent<HTMLInputElement>, kind: 'primary' | 'light' | 'black') {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const extension = logoExtensions[file.type]
    if (!extension || file.size > 5 * 1024 * 1024) {
      setError('Choose a PNG, JPEG, WebP, or SVG logo no larger than 5 MB.')
      return
    }
    if (kind === 'primary' && file.type !== 'image/svg+xml') {
      const inspected = await readLogoForRemoval(file)
      if (inspected.confident && inspected.png) {
        setRemovalNotice('')
        setRemoval({ file, originalUrl: URL.createObjectURL(file), removedUrl: URL.createObjectURL(inspected.png), reason: inspected.reason, png: inspected.png })
        return
      }
      setRemovalNotice(inspected.confident
        ? 'The background could be removed, but this browser could not save a PNG. The original file was kept.'
        : inspected.reason)
    }
    await storeUploadedLogo(file, kind)
  }

  async function saveRemovedBackground(file: File, png: Blob, reason: string) {
    setUploading(true)
    const sourceExtension = logoExtensions[file.type] ?? 'png'
    const sourcePath = `${dealer.id}/logo-source.${sourceExtension}`
    const transparentPath = `${dealer.id}/logo.png`
    const [sourceUpload, transparentUpload] = await Promise.all([
      supabase.storage.from('dealer-logos').upload(sourcePath, file, { contentType: file.type, upsert: true }),
      supabase.storage.from('dealer-logos').upload(transparentPath, png, { contentType: 'image/png', upsert: true }),
    ])
    if (sourceUpload.error || transparentUpload.error) {
      setError('We could not save the transparent logo. The original was not replaced.')
      setUploading(false)
      return false
    }
    const sourceUrl = `${supabase.storage.from('dealer-logos').getPublicUrl(sourcePath).data.publicUrl}?v=${Date.now()}`
    const transparentUrl = `${supabase.storage.from('dealer-logos').getPublicUrl(transparentPath).data.publicUrl}?v=${Date.now()}`
    if (mode === 'admin') {
      const { error: updateError } = await supabase.from('dealers').update({ logo_url: transparentUrl, logo_source_url: sourceUrl }).eq('id', dealer.id)
      if (updateError) { setError('The files uploaded, but the logo record could not be saved.'); setUploading(false); return false }
    } else {
      const { error: saveError } = await supabase.rpc('update_my_dealer_logo_assets', {
        p_dealer_id: dealer.id,
        p_logo_url: transparentUrl,
        p_logo_source_url: sourceUrl,
        p_logo_light_url: dealer.logo_light_url ?? '',
        p_logo_black_url: dealer.logo_black_url ?? '',
      })
      if (saveError) { setError('The files uploaded, but the logo record could not be saved.'); setUploading(false); return false }
    }
    const generated = await generateDefaultDealerLightLogo(dealer.id)
    onDealerUpdated({
      ...dealer,
      logo_url: transparentUrl,
      logo_source_url: sourceUrl,
      logo_generated_light_url: generated.generatedLightLogoUrl ?? dealer.logo_generated_light_url,
      logo_generated_light_usable: generated.generatedLightUsable,
    })
    setMessage(`${reason.replace(/\.$/, '')} removed. ${generatedLightLogoMessage(generated.generatedLightUsable, 'primary')}`)
    setUploading(false)
    return true
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
    if (mode === 'admin') {
      const { error: updateError } = await supabase.from('dealers').update({ logo_url: dealer.logo_source_url }).eq('id', dealer.id)
      if (updateError) { setError('We could not restore the original logo.'); return }
    } else {
      const { error: saveError } = await supabase.rpc('update_my_dealer_logo_assets', {
        p_dealer_id: dealer.id,
        p_logo_url: dealer.logo_source_url,
        p_logo_source_url: dealer.logo_source_url,
        p_logo_light_url: dealer.logo_light_url ?? '',
        p_logo_black_url: dealer.logo_black_url ?? '',
      })
      if (saveError) { setError('We could not restore the original logo.'); return }
    }
    onDealerUpdated({ ...dealer, logo_url: dealer.logo_source_url })
    setMessage('Original logo restored.')
  }

  async function generateLightLogo() {
    if (!dealer.logo_url) { setError('Upload a logo first.'); return }
    setError('')
    setUploading(true)
    const result = await generateDefaultDealerLightLogo(dealer.id)
    setUploading(false)
    if (result.error || !result.generatedLightLogoUrl) {
      setError(result.error ?? 'We could not generate the default light logo.')
      return
    }
    onDealerUpdated({ ...dealer, logo_generated_light_url: result.generatedLightLogoUrl, logo_generated_light_usable: result.generatedLightUsable })
    setMessage(generatedLightLogoMessage(result.generatedLightUsable, 'regenerate'))
  }

  async function removeCustomLightLogo() {
    setError('')
    if (mode === 'admin') {
      const { error: updateError } = await supabase.from('dealers').update({ logo_light_url: null }).eq('id', dealer.id)
      if (updateError) { setError('We could not remove the custom light logo. Please try again.'); return }
    } else {
      const { error: saveError } = await supabase.rpc('update_my_dealer_logo_assets', {
        p_dealer_id: dealer.id,
        p_logo_url: dealer.logo_url ?? '',
        p_logo_source_url: dealer.logo_source_url ?? '',
        p_logo_light_url: '',
        p_logo_black_url: dealer.logo_black_url ?? '',
      })
      if (saveError) { setError('We could not remove the custom light logo. Please try again.'); return }
    }
    onDealerUpdated({ ...dealer, logo_light_url: null })
    setMessage('Custom light logo removed.')
  }

  async function storeUploadedLogo(file: File, kind: 'primary' | 'light' | 'black') {
    const extension = logoExtensions[file.type]
    if (!extension) return
    setUploading(true)
    setError('')
    const filename = kind === 'primary' ? 'logo' : kind === 'black' ? 'logo-black' : 'logo-light'
    const objectPath = `${dealer.id}/${filename}.${extension}`
    const { error: uploadError } = await supabase.storage.from('dealer-logos').upload(objectPath, file, { contentType: file.type, upsert: true })
    if (uploadError) {
      setError('We could not upload this logo. Please try again.')
      setUploading(false)
      return
    }
    const publicUrl = `${supabase.storage.from('dealer-logos').getPublicUrl(objectPath).data.publicUrl}?v=${Date.now()}`
    const column = kind === 'primary' ? 'logo_url' : kind === 'black' ? 'logo_black_url' : 'logo_light_url'
    if (mode === 'admin') {
      const { error: updateError } = await supabase.from('dealers').update({ [column]: publicUrl }).eq('id', dealer.id)
      if (updateError) { setError('The logo uploaded, but it could not be saved.'); setUploading(false); return }
    } else {
      const { error: saveError } = await supabase.rpc('update_my_dealer_logo_assets', {
        p_dealer_id: dealer.id,
        p_logo_url: kind === 'primary' ? publicUrl : dealer.logo_url ?? '',
        p_logo_source_url: dealer.logo_source_url ?? '',
        p_logo_light_url: kind === 'light' ? publicUrl : dealer.logo_light_url ?? '',
        p_logo_black_url: kind === 'black' ? publicUrl : dealer.logo_black_url ?? '',
      })
      if (saveError) { setError('The logo uploaded, but it could not be saved.'); setUploading(false); return }
    }
    let next = { ...dealer, [column]: publicUrl }
    if (kind === 'primary') {
      const generated = await generateDefaultDealerLightLogo(dealer.id)
      if (generated.generatedLightLogoUrl) {
        next = { ...next, logo_generated_light_url: generated.generatedLightLogoUrl, logo_generated_light_usable: generated.generatedLightUsable }
      }
    }
    onDealerUpdated(next)
    setMessage('Logo file saved immediately.')
    setUploading(false)
  }

  async function saveSecondary(assets: { logo_secondary_url: string | null; logo_secondary_source_url: string | null; logo_secondary_light_url: string | null; logo_secondary_black_url: string | null }) {
    if (mode === 'admin') {
      const { error: updateError } = await supabase.from('dealers').update(assets).eq('id', dealer.id)
      if (updateError) throw updateError
    } else {
      const { error: saveError } = await supabase.rpc('update_my_dealer_secondary_logo_assets', {
        p_dealer_id: dealer.id,
        p_logo_secondary_url: assets.logo_secondary_url ?? '',
        p_logo_secondary_source_url: assets.logo_secondary_source_url ?? '',
        p_logo_secondary_light_url: assets.logo_secondary_light_url ?? '',
        p_logo_secondary_black_url: assets.logo_secondary_black_url ?? '',
      })
      if (saveError) throw saveError
    }
    const next = { ...dealer, ...assets }
    onDealerUpdated(next)
    return next
  }

  async function uploadSecondary(event: ChangeEvent<HTMLInputElement>, kind: 'primary' | 'light' | 'black') {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const extension = logoExtensions[file.type]
    if (!extension || extension === 'svg' || file.size > 5 * 1024 * 1024) {
      setError('Second logos use a PNG, JPEG, or WebP no larger than 5 MB.')
      return
    }
    setUploading(true)
    setError('')
    const filename = kind === 'primary' ? 'logo-secondary' : kind === 'black' ? 'logo-secondary-black' : 'logo-secondary-light'
    const objectPath = `${dealer.id}/${filename}.${extension}`
    const { error: uploadError } = await supabase.storage.from('dealer-logos').upload(objectPath, file, { contentType: file.type, upsert: true })
    if (uploadError) { setError('We could not upload the second logo. Please try again.'); setUploading(false); return }
    const publicUrl = `${supabase.storage.from('dealer-logos').getPublicUrl(objectPath).data.publicUrl}?v=${Date.now()}`
    try {
      let next = await saveSecondary({
        logo_secondary_url: kind === 'primary' ? publicUrl : dealer.logo_secondary_url ?? null,
        logo_secondary_source_url: dealer.logo_secondary_source_url ?? null,
        logo_secondary_light_url: kind === 'light' ? publicUrl : dealer.logo_secondary_light_url ?? null,
        logo_secondary_black_url: kind === 'black' ? publicUrl : dealer.logo_secondary_black_url ?? null,
      })
      if (kind === 'primary') {
        const generated = await generateDefaultDealerLightLogo(dealer.id, 'white', 'secondary')
        if (generated.generatedLightLogoUrl) {
          next = { ...next, logo_secondary_generated_light_url: generated.generatedLightLogoUrl, logo_secondary_generated_light_usable: generated.generatedLightUsable }
          onDealerUpdated(next)
        }
      }
      setMessage('Second logo saved immediately.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'The file uploaded, but it could not be saved.')
    }
    setUploading(false)
  }

  async function generateSecondary(tone: 'white' | 'black') {
    setUploading(true)
    setError('')
    const result = await generateDefaultDealerLightLogo(dealer.id, tone, 'secondary')
    setUploading(false)
    if (result.error || !result.generatedLogoUrl) { setError(result.error ?? 'We could not generate the second logo.'); return }
    onDealerUpdated({
      ...dealer,
      ...(tone === 'white'
        ? { logo_secondary_generated_light_url: result.generatedLogoUrl, logo_secondary_generated_light_usable: result.generatedLogoUsable }
        : { logo_secondary_generated_black_url: result.generatedLogoUrl, logo_secondary_generated_black_usable: result.generatedLogoUsable }),
    })
    setMessage('Second logo variant saved immediately.')
  }

  async function generateBlackLogo() {
    if (!dealer.logo_url) { setError('Upload a logo first.'); return }
    setUploading(true)
    setError('')
    const result = await generateDefaultDealerLightLogo(dealer.id, 'black')
    setUploading(false)
    if (result.error || !result.generatedLogoUrl) { setError(result.error ?? 'We could not generate the black logo.'); return }
    onDealerUpdated({ ...dealer, logo_generated_black_url: result.generatedLogoUrl, logo_generated_black_usable: result.generatedLogoUsable })
    setMessage('Black logo saved immediately.')
  }

  const sectionMeta = {
    logos: ['Logos', 'Upload both logos, generate variants, and set each website link.'],
    placement: ['Logo Display & Placement', 'Choose one or two logos, then where the homepage shows them.'],
    colors: ['Colors', 'Brand colors are separate from the six Door Builder overrides.'],
    typography: ['Typography', 'Headings and body type update the preview immediately.'],
  } as const
  const active = sectionMeta[panel]

  function logoName(url: string | null | undefined) {
    if (!url) return ''
    if (url.startsWith('data:')) return 'Current logo'
    const path = url.split('?')[0] ?? url
    return decodeURIComponent(path.split('/').pop() || 'logo')
  }

  function variantFile(customUrl: string | null | undefined, generatedUrl: string | null | undefined, usable: boolean | null | undefined): { state: LogoFileStatusState; name: string } {
    if (customUrl) return { state: 'saved', name: logoName(customUrl) }
    if (!generatedUrl) return { state: 'unavailable', name: '' }
    if (usable === false) return { state: 'failed', name: logoName(generatedUrl) }
    if (usable == null) return { state: 'unsaved', name: logoName(generatedUrl) }
    return { state: 'saved', name: logoName(generatedUrl) }
  }

  const editor = (
    <>
      <div className="branding-studio__sheet-bar">
        <strong>{active[0]}</strong>
        <button type="button" onClick={() => setEditing(false)}>Close</button>
      </div>
      <div className="branding-studio__editor-head">
        <h2>{logoView === 'cards' ? active[0] : 'Manage Variants'}</h2>
        <p>{logoView === 'cards' ? active[1] : 'Original, white, and black choices for this logo. Files save immediately.'}</p>
        {message && <p className="branding-studio__message" role="status">{message}</p>}
        {error && <p className="branding-studio__message is-error" role="alert">{error}</p>}
      </div>
      {logoView !== 'cards' && <button type="button" className="branding-studio__back-section" onClick={() => setLogoView('cards')}>Back</button>}
      {panel === 'logos' && logoView === 'cards' && (
        <div className="branding-studio__cards">
          <p className="branding-studio__note">Logo files and generated variants save immediately. Website links stay in the draft until you save.</p>
          {uploading ? <LogoFileStatus state="generating" /> : null}
          {dealer.logo_url ? (
          <article className="studio-logo" id="logo-original">
            <strong>Logo 1 · Active</strong>
            <div className="studio-logo__row">
              <div className="studio-logo__thumb"><img src={dealer.logo_url} alt="" onLoad={(event) => { const size = `${event.currentTarget.naturalWidth} × ${event.currentTarget.naturalHeight}`; setLogoSize((current) => ({ ...current, primary: size })) }} /></div>
              <div className="studio-logo__actions">
                <label className="button button--outline">Upload Original<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={(event) => void uploadLogo(event, 'primary')} /></label>
                <span id="logo-white"><button type="button" className="button button--outline" onClick={() => void generateLightLogo()}>Generate White</button></span>
                <span id="logo-black"><button type="button" className="button button--outline" onClick={() => void generateBlackLogo()}>Generate Black</button></span>
              </div>
            </div>
            <ul className="studio-logo__files">
              <li><span className="studio-logo__kind">Original</span><LogoFileStatus state="saved" name={logoName(dealer.logo_url)} detail={logoSize.primary} /></li>
              <li><span className="studio-logo__kind">White</span><LogoFileStatus {...variantFile(dealer.logo_light_url, dealer.logo_generated_light_url, dealer.logo_generated_light_usable)} /></li>
              <li><span className="studio-logo__kind">Black</span><LogoFileStatus {...variantFile(dealer.logo_black_url, dealer.logo_generated_black_url, dealer.logo_generated_black_usable)} /></li>
            </ul>
            {(dealer.logo_light_url || dealer.logo_generated_light_url) && <img className="studio-logo__variant" src={dealer.logo_light_url ?? dealer.logo_generated_light_url ?? ''} alt="" />}
            <button type="button" className="button button--outline" onClick={() => setLogoView('primary-variants')}>Manage Variants</button>
            {dealer.logo_light_url && <button type="button" className="button button--outline" onClick={() => void removeCustomLightLogo()}>Remove Custom Logo</button>}
            {dealer.logo_source_url && <button type="button" className="button button--outline" onClick={() => void restoreOriginalLogo()}>Restore Original</button>}
            {removalNotice && <p role="status">{removalNotice}</p>}
          </article>
          ) : (
          <article className="studio-logo" id="logo-original">
            <strong>Logo 1</strong>
            <p>No file yet.</p>
            <ul className="studio-logo__files">
              <li><span className="studio-logo__kind">Original</span><LogoFileStatus state="unavailable" /></li>
              <li><span className="studio-logo__kind">White</span><LogoFileStatus state="unavailable" /></li>
              <li><span className="studio-logo__kind">Black</span><LogoFileStatus state="unavailable" /></li>
            </ul>
            <label className="button button--outline">Upload Original<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={(event) => void uploadLogo(event, 'primary')} /></label>
            <p className="studio-logo__hint">Upload a logo first</p>
            <button type="button" className="button button--outline" disabled title="Upload a logo first">Generate White</button>
            <button type="button" className="button button--outline" disabled title="Upload a logo first">Generate Black</button>
          </article>
          )}
          {dealer.logo_secondary_url ? (
            <article className="studio-logo" id="logo-secondary">
              <strong>Logo 2 · Active</strong>
              <div className="studio-logo__row">
                <div className="studio-logo__thumb"><img src={dealer.logo_secondary_url} alt="" onLoad={(event) => { const size = `${event.currentTarget.naturalWidth} × ${event.currentTarget.naturalHeight}`; setLogoSize((current) => ({ ...current, secondary: size })) }} /></div>
                <div className="studio-logo__actions">
                  <label className="button button--outline">Replace Logo<input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => void uploadSecondary(event, 'primary')} /></label>
                  <button type="button" className="button button--outline" onClick={() => void generateSecondary('white')}>Generate White</button>
                  <button type="button" className="button button--outline" onClick={() => void generateSecondary('black')}>Generate Black</button>
                </div>
              </div>
              <ul className="studio-logo__files">
                <li><span className="studio-logo__kind">Original</span><LogoFileStatus state="saved" name={logoName(dealer.logo_secondary_url)} detail={logoSize.secondary} /></li>
                <li><span className="studio-logo__kind">White</span><LogoFileStatus {...variantFile(dealer.logo_secondary_light_url, dealer.logo_secondary_generated_light_url, dealer.logo_secondary_generated_light_usable)} /></li>
                <li><span className="studio-logo__kind">Black</span><LogoFileStatus {...variantFile(dealer.logo_secondary_black_url, dealer.logo_secondary_generated_black_url, dealer.logo_secondary_generated_black_usable)} /></li>
              </ul>
              <button type="button" className="button button--outline" onClick={() => setLogoView('secondary-variants')}>Manage Variants</button>
            </article>
          ) : (
            <article className="studio-logo" id="logo-secondary">
              <strong>Logo 2</strong>
              <p>No second logo yet.</p>
              <ul className="studio-logo__files">
                <li><span className="studio-logo__kind">Original</span><LogoFileStatus state="unavailable" /></li>
                <li><span className="studio-logo__kind">White</span><LogoFileStatus state="unavailable" /></li>
                <li><span className="studio-logo__kind">Black</span><LogoFileStatus state="unavailable" /></li>
              </ul>
              <label className="button button--outline">Add Second Logo<input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => void uploadSecondary(event, 'primary')} /></label>
            </article>
          )}
          <section className="studio-links">
            <h3>Website links</h3>
            <label>Logo 1 link<input value={primaryLink} onChange={(event) => setPrimaryLinkDraft(event.target.value)} placeholder="https://example.com" /></label>
            <label>Logo 2 link <span>optional</span><input value={secondaryLink} onChange={(event) => setSecondaryLinkDraft(event.target.value)} placeholder="https://example.com" /></label>
          </section>
        </div>
      )}
      {panel === 'logos' && logoView !== 'cards' && (
        <div className="branding-studio__variants">
          <DealerLogoVariantSettings dealer={previewDealer} embedded placement={placement} onDraftChange={setVariantDraft} onSave={async () => previewDealer} onSaveWebsite={saveWebsite} onUpdated={onDealerUpdated} />
        </div>
      )}
      {panel === 'placement' && (
        <>
          <p className="branding-studio__note">Header and Hero are only set here. Marketing banners do not use these choices.</p>
          <DealerLogoDisplaySettings key={`display-${draftEpoch}`} dealer={dealer} embedded showUploads={false} value={display} onDraftChange={setDisplayDraft} onSaveDisplay={async (value) => saveDisplay(dealer, value)} onSaveSecondary={saveSecondary} onUpdated={onDealerUpdated} />
          <DealerLogoPlacementSettings key={`placement-${draftEpoch}`} dealer={dealer} value={placement} onDraftChange={setPlacementDraft} onSave={async (value) => savePlacement(dealer, value)} onUpdated={onDealerUpdated} />
        </>
      )}
      {panel === 'colors' && (
        <>
          <section className="studio-brand">
            <h3>Brand colors</h3>
            <p>Primary and secondary stay with the dealer brand. They are not the six Door Builder overrides below.</p>
            <BrandColorField id="brand-primary" label="Primary" value={brand.primary} onChange={(next) => setBrandDraft({ primary: next, secondary: brand.secondary })} />
            <BrandColorField id="brand-secondary" label="Secondary" value={brand.secondary} onChange={(next) => setBrandDraft({ primary: brand.primary, secondary: next })} />
          </section>
          {(canEditAppearance || mode === 'admin')
            ? <DoorBuilderAppearanceSettings key={`appearance-${draftEpoch}`} dealer={previewDealer} mode={mode} canEdit embedded loadFromServer={false} initialAppearance={appearance} onDraftChange={setAppearanceDraft} onSave={async (value) => { onDealerUpdated(await saveAppearance(dealer, value)) }} />
            : <p>Appearance settings are available to dealer admins.</p>}
        </>
      )}
      {panel === 'typography' && (
        <DealerTypographySettings key={`type-${draftEpoch}`} dealer={previewDealer} draft={typographyDraft} embedded onDraftChange={(values) => setTypographyDraft(JSON.stringify(values) === JSON.stringify(dealerTypographyValues(dealer)) ? null : values)} onSave={async (values) => saveTypography(dealer, values)} onUpdated={onDealerUpdated} />
      )}
      {removal && <LogoBackgroundDialog originalUrl={removal.originalUrl} removedUrl={removal.removedUrl} reason={removal.reason} busy={uploading} onAccept={() => void acceptTransparentLogo()} onKeep={() => void keepOriginalLogo()} onCancel={dismissRemoval} />}
      <div className="branding-studio__sheet-actions">
        <button type="button" className="button button--outline" onClick={discard} disabled={!dirty || saving}>Discard Changes</button>
        <button type="button" className="button button--primary" onClick={() => void saveAll()} disabled={!dirty || saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
      </div>
    </>
  )

  return (
    <div className={`branding-studio${editing ? ' is-editing' : ''}`}>
      <nav className="branding-studio__tabs" aria-label="Dealer sections">
        <Link to={backTo}>Company Details</Link>
        <span aria-current="page">Branding &amp; Appearance</span>
        {mode === 'admin' ? <Link to={`${backTo}#door-builder-lead-webhook`}>Lead Webhook</Link> : <Link to="/company#website-address">Website Address</Link>}
      </nav>
      <header className="branding-studio__toolbar">
        <Link className="branding-studio__back" to={backTo}>{mode === 'dealer' ? 'Back to Company Details' : 'Back to Dealer'}</Link>
        <div className="branding-studio__identity">
          <h1 title="Branding & Appearance">Branding &amp; Appearance</h1>
          <p title={dealer.company_name}>{dealer.company_name}</p>
        </div>
        <p className="branding-studio__live-status"><span className="branding-studio__live-dot" /><span className="branding-studio__live-copy">Live preview updates instantly</span></p>
        <p className={`branding-studio__status${dirty ? '' : ' is-clean'}`} role="status">{dirty ? 'Unsaved changes' : 'All changes saved'}</p>
        <a className="branding-studio__live" href={getDealerVisualizerUrl(dealer.slug)} target="_blank" rel="noreferrer">Open Live Website</a>
        <div className="branding-studio__actions">
          <button type="button" className="button button--outline" onClick={discard} disabled={!dirty || saving}>Discard Changes</button>
          <button type="button" className="button button--primary" onClick={() => void saveAll()} disabled={!dirty || saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
          <button type="button" className="branding-studio__edit" onClick={() => setEditing(true)}>Edit Settings</button>
        </div>
      </header>
      <div className="branding-studio__workspace">
        <nav className="branding-studio__nav" aria-label="Branding categories">
          {STUDIO_SECTIONS.map((item) => (
            <button key={item.id} type="button" aria-current={panel === item.id ? 'page' : undefined} onClick={() => choose(item.id)}>
              <span aria-hidden="true">{item.id === 'logos' ? '▣' : item.id === 'placement' ? '▤' : item.id === 'colors' ? '◉' : 'Aa'}</span>
              {item.id === 'placement' ? 'Logo Display' : item.label}
            </button>
          ))}
        </nav>
        <section className="branding-studio__preview" aria-label="Live preview">
          <div className="branding-studio__preview-card">
            <div className="branding-studio__preview-bar">
              <strong>Live Preview</strong>
              <div className="branding-studio__toggles" role="group" aria-label="Preview page">
                {(['homepage', 'builder', 'find'] as const).map((value) => (
                  <button key={value} type="button" aria-pressed={surface === value} onClick={() => setSurface(value)}>{value === 'find' ? 'Find My Door' : value === 'builder' ? 'Door Builder' : 'Homepage'}</button>
                ))}
              </div>
              <div className="branding-studio__toggles" role="group" aria-label="Preview width">
                <button type="button" aria-pressed={!mobile} onClick={() => setMobile(false)}>Desktop</button>
                <button type="button" aria-pressed={mobile} onClick={() => setMobile(true)}>Mobile</button>
              </div>
            </div>
            <DoorBuilderAppearancePreview dealer={previewDealer} appearance={appearance} surface={surface} mobile={mobile} hideToolbar />
          </div>
        </section>
        <aside className="branding-studio__editor" aria-label="Branding settings">{editor}</aside>
      </div>
    </div>
  )
}
