import { useEffect, useMemo, useState, type ChangeEvent, type MouseEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { DoorBuilderAppearancePreview } from '../components/DoorBuilderAppearancePreview'
import { DoorBuilderAppearanceSettings } from '../components/DoorBuilderAppearanceSettings'
import { DealerLogoDisplaySettings } from '../components/DealerLogoDisplaySettings'
import { DealerLogoPlacementSettings, type DealerLogoPlacement } from '../components/DealerLogoPlacementSettings'
import { DealerLogoVariantSettings } from '../components/DealerLogoVariantSettings'
import { DealerTypographySettings } from '../components/DealerTypographySettings'
import { LogoBackgroundDialog } from '../components/LogoBackgroundDialog'
import { getDealerVisualizerUrl } from '../config/visualizer'
import { STUDIO_SECTIONS, isLegacyBrandingTarget, runBrandingSave, studioSectionFromValue, type StudioSectionId } from '../features/branding-studio/sections'
import { supabase } from '../lib/supabase'
import '../styles/brandingStudio.css'
import type { AdminDealer } from '../types/admin'
import { appearanceEquals, appearanceRpcArgs, appearanceUpdate, type DoorBuilderAppearance } from '../utils/doorBuilderAppearance'
import { generateDefaultDealerLightLogo } from '../utils/dealerLightLogo'
import { generatedLightLogoMessage, logoVariantSavePlan, normalizeLogoDisplay, type DealerLogoDisplay, type DealerLogoVariant } from '../utils/dealerLogoVariants'
import { dealerTypographyValues, typographyPayload, type DealerTypographyValues } from '../utils/dealerTypography'
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
  const section: StudioSectionId = requested === 'colors' && mode === 'dealer' && !canEditAppearance ? 'logos' : requested
  const [panel, setPanel] = useState<'list' | StudioSectionId>(params.get('section') ? section : 'list')
  const [logoView, setLogoView] = useState<'cards' | 'variants'>('cards')
  const [editing, setEditing] = useState(false)
  const [surface, setSurface] = useState<'homepage' | 'builder' | 'find'>('homepage')
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 767px)').matches)
  const [placementDraft, setPlacementDraft] = useState<DealerLogoPlacement | null>(null)
  const [displayDraft, setDisplayDraft] = useState<DealerLogoDisplay | null>(null)
  const [variantDraft, setVariantDraft] = useState<Partial<AdminDealer> | null>(null)
  const [typographyDraft, setTypographyDraft] = useState<DealerTypographyValues | null>(null)
  const [appearanceDraft, setAppearanceDraft] = useState<DoorBuilderAppearance | null | undefined>(undefined)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [removal, setRemoval] = useState<{ file: File; originalUrl: string; removedUrl: string; reason: string; png: Blob } | null>(null)
  const [removalNotice, setRemovalNotice] = useState('')
  const [uploading, setUploading] = useState(false)

  const savedPlacement: DealerLogoPlacement = dealer.logo_placement === 'header' ? 'header' : 'hero'
  const placement = placementDraft ?? savedPlacement
  const display = displayDraft ?? normalizeLogoDisplay(dealer.logo_display)
  const previewDealer = useMemo(() => ({
    ...dealer,
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
  }), [dealer, display, placement, typographyDraft, variantDraft])
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

  useEffect(() => {
    const place = () => {
      const toolbar = document.querySelector('.branding-studio__toolbar')
      const bottom = toolbar ? Math.ceil(toolbar.getBoundingClientRect().bottom) : 72
      document.documentElement.style.setProperty('--studio-sheet-top', `${bottom}px`)
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [editing, panel])

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
    setEditing(true)
    setParams({ section: next })
  }

  function discard() {
    if (dirty && !window.confirm('Discard unsaved branding changes?')) return
    setPlacementDraft(null)
    setDisplayDraft(null)
    setVariantDraft(null)
    setTypographyDraft(null)
    setAppearanceDraft(undefined)
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
      tasks.push({ id: 'display', label: 'Logo display', run: async () => { current = await saveDisplay(current, displayDraft) } })
    }
    if (placementDraft != null && placementDraft !== savedPlacement) {
      tasks.push({ id: 'placement', label: 'Logo placement', run: async () => { current = await savePlacement(current, placementDraft) } })
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
    const result = await runBrandingSave(tasks)
    onDealerUpdated(current)
    if (result.failed.length === 0) {
      setPlacementDraft(null)
      setDisplayDraft(null)
      setVariantDraft(null)
      setTypographyDraft(null)
      setAppearanceDraft(undefined)
      setMessage('Changes saved.')
    } else {
      setError(`Saved ${result.saved.join(', ') || 'nothing'}. Could not save ${result.failed.map((item) => `${item.label}: ${item.message}`).join(' ')}`)
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

  function leave(event: MouseEvent<HTMLAnchorElement>) {
    if (dirty && !window.confirm('You have unsaved branding changes. Leave without saving?')) event.preventDefault()
  }

  const settings = (
    <>
      <div className="branding-studio__sheet-bar">
        <strong>{panel === 'list' ? 'Settings' : STUDIO_SECTIONS.find((item) => item.id === panel)?.label}</strong>
        <button type="button" onClick={() => setEditing(false)}>Close</button>
      </div>
      {panel !== 'list' && <button type="button" className="branding-studio__back-section" onClick={() => { setPanel('list'); setLogoView('cards') }}>Back</button>}
      {panel === 'list' && (
        <ul className="branding-studio__menu">
          {STUDIO_SECTIONS.filter((item) => item.id !== 'colors' || canEditAppearance || mode === 'admin').map((item) => (
            <li key={item.id}><button type="button" onClick={() => choose(item.id)}><strong>{item.label}</strong><span aria-hidden="true">Edit this part of the Door Builder</span></button></li>
          ))}
        </ul>
      )}
      {panel === 'logos' && logoView === 'cards' && (
        <div className="branding-studio__cards">
          <p className="branding-studio__note">Logo files, generated variants, and website links save immediately. Other choices stay in the draft until you save.</p>
          <article className="branding-studio__card" id="logo-original">
            <strong>Logo 1 · Primary</strong>
            {dealer.logo_url ? <img src={dealer.logo_url} alt="" /> : <p>No primary logo yet.</p>}
            <label className="button button--outline">{uploading ? 'Uploading...' : 'Replace Logo'}<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={(event) => void uploadLogo(event, 'primary')} /></label>
            <button type="button" className="button button--outline" onClick={() => setLogoView('variants')}>Manage Variants</button>
            {dealer.logo_source_url && <button type="button" className="button button--outline" onClick={() => void restoreOriginalLogo()}>Restore Original</button>}
            {removalNotice && <p role="status">{removalNotice}</p>}
          </article>
          <article className="branding-studio__card" id="logo-white">
            <strong>White variant</strong>
            {(dealer.logo_light_url || dealer.logo_generated_light_url) ? <img src={dealer.logo_light_url ?? dealer.logo_generated_light_url ?? ''} alt="" /> : <p>No white logo yet.</p>}
            <p>Generated or uploaded. Saved immediately when you replace it.</p>
            <label className="button button--outline">Replace white<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={(event) => void uploadLogo(event, 'light')} /></label>
            <button type="button" className="button button--outline" onClick={() => void generateLightLogo()}>{uploading ? 'Generating...' : 'Generate White'}</button>
            {dealer.logo_light_url && <button type="button" className="button button--outline" onClick={() => void removeCustomLightLogo()}>Remove Custom Logo</button>}
          </article>
          <article className="branding-studio__card" id="logo-black">
            <strong>Black variant</strong>
            <label className="button button--outline">Replace black<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={(event) => void uploadLogo(event, 'black')} /></label>
          </article>
          <article className="branding-studio__card">
            <strong>Logo 2 · Secondary</strong>
            {dealer.logo_secondary_url ? <img src={dealer.logo_secondary_url} alt="" /> : <p>Add a second logo from Logo Display.</p>}
            <button type="button" className="button button--outline" onClick={() => choose('placement')}>{dealer.logo_secondary_url ? 'Replace second logo' : 'Add Second Logo'}</button>
            <button type="button" className="button button--outline" onClick={() => setLogoView('variants')}>Manage Variants</button>
          </article>
        </div>
      )}
      {panel === 'logos' && logoView === 'variants' && (
        <DealerLogoVariantSettings dealer={previewDealer} embedded placement={placement} onDraftChange={setVariantDraft} onSave={async () => previewDealer} onSaveWebsite={saveWebsite} onUpdated={onDealerUpdated} />
      )}
      {panel === 'placement' && (
        <>
          <p className="branding-studio__note">Marketing banners do not use these choices.</p>
          <DealerLogoDisplaySettings dealer={dealer} embedded onDraftChange={setDisplayDraft} onSaveDisplay={async (value) => saveDisplay(dealer, value)} onSaveSecondary={async () => dealer} onUpdated={onDealerUpdated} />
          <DealerLogoPlacementSettings dealer={dealer} onDraftChange={setPlacementDraft} onSave={async (value) => savePlacement(dealer, value)} onUpdated={onDealerUpdated} />
        </>
      )}
      {panel === 'colors' && (canEditAppearance || mode === 'admin'
        ? <DoorBuilderAppearanceSettings dealer={dealer} mode={mode} canEdit embedded onDraftChange={setAppearanceDraft} onSave={async (value) => { onDealerUpdated(await saveAppearance(dealer, value)) }} />
        : <p>Appearance settings are available to dealer admins.</p>)}
      {panel === 'typography' && (
        <DealerTypographySettings dealer={dealer} embedded onDraftChange={setTypographyDraft} onSave={async (values) => saveTypography(dealer, values)} onUpdated={onDealerUpdated} />
      )}
      {removal && <LogoBackgroundDialog originalUrl={removal.originalUrl} removedUrl={removal.removedUrl} reason={removal.reason} busy={uploading} onAccept={() => void acceptTransparentLogo()} onKeep={() => void keepOriginalLogo()} onCancel={dismissRemoval} />}
    </>
  )

  return (
    <div className={`branding-studio${editing ? ' is-editing' : ''}`}>
      <header className="branding-studio__toolbar">
        <Link className="branding-studio__back" to={backTo} onClick={leave}>Back to Dealer</Link>
        <div className="branding-studio__identity"><h1>{dealer.company_name}</h1><span>Branding Studio</span></div>
        <a className="branding-studio__live" href={getDealerVisualizerUrl(dealer.slug)} target="_blank" rel="noreferrer">Open Live Website</a>
        <div className="branding-studio__toggles" role="group" aria-label="Preview page">
          {(['homepage', 'builder', 'find'] as const).map((value) => (
            <button key={value} type="button" aria-pressed={surface === value} onClick={() => setSurface(value)}>{value === 'find' ? 'Find My Door' : value === 'builder' ? 'Door Builder' : 'Homepage'}</button>
          ))}
        </div>
        <div className="branding-studio__toggles" role="group" aria-label="Preview width">
          <button type="button" aria-pressed={!mobile} onClick={() => setMobile(false)}>Desktop</button>
          <button type="button" aria-pressed={mobile} onClick={() => setMobile(true)}>Mobile</button>
        </div>
        <p className={`branding-studio__status${dirty ? '' : ' is-clean'}`} role="status">{dirty ? 'Unsaved changes' : 'All changes saved'}</p>
        <div className="branding-studio__actions">
          <button type="button" className="button button--outline" onClick={discard} disabled={!dirty || saving}>Discard</button>
          <button type="button" className="button button--primary" onClick={() => void saveAll()} disabled={!dirty || saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
          <button type="button" className="branding-studio__edit" onClick={() => setEditing(true)}>Edit Settings</button>
        </div>
      </header>
      {message && <p className="branding-studio__message" role="status">{message}</p>}
      {error && <p className="branding-studio__message is-error" role="alert">{error}</p>}
      <div className="branding-studio__workspace">
        <aside className="branding-studio__settings" aria-label="Branding settings">{settings}</aside>
        <div className="branding-studio__preview">
          <DoorBuilderAppearancePreview dealer={previewDealer} appearance={appearance} surface={surface} mobile={mobile} hideToolbar />
        </div>
      </div>
    </div>
  )
}
