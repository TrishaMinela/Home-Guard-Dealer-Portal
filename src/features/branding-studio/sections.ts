export const STUDIO_SECTIONS = [
  { id: 'logos', label: 'Logos' },
  { id: 'placement', label: 'Logo Display & Placement' },
  { id: 'colors', label: 'Colors' },
  { id: 'typography', label: 'Typography' },
] as const

export type StudioSectionId = (typeof STUDIO_SECTIONS)[number]['id']

const SECTION_IDS = new Set<string>(STUDIO_SECTIONS.map((section) => section.id))

const LEGACY_SECTION: Record<string, StudioSectionId> = {
  branding: 'logos',
  logos: 'logos',
  'door-builder-branding': 'logos',
  'logo-original': 'logos',
  'logo-white': 'logos',
  'logo-black': 'logos',
  'homepage-logo-selection': 'logos',
  'pages-logo-selection': 'placement',
  placement: 'placement',
  colors: 'colors',
  'door-builder-appearance': 'colors',
  design: 'typography',
  typography: 'typography',
  'heading-font-family': 'typography',
}

export function studioSectionFromValue(value: string | null | undefined): StudioSectionId | null {
  if (!value) return null
  const id = value.replace(/^#/, '')
  if (SECTION_IDS.has(id)) return id as StudioSectionId
  return LEGACY_SECTION[id] ?? null
}

export function isLegacyBrandingTarget(value: string | null | undefined) {
  if (!value) return false
  const id = value.replace(/^#/, '')
  return id in LEGACY_SECTION
}

export async function runBrandingSave(tasks: Array<{ id: string; label: string; run: () => Promise<void> }>) {
  const saved: string[] = []
  const failed: Array<{ id: string; label: string; message: string }> = []
  for (const task of tasks) {
    try {
      await task.run()
      saved.push(task.id)
    } catch (error) {
      const record = error && typeof error === 'object' ? error as { message?: unknown; details?: unknown } : null
      const message = error instanceof Error && error.message
        ? error.message
        : typeof record?.message === 'string' && record.message
          ? record.message
          : typeof record?.details === 'string' && record.details
            ? record.details
            : 'Save failed.'
      failed.push({ id: task.id, label: task.label, message })
    }
  }
  return { saved, failed }
}
