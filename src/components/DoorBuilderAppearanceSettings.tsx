import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { AdminDealer } from '../types/admin'
import { AppearanceColorControl } from './AppearanceColorControl'
import { AppearanceTextControl } from './AppearanceTextControl'
import { DoorBuilderAppearancePreview } from './DoorBuilderAppearancePreview'
import {
  LEGACY_APPEARANCE_NOTICE,
  SIMPLIFIED_APPEARANCE_FIELDS,
  SIMPLIFIED_GROUP_LABELS,
  appearanceContrastWarnings,
  appearanceEditorPayload,
  appearanceEquals,
  appearanceForStorage,
  appearanceFromStorage,
  appearanceUsesLegacyMapping,
  missingAppearanceColumn,
  resolvedBrandColors,
  type AppearanceToken,
  type AppearanceValue,
  type DoorBuilderAppearance,
  type SimplifiedAppearanceGroup,
} from '../utils/doorBuilderAppearance'
import '../styles/appearanceControls.css'

type Props = {
  dealer: AdminDealer
  mode: 'admin' | 'dealer'
  canEdit?: boolean
  loadFromServer?: boolean
  initialAppearance?: DoorBuilderAppearance | null
  embedded?: boolean
  onDraftChange?: (value: DoorBuilderAppearance | null) => void
  onSave: (value: DoorBuilderAppearance | null) => Promise<void>
}

const GROUP_NOTES: Record<SimplifiedAppearanceGroup, string> = {
  header: 'Background covers the builder header, the homepage header, and the Find My Door header. Text colors navigation labels, icons, and header buttons. Logos, logo links, and logo sizing stay as they are.',
  main: 'One background covers the left configuration area on Door, Finish, Glass, and Hardware, including its headings and instructions. It does not recolor the door preview, the homepage hero, or homepage content. Find My Door uses it only on the options block. Cards, door images, glass, finishes, hardware, and photos keep their own colors.',
  footer: 'Text colors footer copy, links, the Built with ♥ by School Radius credit, and icons. Home Guard branding, feedback, and links stay in place.',
}

const GROUPS: SimplifiedAppearanceGroup[] = ['header', 'main', 'footer']

export function DoorBuilderAppearanceSettings({
  dealer,
  mode,
  canEdit = mode === 'admin',
  loadFromServer = true,
  initialAppearance = null,
  embedded = false,
  onDraftChange,
  onSave,
}: Props) {
  const [saved, setSaved] = useState<DoorBuilderAppearance | null>(initialAppearance)
  const [draft, setDraft] = useState<DoorBuilderAppearance | null>(initialAppearance)
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [loadedFor, setLoadedFor] = useState<string | null>(loadFromServer ? null : dealer.id)
  const [migrationNeeded, setMigrationNeeded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const resetDialogRef = useRef<HTMLDialogElement>(null)
  const brand = resolvedBrandColors({ primaryColor: dealer.primary_color, secondaryColor: dealer.secondary_color })
  const ready = !loadFromServer || loadedFor === dealer.id
  const shownDraft = ready ? draft : null
  const dirty = ready && !appearanceEquals(draft, saved)
  const legacyNotice = ready && appearanceUsesLegacyMapping(saved)
  const warnings = useMemo(
    () => appearanceContrastWarnings(appearanceEditorPayload(draft), { primaryColor: dealer.primary_color, secondaryColor: dealer.secondary_color }),
    [draft, dealer.primary_color, dealer.secondary_color],
  )

  useEffect(() => {
    if (!loadFromServer) return
    let active = true
    void (async () => {
      const { data, error: loadError } = await supabase
        .from('dealers')
        .select('door_builder_appearance')
        .eq('id', dealer.id)
        .maybeSingle()
      if (!active) return
      if (loadError) {
        if (missingAppearanceColumn(loadError.message)) setMigrationNeeded(true)
        else setError('The saved appearance could not be loaded.')
        setLoadedFor(dealer.id)
        return
      }
      const next = appearanceFromStorage(data?.door_builder_appearance)
      setSaved(next)
      setDraft(next)
      setMigrationNeeded(false)
      setLoadedFor(dealer.id)
    })()
    return () => { active = false }
  }, [dealer.id, loadFromServer])

  useEffect(() => {
    onDraftChange?.(draft)
  }, [draft, onDraftChange])

  useEffect(() => {
    if (embedded || !dirty) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty, embedded])

  if (!canEdit) return null

  const setToken = (key: AppearanceToken, value: AppearanceValue | null) => {
    setMessage('')
    setError('')
    setDraft((current) => {
      const next: DoorBuilderAppearance = { ...(current ?? {}) }
      if (!value) delete next[key]
      else next[key] = value
      const parsed = appearanceForStorage(next)
      return parsed.ok ? parsed.value : current
    })
  }

  const save = async () => {
    const parsed = appearanceForStorage(appearanceEditorPayload(draft) ?? {})
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await onSave(parsed.value)
      setSaved(parsed.value)
      setDraft(parsed.value)
      setMessage('Door Builder appearance saved.')
    } catch (saveError) {
      const text = saveError instanceof Error ? saveError.message : ''
      setError(missingAppearanceColumn(text)
        ? 'Apply the Door Builder appearance migration, then try again.'
        : 'The appearance could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section id="door-builder-appearance" className="content-card dealer-management-card appearance-settings dealer-setup-anchor" aria-labelledby="door-builder-appearance-heading">
      <div className="branding-customizer__scroll">
      <div className="dealer-form__section-heading">
        <p className="eyebrow">Door Builder</p>
        <h2 id="door-builder-appearance-heading">Door Builder Appearance</h2>
        <p className="appearance-settings__intro">
          Six settings cover the header, the main section, and the footer. A background can inherit the current styling, follow a brand color, or use its own HEX value. Text is black, white, or the current styling. Nothing is stored until you save appearance.
          {mode === 'dealer' ? ' This saves only your Door Builder appearance.' : ' This saves only this dealer’s Door Builder appearance.'}
        </p>
      </div>
      {legacyNotice && <div className="portal-alert" role="status">{LEGACY_APPEARANCE_NOTICE}</div>}
      {migrationNeeded && <div className="portal-alert" role="status">Appearance choices can be previewed now. They can be saved after the Door Builder appearance migration is applied.</div>}
      {dirty && !embedded && <div className="portal-alert" role="status">Appearance has unsaved changes.</div>}
      {message && <div className="portal-alert portal-alert--success" role="status">{message}</div>}
      {error && <div className="portal-alert" role="alert">{error}</div>}
      {warnings.length > 0 && (
        <div className="appearance-warnings" role="status">
          <strong>Contrast warning. You can still save these colors.</strong>
          {warnings.map((warning) => <span key={warning.id}>{warning.label} is about {warning.ratio.toFixed(1)}:1.</span>)}
        </div>
      )}
      <div className="appearance-layout">
        <div className="appearance-settings__groups">
          {GROUPS.map((group) => (
            <fieldset key={group} className="appearance-group">
              <legend>{SIMPLIFIED_GROUP_LABELS[group]}</legend>
              <p>{GROUP_NOTES[group]}</p>
              <div className="appearance-group__fields">
                {SIMPLIFIED_APPEARANCE_FIELDS.filter((field) => field.group === group).map((field) => (
                  field.role === 'text' ? (
                    <AppearanceTextControl
                      key={field.key}
                      id={`appearance-${field.key}`}
                      label={field.label}
                      value={shownDraft?.[field.key] ?? null}
                      onChange={(value) => setToken(field.key, value)}
                    />
                  ) : (
                    <AppearanceColorControl
                      key={field.key}
                      id={`appearance-${field.key}`}
                      label={field.label}
                      value={shownDraft?.[field.key] ?? null}
                      brand={brand}
                      open={openKey === field.key}
                      onOpenChange={(next) => setOpenKey(next ? field.key : null)}
                      onChange={(value) => setToken(field.key, value)}
                    />
                  )
                ))}
              </div>
            </fieldset>
          ))}
        </div>
        {!embedded && <DoorBuilderAppearancePreview dealer={dealer} appearance={shownDraft} />}
      </div>
      </div>
      <div className="dealer-form__actions appearance-toolbar">
        <button className="button button--outline" type="button" disabled={!dirty || saving} onClick={() => { setDraft(saved); setOpenKey(null); setError(''); setMessage('') }}>Cancel Changes</button>
        <button className="button button--outline" type="button" disabled={saving || appearanceEquals(draft, null)} onClick={() => resetDialogRef.current?.showModal()}>Reset All Colors to Default</button>
        <button className="button button--primary" type="button" disabled={!dirty || saving || !ready} onClick={() => void save()}>{saving ? 'Saving...' : 'Save Appearance'}</button>
      </div>
      <dialog ref={resetDialogRef} className="appearance-confirm" role="alertdialog" aria-labelledby="reset-all-colors-title" aria-describedby="reset-all-colors-body">
        <h3 id="reset-all-colors-title">Reset all colors to default?</h3>
        <p id="reset-all-colors-body">This clears every Door Builder color override in this draft, including older advanced color settings. Brand colors, logos, logo links, and typography stay as they are. Nothing is saved until you save appearance.</p>
        <div className="appearance-confirm__actions">
          <button className="button button--outline" type="button" onClick={() => resetDialogRef.current?.close()}>Cancel</button>
          <button className="button button--primary" type="button" onClick={() => { setDraft(null); setOpenKey(null); setError(''); setMessage(''); resetDialogRef.current?.close() }}>Reset All Colors to Default</button>
        </div>
      </dialog>
    </section>
  )
}
