export const UNSAVED_PROFILE_SECTION_MESSAGE =
  'You have unsaved company or color changes. Leave this section without saving?'

export const UNSAVED_PROFILE_LEAVE_MESSAGE =
  'You have unsaved company or color changes. Choose OK to discard them and leave this page. Choose Cancel to keep editing.'

export type UnsavedProfileClick = {
  dirty: boolean
  defaultPrevented: boolean
  button: number
  metaKey: boolean
  altKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  href: string | null
  target: string
  download: boolean
}

export type UnsavedProfileNavigation = 'allow' | 'section' | 'leave'

function isModifiedClick(click: UnsavedProfileClick) {
  return click.button !== 0 || click.metaKey || click.altKey || click.ctrlKey || click.shiftKey
}

function isSkippedHref(href: string) {
  const value = href.trim().toLowerCase()
  return value.startsWith('mailto:') || value.startsWith('tel:') || value.startsWith('javascript:')
}

export function unsavedProfileNavigationKind(click: UnsavedProfileClick, currentHref: string): UnsavedProfileNavigation {
  if (!click.dirty || click.defaultPrevented || isModifiedClick(click)) return 'allow'
  if (!click.href || click.download || isSkippedHref(click.href)) return 'allow'
  const target = click.target.trim().toLowerCase()
  if (target && target !== '_self') return 'allow'

  let next: URL
  let current: URL
  try {
    current = new URL(currentHref)
    next = new URL(click.href, current)
  } catch {
    return 'allow'
  }
  if (next.origin !== current.origin) return 'allow'
  if (next.pathname === current.pathname && next.search === current.search && next.hash === current.hash) return 'allow'
  if (next.pathname === current.pathname && next.search === current.search) return 'section'
  return 'leave'
}

export function unsavedProfileClickFromEvent(event: MouseEvent, dirty: boolean): UnsavedProfileClick {
  const node = event.target
  const element = node instanceof Element ? node : node instanceof Node ? node.parentElement : null
  const anchor = element?.closest('a')
  const link = anchor instanceof HTMLAnchorElement ? anchor : null
  return {
    dirty,
    defaultPrevented: event.defaultPrevented,
    button: event.button,
    metaKey: event.metaKey,
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    shiftKey: event.shiftKey,
    href: link?.getAttribute('href') ?? null,
    target: link?.target ?? '',
    download: Boolean(link?.hasAttribute('download')),
  }
}
