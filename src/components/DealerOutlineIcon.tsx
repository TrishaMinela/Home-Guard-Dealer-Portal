import type { ReactNode } from 'react'

type DealerOutlineIconProps = {
  name: string
}

export function DealerOutlineIcon({ name }: DealerOutlineIconProps) {
  const paths: Record<string, ReactNode> = {
    clipboard: (
      <>
        <rect x="7" y="3.5" width="10" height="4" rx="1" />
        <path d="M8 5.5H6.5A2 2 0 0 0 4.5 7.5v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-11a2 2 0 0 0-2-2H16" />
        <path d="m9 13 2 2 4-4" />
      </>
    ),
    building: (
      <>
        <path d="M4 20.5h16" />
        <path d="M6 20.5V6.5l6-2.5 6 2.5v14" />
        <path d="M10 9.5h.01M10 13h.01M10 16.5h.01M14 13h.01M14 16.5h.01" />
      </>
    ),
    palette: (
      <>
        <path d="M12 4a8 8 0 1 0 0 16h1.2a2.2 2.2 0 0 0 0-4.4H12a1.6 1.6 0 0 1-1.6-1.6A8 8 0 0 0 12 4Z" />
        <circle cx="8" cy="9.5" r="0.8" fill="currentColor" stroke="none" />
        <circle cx="10.2" cy="7" r="0.8" fill="currentColor" stroke="none" />
        <circle cx="13.4" cy="7.2" r="0.8" fill="currentColor" stroke="none" />
      </>
    ),
    webhook: (
      <>
        <path d="M10 13a5 5 0 0 0 7.54.54l1.92-1.92a5 5 0 0 0-7.07-7.07l-1.1 1.1" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-1.92 1.92a5 5 0 0 0 7.07 7.07l1.1-1.1" />
      </>
    ),
    megaphone: (
      <>
        <path d="m4 10 15-4v12L4 14v-4Z" />
        <path d="M11.2 15.2 12.4 20H8l-1.2-5" />
      </>
    ),
    crm: (
      <>
        <path d="M8 8V5M16 8V5" />
        <path d="M7 8h10v3a5 5 0 0 1-10 0V8Z" />
        <path d="M12 16v3" />
      </>
    ),
    image: (
      <>
        <rect x="3.5" y="5" width="17" height="14" rx="2" />
        <circle cx="8.5" cy="10" r="1.4" />
        <path d="m20.5 15.5-4.5-4.5L7 19" />
      </>
    ),
    users: (
      <>
        <path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20" />
        <circle cx="9" cy="8" r="3" />
        <path d="M20 20v-1.5a3.5 3.5 0 0 0-2.6-3.4M16 5.2a3 3 0 0 1 0 5.6" />
      </>
    ),
    pencil: (
      <path d="M12 20h8M16.2 3.8a2 2 0 0 1 2.8 2.8L8 17.6 4 19l1.4-4.2Z" />
    ),
    external: (
      <>
        <path d="M14 5h5v5" />
        <path d="M19 5 10 14" />
        <path d="M16 13.5V18a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1h4.5" />
      </>
    ),
    check: <path d="m5 12 5 5L20 7" />,
    chevron: <path d="m6 9 6 6 6-6" />,
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {paths[name] ?? paths.clipboard}
    </svg>
  )
}

export function DealerCardIcon({ name }: { name: string }) {
  return (
    <span className="dd-icon" aria-hidden="true">
      <DealerOutlineIcon name={name} />
    </span>
  )
}
