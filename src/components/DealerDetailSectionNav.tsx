import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import {
  dealerDetailStickyOffset,
  isScrollerAtEnd,
  resolveActiveSectionId,
  sectionScrollTop,
  visibleDealerDetailSections,
} from './dealerDetailSections'

type DealerDetailSectionNavProps = {
  canManageDealerCredentials: boolean
  canManageDealerUsers: boolean
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? 'auto' : 'smooth'
}

function visibleMobileHeaderHeight() {
  const header = document.querySelector<HTMLElement>('.mobile-header')
  if (!header || getComputedStyle(header).display === 'none') return 0
  return Math.ceil(header.getBoundingClientRect().height)
}

function findScrollParent(element: HTMLElement) {
  let parent = element.parentElement
  while (parent && parent !== document.body && parent !== document.documentElement) {
    const { overflowY } = getComputedStyle(parent)
    const scrolls = overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay'
    if (scrolls && parent.scrollHeight > parent.clientHeight + 1) return parent
    parent = parent.parentElement
  }
  return null
}

function applyStickyOffset(nav: HTMLElement) {
  const headerHeight = visibleMobileHeaderHeight()
  nav.style.top = `${headerHeight}px`
  const offset = dealerDetailStickyOffset(headerHeight, nav.getBoundingClientRect().height)
  nav.closest<HTMLElement>('.dealer-detail-page')?.style.setProperty('--dealer-section-scroll-offset', `${offset}px`)
  return offset
}

function scrollSectionIntoView(id: string, stickyOffset: number, behavior: ScrollBehavior) {
  const section = document.getElementById(id)
  if (!section) return
  const scroller = findScrollParent(section)
  if (!scroller) {
    window.scrollTo({ top: sectionScrollTop(section.getBoundingClientRect().top, window.scrollY, stickyOffset), behavior })
    return
  }
  const portTop = scroller.getBoundingClientRect().top
  scroller.scrollTo({
    top: sectionScrollTop(section.getBoundingClientRect().top - portTop, scroller.scrollTop, stickyOffset),
    behavior,
  })
}

function revealActiveLink(nav: HTMLElement, id: string, behavior: ScrollBehavior) {
  const link = nav.querySelector<HTMLElement>(`a[href="#${CSS.escape(id)}"]`)
  if (!link) return
  const navRect = nav.getBoundingClientRect()
  const linkRect = link.getBoundingClientRect()
  const inset = 8
  if (linkRect.left < navRect.left + inset) {
    nav.scrollTo({ left: nav.scrollLeft - (navRect.left + inset - linkRect.left), behavior })
  } else if (linkRect.right > navRect.right - inset) {
    nav.scrollTo({ left: nav.scrollLeft + (linkRect.right - (navRect.right - inset)), behavior })
  }
}

function readScrollState(section: HTMLElement | null) {
  const scroller = section ? findScrollParent(section) : null
  if (!scroller) {
    const scrollTop = window.scrollY
    return {
      scrollTop,
      atPageEnd: isScrollerAtEnd(scrollTop, window.innerHeight, document.documentElement.scrollHeight),
      portTop: 0,
    }
  }
  return {
    scrollTop: scroller.scrollTop,
    atPageEnd: isScrollerAtEnd(scroller.scrollTop, scroller.clientHeight, scroller.scrollHeight),
    portTop: scroller.getBoundingClientRect().top,
  }
}

export function DealerDetailSectionNav({
  canManageDealerCredentials,
  canManageDealerUsers,
}: DealerDetailSectionNavProps) {
  const sections = useMemo(
    () => visibleDealerDetailSections({ canManageDealerCredentials, canManageDealerUsers }),
    [canManageDealerCredentials, canManageDealerUsers],
  )
  const sectionKey = sections.map((section) => section.id).join('|')
  const navRef = useRef<HTMLElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const lockRef = useRef<string | null>(null)
  const lockTimerRef = useRef(0)
  const offsetRef = useRef(0)
  const scheduleRef = useRef<() => void>(() => {})
  const [activeId, setActiveId] = useState(() => {
    const hash = window.location.hash.replace(/^#/, '')
    return sections.some((section) => section.id === hash) ? hash : (sections[0]?.id ?? '')
  })
  const [isStuck, setIsStuck] = useState(false)

  function rememberActive(id: string) {
    setActiveId((current) => (current === id ? current : id))
  }

  function lockSection(id: string) {
    lockRef.current = id
    window.clearTimeout(lockTimerRef.current)
    lockTimerRef.current = window.setTimeout(() => {
      if (lockRef.current !== id) return
      lockRef.current = null
      scheduleRef.current()
    }, 1500)
  }

  useLayoutEffect(() => {
    const nav = navRef.current
    if (!nav) return
    offsetRef.current = applyStickyOffset(nav)
    const hash = window.location.hash.replace(/^#/, '')
    if (!sectionKey.split('|').includes(hash)) return
    lockRef.current = hash
    scrollSectionIntoView(hash, offsetRef.current, 'auto')
  }, [sectionKey])

  useEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const ids = sectionKey ? sectionKey.split('|') : []
    let frame = 0
    let sectionObserver: IntersectionObserver | null = null
    let sentinelObserver: IntersectionObserver | null = null
    let scroller: HTMLElement | null = null

    const updateActive = () => {
      const offset = offsetRef.current
      const first = document.getElementById(ids[0] ?? '')
      const scrollState = readScrollState(first)
      if (lockRef.current) {
        const locked = document.getElementById(lockRef.current)
        const lockedTop = locked ? locked.getBoundingClientRect().top - scrollState.portTop : offset
        if (Math.abs(lockedTop - offset) > 6 && !scrollState.atPageEnd) {
          rememberActive(lockRef.current)
          return
        }
        lockRef.current = null
      }
      const positions = ids.flatMap((id) => {
        const element = document.getElementById(id)
        if (!element) return []
        return [{ id, top: element.getBoundingClientRect().top - scrollState.portTop }]
      })
      const next = resolveActiveSectionId(positions, offset, scrollState)
      if (next) rememberActive(next)
    }

    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(updateActive)
    }
    scheduleRef.current = schedule

    const onScrollEnd = () => {
      lockRef.current = null
      schedule()
    }

    const bind = () => {
      offsetRef.current = applyStickyOffset(nav)
      sectionObserver?.disconnect()
      sentinelObserver?.disconnect()
      const headerHeight = visibleMobileHeaderHeight()
      sentinelObserver = new IntersectionObserver(([entry]) => {
        setIsStuck((current) => {
          const next = !entry.isIntersecting
          return current === next ? current : next
        })
      }, { root: null, rootMargin: `-${headerHeight + 1}px 0px 0px 0px`, threshold: 0 })
      if (sentinelRef.current) sentinelObserver.observe(sentinelRef.current)

      const first = document.getElementById(ids[0] ?? '')
      const nextScroller = first ? findScrollParent(first) : null
      if (nextScroller !== scroller) {
        scroller?.removeEventListener('scroll', schedule)
        scroller?.removeEventListener('scrollend', onScrollEnd)
        scroller = nextScroller
        scroller?.addEventListener('scroll', schedule, { passive: true })
        scroller?.addEventListener('scrollend', onScrollEnd)
      }
      sectionObserver = new IntersectionObserver(schedule, {
        root: scroller,
        threshold: [0, 0.2, 0.4, 0.6, 0.8, 1],
      })
      for (const id of ids) {
        const element = document.getElementById(id)
        if (element) sectionObserver.observe(element)
      }
      schedule()
    }

    const onPopState = () => {
      const hash = window.location.hash.replace(/^#/, '')
      if (!ids.includes(hash)) return
      lockSection(hash)
      rememberActive(hash)
      scrollSectionIntoView(hash, applyStickyOffset(nav), scrollBehavior())
    }

    bind()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('scrollend', onScrollEnd)
    window.addEventListener('resize', bind)
    window.addEventListener('popstate', onPopState)

    return () => {
      window.clearTimeout(lockTimerRef.current)
      cancelAnimationFrame(frame)
      sectionObserver?.disconnect()
      sentinelObserver?.disconnect()
      scroller?.removeEventListener('scroll', schedule)
      scroller?.removeEventListener('scrollend', onScrollEnd)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('scrollend', onScrollEnd)
      window.removeEventListener('resize', bind)
      window.removeEventListener('popstate', onPopState)
    }
  }, [sectionKey])

  useEffect(() => {
    const nav = navRef.current
    if (!nav || !activeId) return
    revealActiveLink(nav, activeId, scrollBehavior())
  }, [activeId])

  function selectSection(event: MouseEvent<HTMLAnchorElement>, id: string) {
    event.preventDefault()
    const nav = navRef.current
    if (!nav) return
    lockSection(id)
    rememberActive(id)
    const offset = applyStickyOffset(nav)
    offsetRef.current = offset
    scrollSectionIntoView(id, offset, scrollBehavior())
    if (window.location.hash !== `#${id}`) {
      window.history.pushState(null, '', `#${id}`)
    }
  }

  return (
    <>
      <div className="dealer-detail-nav-sentinel" ref={sentinelRef} aria-hidden="true" />
      <nav
        ref={navRef}
        className={`dealer-detail-nav${isStuck ? ' is-stuck' : ''}`}
        aria-label="Dealer management sections"
      >
        {sections.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            aria-current={activeId === section.id ? 'true' : undefined}
            onClick={(event) => selectSection(event, section.id)}
          >
            {section.label}
          </a>
        ))}
      </nav>
    </>
  )
}
