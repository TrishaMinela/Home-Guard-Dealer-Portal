import { useState, type ChangeEvent } from 'react'
import type { AdminDealer } from '../types/admin'
import { LogoBackgroundDialog } from './LogoBackgroundDialog'
import { readLogoForRemoval } from '../utils/readLogoForRemoval'
import { generateDefaultDealerLightLogo } from '../utils/dealerLightLogo'
import {
  doorBuilderHeaderSurface,
  isLightBrandColor,
  normalizeLogoDisplay,
  normalizeLogoVariant,
  previewLogoUrl,
  secondaryLogoSource,
  type DealerLogoDisplay,
} from '../utils/dealerLogoVariants'

type SecondaryAssets = {
  logo_secondary_url: string | null
  logo_secondary_source_url: string | null
  logo_secondary_light_url: string | null
  logo_secondary_black_url: string | null
}

type Props = {
  dealer: AdminDealer
  onSaveDisplay: (display: DealerLogoDisplay) => Promise<AdminDealer>
  onSaveSecondary: (assets: SecondaryAssets) => Promise<AdminDealer>
  onUpdated: (dealer: AdminDealer) => void
}

const logoExtensions: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
}

type SecondaryKind = 'primary' | 'light' | 'black'

function LogoPair({
  primary,
  secondaryUrl,
  showPair,
  dark,
  background,
  color,
}: {
  primary: string | null
  secondaryUrl: string | null
  showPair: boolean
  dark: boolean
  background: string
  color: string
}) {
  const single = !showPair || !secondaryUrl
  return (
    <div className={`logo-display-preview ${dark ? 'logo-display-preview--dark' : ''}`} style={{ background, color }}>
      {primary ? <img src={primary} alt="" /> : <span>First logo</span>}
      {!single && (
        <>
          <span className="logo-display-preview__divider" aria-hidden="true" />
          <img src={secondaryUrl ?? ''} alt="" />
        </>
      )}
    </div>
  )
}

export function DealerLogoDisplaySettings({ dealer, onSaveDisplay, onSaveSecondary, onUpdated }: Props) {
  const saved = normalizeLogoDisplay(dealer.logo_display)
  const [display, setDisplay] = useState<DealerLogoDisplay>(saved)
  const [isSaving, setIsSaving] = useState(false)
  const [uploading, setUploading] = useState<SecondaryKind | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [removal, setRemoval] = useState<{ file: File; originalUrl: string; removedUrl: string; reason: string; png: Blob } | null>(null)

  const headerVariant = normalizeLogoVariant(dealer.logo_header_variant)
  const primaryHeader = previewLogoUrl(dealer, headerVariant, 'header')
  const secondary = secondaryLogoSource(dealer)
  const secondaryHeader = previewLogoUrl(secondary, headerVariant, 'header')
  const primaryHero = previewLogoUrl(dealer, headerVariant, 'hero')
  const secondaryHero = previewLogoUrl(secondary, headerVariant, 'hero')
  const headerSurface = doorBuilderHeaderSurface(dealer)
  const headerIsLight = isLightBrandColor(headerSurface)
  const showPair = display === 'dual'
  const secondaryMissing = showPair && !secondaryHeader

  async function saveDisplay() {
    setMessage('')
    setError('')
    setIsSaving(true)
    try {
      const updated = await onSaveDisplay(display)
      onUpdated(updated)
      setMessage(display === 'dual' ? 'Door Builder will show two logos.' : 'Door Builder will show one logo.')
    } catch (saveError) {
      console.error('Failed to save logo display.', saveError)
      setError('We could not save the logo display. Apply the dual-logo migration, then try again.')
    } finally {
      setIsSaving(false)
    }
  }

  function currentAssets(override: Partial<SecondaryAssets> = {}): SecondaryAssets {
    return {
      logo_secondary_url: dealer.logo_secondary_url ?? null,
      logo_secondary_source_url: dealer.logo_secondary_source_url ?? null,
      logo_secondary_light_url: dealer.logo_secondary_light_url ?? null,
      logo_secondary_black_url: dealer.logo_secondary_black_url ?? null,
      ...override,
    }
  }

  async function storeFile(file: File, kind: SecondaryKind, sourceFile?: File) {
    const extension = logoExtensions[file.type] ?? (kind === 'primary' && file.type === 'image/png' ? 'png' : null)
    if (!extension || extension === 'svg') {
      setError('Second logos use PNG, JPEG, or WebP.')
      return
    }
    setUploading(kind)
    setError('')
    setMessage('')
    const filename = kind === 'primary' ? 'logo-secondary' : kind === 'black' ? 'logo-secondary-black' : 'logo-secondary-light'
    const { supabase } = await import('../lib/supabase')
    const objectPath = `${dealer.id}/${filename}.${extension}`
    const { error: uploadError } = await supabase.storage.from('dealer-logos').upload(objectPath, file, { contentType: file.type, upsert: true })
    if (uploadError) {
      setUploading(null)
      setError('We could not upload the second logo. Please try again.')
      return
    }
    let sourceUrl = dealer.logo_secondary_source_url ?? null
    if (kind === 'primary' && sourceFile) {
      const sourceExtension = logoExtensions[sourceFile.type]
      if (sourceExtension && sourceExtension !== 'svg') {
        const sourcePath = `${dealer.id}/logo-secondary-source.${sourceExtension}`
        const sourceUpload = await supabase.storage.from('dealer-logos').upload(sourcePath, sourceFile, { contentType: sourceFile.type, upsert: true })
        if (!sourceUpload.error) sourceUrl = `${supabase.storage.from('dealer-logos').getPublicUrl(sourcePath).data.publicUrl}?v=${Date.now()}`
      }
    }
    const versioned = `${supabase.storage.from('dealer-logos').getPublicUrl(objectPath).data.publicUrl}?v=${Date.now()}`
    try {
      const assets = currentAssets({
        ...(kind === 'primary' ? { logo_secondary_url: versioned, logo_secondary_source_url: sourceUrl } : {}),
        ...(kind === 'light' ? { logo_secondary_light_url: versioned } : {}),
        ...(kind === 'black' ? { logo_secondary_black_url: versioned } : {}),
      })
      let updated = await onSaveSecondary(assets)
      if (kind === 'primary') {
        setIsGenerating(true)
        const generated = await generateDefaultDealerLightLogo(dealer.id, 'white', 'secondary')
        setIsGenerating(false)
        if (generated.generatedLightLogoUrl) {
          updated = {
            ...updated,
            logo_secondary_generated_light_url: generated.generatedLightLogoUrl,
            logo_secondary_generated_light_usable: generated.generatedLightUsable,
          }
        }
      }
      onUpdated({ ...dealer, ...updated })
      setMessage(kind === 'primary' ? 'Second logo saved.' : kind === 'light' ? 'Second white logo saved.' : 'Second black logo saved.')
    } catch (saveError) {
      console.error('Failed to save the second logo.', saveError)
      setError('The file uploaded, but it could not be saved. Apply the dual-logo migration, then try again.')
    } finally {
      setUploading(null)
      setIsGenerating(false)
    }
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>, kind: SecondaryKind) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      setError('Dealer logos must be 5 MB or smaller.')
      return
    }
    if (!logoExtensions[file.type]) {
      setError('Choose a PNG, JPEG, or WebP logo.')
      return
    }
    if (kind === 'primary' && file.type !== 'image/svg+xml') {
      const inspected = await readLogoForRemoval(file)
      if (inspected.confident && inspected.png) {
        setRemoval({
          file,
          originalUrl: URL.createObjectURL(file),
          removedUrl: URL.createObjectURL(inspected.png),
          reason: inspected.reason,
          png: inspected.png,
        })
        return
      }
    }
    await storeFile(file, kind)
  }

  async function generate(tone: 'white' | 'black') {
    setError('')
    setMessage('')
    setIsGenerating(true)
    const result = await generateDefaultDealerLightLogo(dealer.id, tone, 'secondary')
    setIsGenerating(false)
    if (result.error || !result.generatedLogoUrl) {
      setError(result.error ?? 'We could not generate the second logo.')
      return
    }
    onUpdated({
      ...dealer,
      ...(tone === 'white'
        ? { logo_secondary_generated_light_url: result.generatedLogoUrl, logo_secondary_generated_light_usable: result.generatedLogoUsable }
        : { logo_secondary_generated_black_url: result.generatedLogoUrl, logo_secondary_generated_black_usable: result.generatedLogoUsable }),
    })
    setMessage(result.generatedLogoUsable ? 'Second logo variant generated.' : 'A second logo variant was generated, but it is not readable enough to offer.')
  }

  const previewColor = headerIsLight ? '#101417' : '#fff'

  return (
    <section className="content-card dealer-management-card logo-display-settings" aria-labelledby="logo-display-heading">
      <div className="dealer-form__section-heading">
        <p className="eyebrow">Door Builder logos</p>
        <h2 id="logo-display-heading">Logo Display</h2>
        <p>Choose one logo or two logos side by side. Marketing banners keep using the first logo only.</p>
      </div>
      <div className="logo-placement-options" role="radiogroup" aria-label="Logo display">
        <label className={`logo-placement-option ${display === 'single' ? 'is-selected' : ''}`}>
          <input type="radio" name={`logo-display-${dealer.id}`} value="single" checked={display === 'single'} onChange={() => setDisplay('single')} />
          <span><strong>1 Logo</strong><small>The current Door Builder logo. This is the default.</small></span>
        </label>
        <label className={`logo-placement-option ${display === 'dual' ? 'is-selected' : ''}`}>
          <input type="radio" name={`logo-display-${dealer.id}`} value="dual" checked={display === 'dual'} onChange={() => setDisplay('dual')} />
          <span><strong>2 Logos</strong><small>Primary logo on the left, second logo on the right, with a thin divider.</small></span>
        </label>
      </div>
      {showPair && (
        <div className="logo-display-uploads">
          <p>The second logo uses the same Original, White, and Black choices as the first logo. If its selected file is missing, Door Builder shows the second original, then one logo.</p>
          <div className="page-actions">
            <label className={`button button--outline upload-button ${uploading ? 'is-disabled' : ''}`}>
              {uploading === 'primary' ? 'Uploading...' : 'Upload second logo'}
              <input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading !== null} onChange={(event) => void onFile(event, 'primary')} />
            </label>
            <label className={`button button--outline upload-button ${uploading ? 'is-disabled' : ''}`}>
              {uploading === 'light' ? 'Uploading...' : 'Upload second white logo'}
              <input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading !== null} onChange={(event) => void onFile(event, 'light')} />
            </label>
            <label className={`button button--outline upload-button ${uploading ? 'is-disabled' : ''}`}>
              {uploading === 'black' ? 'Uploading...' : 'Upload second black logo'}
              <input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading !== null} onChange={(event) => void onFile(event, 'black')} />
            </label>
            {dealer.logo_secondary_url && <button className="button button--outline" type="button" disabled={isGenerating || uploading !== null} onClick={() => void generate('white')}>{isGenerating ? 'Generating...' : 'Generate second white'}</button>}
            {dealer.logo_secondary_url && <button className="button button--outline" type="button" disabled={isGenerating || uploading !== null} onClick={() => void generate('black')}>{isGenerating ? 'Generating...' : 'Generate second black'}</button>}
          </div>
        </div>
      )}
      <div className="logo-display-previews">
        <div>
          <p>Header preview</p>
          <LogoPair primary={primaryHeader} secondaryUrl={secondaryHeader} showPair={showPair} dark background={headerSurface} color={previewColor} />
        </div>
        {dealer.logo_placement !== 'header' && (
          <div>
            <p>Hero preview</p>
            <LogoPair primary={primaryHero} secondaryUrl={secondaryHero} showPair={showPair} dark={false} background="#f7f8f9" color="#101417" />
          </div>
        )}
      </div>
      {secondaryMissing && <p className="logo-helper-note" role="status">The second logo is missing for this header. Door Builder will show one logo until it is added.</p>}
      {message && <div className="portal-alert portal-alert--success" role="status">{message}</div>}
      {error && <div className="portal-alert" role="alert">{error}</div>}
      <div className="dealer-form__actions">
        <button className="button button--outline" type="button" disabled={isSaving || display === saved} onClick={() => setDisplay(saved)}>Cancel</button>
        <button className="button button--primary" type="button" disabled={isSaving || display === saved} onClick={() => void saveDisplay()}>{isSaving ? 'Saving...' : 'Save Logo Display'}</button>
      </div>
      {removal && (
        <LogoBackgroundDialog
          originalUrl={removal.originalUrl}
          removedUrl={removal.removedUrl}
          reason={removal.reason}
          busy={uploading !== null}
          onAccept={() => {
            const pngFile = new File([removal.png], 'logo-secondary.png', { type: 'image/png' })
            const source = removal.file
            setRemoval(null)
            void storeFile(pngFile, 'primary', source)
          }}
          onKeep={() => {
            const source = removal.file
            setRemoval(null)
            void storeFile(source, 'primary', source)
          }}
          onCancel={() => setRemoval(null)}
        />
      )}
    </section>
  )
}
