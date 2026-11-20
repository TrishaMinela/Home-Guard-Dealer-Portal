import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { AdminDealer } from '../types/admin'
import { AppearanceColorControl } from './AppearanceColorControl'
import { DoorBuilderAppearancePreview } from './DoorBuilderAppearancePreview'
import {
  APPEARANCE_FIELDS,
  APPEARANCE_GROUP_LABELS,
  appearanceContrastWarnings,
  appearanceEquals,
  appearanceForStorage,
  appearanceFromStorage,
  missingAppearanceColumn,
  resolvedBrandColors,
  type AppearanceGroupId,
  type AppearanceToken,
  type AppearanceValue,
  type DoorBuilderAppearance,
} from '../utils/doorBuilderAppearance'
import '../styles/appearanceControls.css'

type Props = {
  dealer: AdminDealer
  mode: 'admin' | 'dealer'
  loadFromServer?: boolean
  initialAppearance?: DoorBuilderAppearance | null
  onSave: (value: DoorBuilderAppearance | null) => Promise<void>
}

const GROUP_NOTES: Record<AppearanceGroupId, string> = {
  header: 'Includes a fully white header. Home and the website button use the header button colors.',
  body: 'Independent of the header and the footer.',
  cards: 'Images, layout, and selection stay as they are. Colors change the card chrome only.',
  preview: 'The door rendering and product photos keep their own colors.',
  buttons: 'Next uses primary. Previous and Restart Build use secondary. Disabled buttons stay faded.',
  footer: 'Home Guard attribution, feedback, and links stay in place.',
}

const GROUPS = [...new Set(APPEARANCE_FIELDS.map((field) => field.group))]

export function DoorBuilderAppearanceSettings({
  dealer,
  mode,
  loadFromServer = true,
  initialAppearance = null,
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
  const brand = resolvedBrandColors({ primaryColor: dealer.primary_color, secondaryColor: dealer.secondary_color })
  const ready = !loadFromServer || loadedFor === dealer.id
  const shownDraft = ready ? draft : null
  const dirty = ready && !appearanceEquals(draft, saved)
  const warnings = useMemo(
    () => appearanceContrastWarnings(draft, { primaryColor: dealer.primary_color, secondaryColor: dealer.secondary_color }),
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
    if (!dirty) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

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
    const parsed = appearanceForStorage(draft)
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
      <div className="dealer-form__section-heading">
        <p className="eyebrow">Door Builder</p>
        <h2 id="door-builder-appearance-heading">Door Builder Appearance</h2>
        <p className="appearance-settings__intro">
          Primary and secondary stay the brand colors. Each choice can inherit the current styling, follow a brand color, or use its own HEX value. Nothing is stored until you save appearance.
          {mode === 'dealer' ? ' This saves only your Door Builder appearance.' : ' This saves only this dealer’s Door Builder appearance.'}
        </p>
      </div>
      {migrationNeeded && <div className="portal-alert" role="status">Appearance choices can be previewed now. They can be saved after the Door Builder appearance migration is applied.</div>}
      {dirty && <div className="portal-alert" role="status">Appearance has unsaved changes.</div>}
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
              <legend>{APPEARANCE_GROUP_LABELS[group]}</legend>
              <p>{GROUP_NOTES[group]}</p>
              <div className="appearance-group__fields">
                {APPEARANCE_FIELDS.filter((field) => field.group === group).map((field) => (
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
                ))}
              </div>
            </fieldset>
          ))}
        </div>
        <DoorBuilderAppearancePreview dealer={dealer} appearance={shownDraft} />
      </div>
      <div className="dealer-form__actions appearance-toolbar">
        <button className="button button--outline" type="button" disabled={!dirty || saving} onClick={() => { setDraft(saved); setOpenKey(null); setError(''); setMessage('') }}>Cancel Changes</button>
        <button className="button button--outline" type="button" disabled={saving || appearanceEquals(draft, null)} onClick={() => { setDraft(null); setOpenKey(null); setError(''); setMessage('') }}>Reset to Default</button>
        <button className="button button--primary" type="button" disabled={!dirty || saving || !ready} onClick={() => void save()}>{saving ? 'Saving...' : 'Save Appearance'}</button>
      </div>
    </section>
  )
}
