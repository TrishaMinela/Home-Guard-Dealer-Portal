import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { AdminDealer } from '../types/admin'
import type { DoorBuilderAppearance } from '../utils/doorBuilderAppearance'
import { DoorBuilderAppearancePreview } from './DoorBuilderAppearancePreview'
import '../styles/brandingCustomizer.css'

export type BrandingCategory = 'logos' | 'placement' | 'colors' | 'typography'

const CATEGORIES: Array<{ id: BrandingCategory; label: string }> = [
  { id: 'logos', label: 'Logos' },
  { id: 'placement', label: 'Logo Display & Placement' },
  { id: 'colors', label: 'Colors' },
  { id: 'typography', label: 'Typography' },
]

type Props = {
  dealer: AdminDealer
  appearance: DoorBuilderAppearance | null
  unsaved: boolean
  panels: Record<BrandingCategory, ReactNode>
}

export function BrandingAppearanceWorkspace({ dealer, appearance, unsaved, panels }: Props) {
  const titleId = useId()
  const [category, setCategory] = useState<BrandingCategory | null>(null)
  const returnFocus = useRef<HTMLButtonElement | null>(null)
  const drawerRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!category) return
    const drawer = drawerRef.current
    const previouslyFocused = returnFocus.current
    const focusable = () => drawer ? [...drawer.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((element) => !element.hasAttribute('disabled')) : []
    focusable()[0]?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setCategory(null)
        return
      }
      if (event.key !== 'Tab' || !drawer) return
      const items = focusable()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus()
    }
  }, [category])

  return (
    <section id="branding-appearance" className="content-card dealer-management-card branding-customizer" aria-labelledby={titleId}>
      <div className="dealer-form__section-heading">
        <p className="eyebrow">Door Builder</p>
        <h2 id={titleId}>Branding &amp; Appearance</h2>
        <p>One live preview for logos, placement, colors, and typography. Nothing is stored until you save that category.</p>
      </div>
      {unsaved && <p className="portal-alert branding-customizer__status" role="status">You have unsaved branding changes.</p>}
      <div className="branding-customizer__stage">
        <ul className="branding-customizer__menu">
          {CATEGORIES.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={category === item.id ? 'is-selected' : ''}
                aria-expanded={category === item.id}
                aria-controls="branding-customizer-drawer"
                onClick={(event) => {
                  returnFocus.current = event.currentTarget
                  setCategory((current) => current === item.id ? null : item.id)
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
        <div className="branding-customizer__preview">
          <DoorBuilderAppearancePreview dealer={dealer} appearance={appearance} />
          <aside id="branding-customizer-drawer" className="branding-customizer__drawer" ref={drawerRef} role="dialog" aria-modal={category ? true : undefined} aria-labelledby="branding-customizer-drawer-title" hidden={category === null}>
            <div className="branding-customizer__drawer-bar">
              <h2 id="branding-customizer-drawer-title">{CATEGORIES.find((item) => item.id === category)?.label ?? 'Settings'}</h2>
              <button type="button" onClick={() => setCategory(null)}>Close</button>
            </div>
            <div className="branding-customizer__drawer-body">
              {CATEGORIES.map((item) => (
                <div key={item.id} className="branding-customizer__panel" hidden={category !== item.id}>
                  {panels[item.id]}
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </section>
  )
}
