import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
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

const HASH_CATEGORY: Record<string, BrandingCategory> = {
  branding: 'logos',
  'door-builder-branding': 'logos',
  'logo-original': 'logos',
  'homepage-logo-selection': 'logos',
  'pages-logo-selection': 'logos',
  'door-builder-appearance': 'colors',
  design: 'typography',
  'heading-font-family': 'typography',
}

function categoryForHash(hash: string) {
  return HASH_CATEGORY[hash.replace(/^#/, '')] ?? null
}

function scrollParent(element: HTMLElement) {
  let node = element.parentElement
  while (node && node !== document.body && node !== document.documentElement) {
    const overflow = getComputedStyle(node).overflowY
    if (overflow === 'auto' || overflow === 'scroll') return node
    node = node.parentElement
  }
  return null
}

function layoutForWidth(width: number) {
  if (width < 560) return 'sheet'
  if (width < 860) return 'compact'
  return 'wide'
}

type Props = {
  dealer: AdminDealer
  appearance: DoorBuilderAppearance | null
  unsaved: boolean
  panels: Record<BrandingCategory, ReactNode>
}

export function BrandingAppearanceWorkspace({ dealer, appearance, unsaved, panels }: Props) {
  const titleId = useId()
  const [category, setCategory] = useState<BrandingCategory | null>(null)
  const [layout, setLayout] = useState<'wide' | 'compact' | 'sheet'>('wide')
  const returnFocus = useRef<HTMLButtonElement | null>(null)
  const drawerRef = useRef<HTMLElement>(null)
  const rootRef = useRef<HTMLElement>(null)
  const slotRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const openFromHash = () => {
      const next = categoryForHash(window.location.hash)
      if (!next) return
      setCategory(next)
      document.getElementById('branding-appearance')?.scrollIntoView({ block: 'start' })
    }
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.('a[href^="#"]')
      if (!(link instanceof HTMLAnchorElement)) return
      const next = categoryForHash(link.getAttribute('href') || '')
      if (!next) return
      event.preventDefault()
      const href = link.getAttribute('href') || ''
      if (window.location.hash !== href) history.pushState(null, '', href)
      setCategory(next)
      document.getElementById('branding-appearance')?.scrollIntoView({ block: 'start' })
    }
    openFromHash()
    window.addEventListener('hashchange', openFromHash)
    document.addEventListener('click', onClick)
    return () => {
      window.removeEventListener('hashchange', openFromHash)
      document.removeEventListener('click', onClick)
    }
  }, [])

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    const place = () => {
      const next = layoutForWidth(root.clientWidth)
      if (next !== layout) {
        setLayout(next)
        return
      }
      if (!category || layout === 'sheet' || !slotRef.current) return
      const scroller = scrollParent(root)
      const view = scroller?.getBoundingClientRect()
      const viewTop = view ? Math.max(view.top, 0) : 0
      const viewBottom = view ? Math.min(view.bottom, window.innerHeight) : window.innerHeight
      const top = viewTop + 12
      const box = slotRef.current.getBoundingClientRect()
      root.style.setProperty('--branding-drawer-top', `${top}px`)
      root.style.setProperty('--branding-drawer-span', `${Math.max(240, viewBottom - top - 12)}px`)
      if (box.width > 0) {
        root.style.setProperty('--branding-drawer-left', `${Math.max(0, box.left)}px`)
        root.style.setProperty('--branding-drawer-width', `${box.width}px`)
      }
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(root)
    const scroller = scrollParent(root)
    scroller?.addEventListener('scroll', place, { passive: true })
    window.addEventListener('scroll', place, { passive: true })
    window.addEventListener('resize', place)
    return () => {
      observer.disconnect()
      scroller?.removeEventListener('scroll', place)
      window.removeEventListener('scroll', place)
      window.removeEventListener('resize', place)
    }
  }, [category, layout])

  useEffect(() => {
    if (!category || layout !== 'sheet') return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [category, layout])

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
    <section id="branding-appearance" className={`content-card dealer-management-card branding-customizer${layout === 'sheet' ? ' is-sheet' : ''}`} data-layout={layout} aria-labelledby={titleId} ref={rootRef}>
      <div className="dealer-form__section-heading">
        <p className="eyebrow">Door Builder</p>
        <h2 id={titleId}>Branding &amp; Appearance</h2>
        <p>One live preview for logos, placement, colors, and typography. Nothing is stored until you save that category.</p>
      </div>
      {unsaved && <p className="portal-alert branding-customizer__status" role="status">You have unsaved branding changes.</p>}
      <div className={`branding-customizer__stage ${category ? 'is-open' : ''} ${layout === 'sheet' ? 'is-sheet' : ''}`}>
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
        </div>
        <div className="branding-customizer__drawer-slot" ref={slotRef} hidden={category === null}>
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
