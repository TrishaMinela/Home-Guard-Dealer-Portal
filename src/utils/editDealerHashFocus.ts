import { useEffect } from 'react'

export const EDIT_DEALER_FOCUS_IDS = ['company-name', 'dealer-slug', 'primary-color', 'heading-font-family'] as const

export type EditDealerFocusId = (typeof EDIT_DEALER_FOCUS_IDS)[number]

const FOCUS_IDS = new Set<string>(EDIT_DEALER_FOCUS_IDS)

/** Known checklist fields only. Tab names and other fragments are ignored. */
export function editDealerFocusId(hash: string): EditDealerFocusId | null {
  const id = decodeURIComponent(hash.replace(/^#/, '').trim())
  return FOCUS_IDS.has(id) ? id as EditDealerFocusId : null
}

export type EditDealerFocusPlan =
  | { action: 'skip' }
  | { action: 'wait'; id: EditDealerFocusId }
  | { action: 'focus'; id: EditDealerFocusId }

/**
 * Focus a checklist field once per hash. Wait while the form is still mounting.
 * After that hash has been focused, leave the user's typing and tabbing alone.
 */
export function planEditDealerFocus(input: {
  hash: string
  focusedHash: string | null
  elementReady: boolean
}): EditDealerFocusPlan {
  const id = editDealerFocusId(input.hash)
  if (!id) return { action: 'skip' }
  if (input.focusedHash === input.hash) return { action: 'skip' }
  if (!input.elementReady) return { action: 'wait', id }
  return { action: 'focus', id }
}

export type EditDealerFocusElement = {
  classList: { add: (name: string) => void; remove: (name: string) => void; contains: (name: string) => boolean }
  scrollIntoView: (options: ScrollIntoViewOptions) => void
  focus: (options?: FocusOptions) => void
}

/** Scroll with the checklist anchor offset, focus without jumping again, then highlight. */
export function revealEditDealerTarget(target: EditDealerFocusElement, reducedMotion: boolean): void {
  if (!target.classList.contains('dealer-setup-anchor')) target.classList.add('dealer-setup-anchor')
  target.scrollIntoView({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' })
  target.focus({ preventScroll: true })
  target.classList.add('dealer-setup-target')
}

type FocusEnvironment = {
  hash: () => string
  element: (id: string) => EditDealerFocusElement | null
  reducedMotion: () => boolean
  observe: (onChange: () => void) => () => void
  listen: (onHash: () => void) => () => void
  schedule: (delay: number, callback: () => void) => () => void
}

/** Connect hash changes to a mounted field. The caller disconnects the returned function. */
export function connectEditDealerHashFocus(env: FocusEnvironment): () => void {
  let focusedHash: string | null = null
  let stopObserve = () => {}
  let stopHighlight = () => {}
  let stopped = false

  const tick = () => {
    if (stopped) return
    const hash = env.hash()
    const id = editDealerFocusId(hash)
    const plan = planEditDealerFocus({
      hash,
      focusedHash,
      elementReady: Boolean(id && env.element(id)),
    })
    if (plan.action === 'skip') {
      stopObserve()
      stopObserve = () => {}
      return
    }
    if (plan.action === 'wait') return
    const target = env.element(plan.id)
    if (!target) return
    focusedHash = hash
    stopHighlight()
    revealEditDealerTarget(target, env.reducedMotion())
    const cancelTimer = env.reducedMotion()
      ? () => {}
      : env.schedule(1600, () => target.classList.remove('dealer-setup-target'))
    stopHighlight = () => {
      cancelTimer()
      target.classList.remove('dealer-setup-target')
    }
    stopObserve()
    stopObserve = () => {}
  }

  const watch = () => {
    stopObserve()
    stopObserve = env.observe(tick)
    tick()
  }

  const onHash = () => {
    focusedHash = null
    stopHighlight()
    stopHighlight = () => {}
    watch()
  }

  const stopListen = env.listen(onHash)
  watch()

  return () => {
    stopped = true
    stopListen()
    stopObserve()
    stopHighlight()
  }
}

export function useEditDealerHashFocus(ready: boolean) {
  useEffect(() => {
    if (!ready || typeof document === 'undefined') return undefined
    const root = document.getElementById('root') ?? document.body
    return connectEditDealerHashFocus({
      hash: () => window.location.hash,
      element: (id) => document.getElementById(id),
      reducedMotion: () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      observe: (onChange) => {
        const observer = new MutationObserver(onChange)
        observer.observe(root, { childList: true, subtree: true })
        return () => observer.disconnect()
      },
      listen: (onHash) => {
        window.addEventListener('hashchange', onHash)
        return () => window.removeEventListener('hashchange', onHash)
      },
      schedule: (delay, callback) => {
        const timer = window.setTimeout(callback, delay)
        return () => window.clearTimeout(timer)
      },
    })
  }, [ready])
}
