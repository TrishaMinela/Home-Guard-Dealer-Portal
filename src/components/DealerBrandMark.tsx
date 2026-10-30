import { useState } from 'react'

type DealerBrandMarkProps = {
  companyName: string
  initials: string
  logoCandidates: string[]
  context: 'sidebar' | 'mobile'
}

export function DealerBrandMark({
  companyName,
  initials,
  logoCandidates,
  context,
}: DealerBrandMarkProps) {
  const [candidateIndex, setCandidateIndex] = useState(0)
  const logoUrl = logoCandidates[candidateIndex]

  return (
    <div className={`dealer-brand-mark dealer-brand-mark--${context}`}>
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={`${companyName} logo`}
          onError={() => setCandidateIndex((current) => current + 1)}
        />
      ) : (
        <span aria-hidden="true">{initials}</span>
      )}
    </div>
  )
}
