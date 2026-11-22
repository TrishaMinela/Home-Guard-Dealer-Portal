/** Door Builder appearance. Null and omitted keys inherit today's styling.
 * 'primary' and 'secondary' follow the brand colors. HEX is a fixed custom color.
 * The same module is copied into the Door Builder so both sides resolve colors the same way.
 *
 * The editor writes six keys: headerBackground, headerText, bodyBackground, bodyText,
 * footerBackground, footerText. Text is #000000 or #ffffff. Those six expand to the
 * header (including icons and header buttons), both main panels, and the footer.
 * Any other stored key, or a text value that is not black or white, keeps the previous
 * per-key mapping so an older JSON document does not change until it is saved again.
 * No database migration is required. The existing CHECK accepts these keys and values.
 */

export const LEGACY_APPEARANCE_NOTICE = 'This dealer has older advanced color settings; saving will replace them with the simplified settings.'

export const DOOR_BUILDER_PRIMARY_FALLBACK = '#0d666c'
export const DOOR_BUILDER_SECONDARY_FALLBACK = '#05040b'
export const APPEARANCE_WHITE = '#ffffff'
export const APPEARANCE_BLACK = '#000000'

export const APPEARANCE_FIELDS = [
  { group: 'header', key: 'headerBackground', cssVar: '--db-header-background', label: 'Background' },
  { group: 'header', key: 'headerText', cssVar: '--db-header-text', label: 'Text' },
  { group: 'header', key: 'headerIcon', cssVar: '--db-header-icon', label: 'Icon' },
  { group: 'header', key: 'headerButtonBackground', cssVar: '--db-header-button-background', label: 'Button background' },
  { group: 'header', key: 'headerButtonText', cssVar: '--db-header-button-text', label: 'Button text' },
  { group: 'header', key: 'headerButtonBorder', cssVar: '--db-header-button-border', label: 'Button border' },
  { group: 'header', key: 'headerAccent', cssVar: '--db-header-accent', label: 'Bottom border' },
  { group: 'body', key: 'bodyBackground', cssVar: '--db-body-background', label: 'Background' },
  { group: 'body', key: 'headingText', cssVar: '--db-heading-text', label: 'Headings' },
  { group: 'body', key: 'bodyText', cssVar: '--db-body-text', label: 'Body text' },
  { group: 'body', key: 'sectionDivider', cssVar: '--db-section-divider', label: 'Section divider' },
  { group: 'body', key: 'stepNavBackground', cssVar: '--db-step-background', label: 'Step nav background' },
  { group: 'body', key: 'stepNavText', cssVar: '--db-step-text', label: 'Step nav text' },
  { group: 'body', key: 'activeStep', cssVar: '--db-step-active', label: 'Active step indicator' },
  { group: 'cards', key: 'cardBackground', cssVar: '--db-card-background', label: 'Background' },
  { group: 'cards', key: 'cardTitle', cssVar: '--db-card-title', label: 'Title' },
  { group: 'cards', key: 'cardDescription', cssVar: '--db-card-description', label: 'Description' },
  { group: 'cards', key: 'cardBorder', cssVar: '--db-card-border', label: 'Border' },
  { group: 'cards', key: 'cardSelectedBorder', cssVar: '--db-card-selected', label: 'Selected border' },
  { group: 'cards', key: 'cardHoverAccent', cssVar: '--db-card-hover', label: 'Hover accent' },
  { group: 'preview', key: 'previewBackground', cssVar: '--db-preview-background', label: 'Panel background' },
  { group: 'preview', key: 'previewText', cssVar: '--db-preview-text', label: 'Info text' },
  { group: 'preview', key: 'previewLabel', cssVar: '--db-preview-label', label: 'Labels' },
  { group: 'preview', key: 'previewDivider', cssVar: '--db-preview-divider', label: 'Divider' },
  { group: 'preview', key: 'previewControlsBackground', cssVar: '--db-preview-controls-background', label: 'Controls background' },
  { group: 'preview', key: 'previewControlsText', cssVar: '--db-preview-controls-text', label: 'Controls text' },
  { group: 'buttons', key: 'primaryButtonBackground', cssVar: '--db-primary-button-background', label: 'Primary background' },
  { group: 'buttons', key: 'primaryButtonText', cssVar: '--db-primary-button-text', label: 'Primary text' },
  { group: 'buttons', key: 'primaryButtonBorder', cssVar: '--db-primary-button-border', label: 'Primary border' },
  { group: 'buttons', key: 'primaryButtonHover', cssVar: '--db-primary-button-hover', label: 'Primary hover background' },
  { group: 'buttons', key: 'secondaryButtonBackground', cssVar: '--db-secondary-button-background', label: 'Secondary background' },
  { group: 'buttons', key: 'secondaryButtonText', cssVar: '--db-secondary-button-text', label: 'Secondary text' },
  { group: 'buttons', key: 'secondaryButtonBorder', cssVar: '--db-secondary-button-border', label: 'Secondary border' },
  { group: 'buttons', key: 'secondaryButtonHover', cssVar: '--db-secondary-button-hover', label: 'Secondary hover background' },
  { group: 'footer', key: 'footerBackground', cssVar: '--db-footer-background', label: 'Background' },
  { group: 'footer', key: 'footerText', cssVar: '--db-footer-text', label: 'Text' },
  { group: 'footer', key: 'footerLink', cssVar: '--db-footer-link', label: 'Link' },
  { group: 'footer', key: 'footerIcon', cssVar: '--db-footer-icon', label: 'Icon' },
  { group: 'footer', key: 'footerAccent', cssVar: '--db-footer-accent', label: 'Border' },
] as const

export type AppearanceGroupId = (typeof APPEARANCE_FIELDS)[number]['group']
export type AppearanceToken = (typeof APPEARANCE_FIELDS)[number]['key']
export type AppearanceReference = 'primary' | 'secondary'
export type AppearanceValue = AppearanceReference | string
export type DoorBuilderAppearance = Partial<Record<AppearanceToken, AppearanceValue>>

export const APPEARANCE_GROUP_LABELS: Record<AppearanceGroupId, string> = {
  header: 'Header',
  body: 'Main body',
  cards: 'Door selection cards',
  preview: 'Door preview panel',
  buttons: 'Buttons',
  footer: 'Footer',
}

/** The six settings the editor shows. Keys stay inside the existing CHECK allow-list. */
export const SIMPLIFIED_APPEARANCE_FIELDS = [
  { group: 'header', key: 'headerBackground', role: 'background', cssVar: '--db-header-background', label: 'Background' },
  { group: 'header', key: 'headerText', role: 'text', cssVar: '--db-header-text', label: 'Text' },
  { group: 'main', key: 'bodyBackground', role: 'background', cssVar: '--db-body-background', label: 'Background' },
  { group: 'main', key: 'bodyText', role: 'text', cssVar: '--db-body-text', label: 'Text' },
  { group: 'footer', key: 'footerBackground', role: 'background', cssVar: '--db-footer-background', label: 'Background' },
  { group: 'footer', key: 'footerText', role: 'text', cssVar: '--db-footer-text', label: 'Text' },
] as const

export type SimplifiedAppearanceGroup = (typeof SIMPLIFIED_APPEARANCE_FIELDS)[number]['group']
export type SimplifiedAppearanceKey = (typeof SIMPLIFIED_APPEARANCE_FIELDS)[number]['key']

export const SIMPLIFIED_GROUP_LABELS: Record<SimplifiedAppearanceGroup, string> = {
  header: 'Header',
  main: 'Main section',
  footer: 'Footer',
}

const SIMPLIFIED_KEYS = new Set<string>(SIMPLIFIED_APPEARANCE_FIELDS.map((field) => field.key))
const SIMPLIFIED_TEXT_KEYS = new Set<string>(SIMPLIFIED_APPEARANCE_FIELDS.filter((field) => field.role === 'text').map((field) => field.key))

const FIELD_KEYS = new Set<string>(APPEARANCE_FIELDS.map((field) => field.key))
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

export type BrandColorSource = {
  primaryColor?: string | null
  secondaryColor?: string | null
}

export function normalizeHexColor(value: string | null | undefined, fallback: string) {
  const candidate = value?.trim() ?? ''
  if (!HEX_COLOR.test(candidate)) return fallback
  if (candidate.length === 4) {
    const [red, green, blue] = candidate.slice(1).split('')
    return `#${red}${red}${green}${green}${blue}${blue}`.toLowerCase()
  }
  return candidate.toLowerCase()
}

export function resolvedBrandColors(source: BrandColorSource) {
  return {
    primary: normalizeHexColor(source.primaryColor, DOOR_BUILDER_PRIMARY_FALLBACK),
    secondary: normalizeHexColor(source.secondaryColor, DOOR_BUILDER_SECONDARY_FALLBACK),
  }
}

export function normalizeAppearanceValue(value: string): AppearanceValue | null {
  const trimmed = value.trim()
  if (/^primary$/i.test(trimmed)) return 'primary'
  if (/^secondary$/i.test(trimmed)) return 'secondary'
  if (!HEX_COLOR.test(trimmed)) return null
  return normalizeHexColor(trimmed, trimmed)
}

export function orderedAppearance(config: DoorBuilderAppearance | null | undefined): DoorBuilderAppearance | null {
  if (!config) return null
  const next: DoorBuilderAppearance = {}
  for (const field of APPEARANCE_FIELDS) {
    const value = config[field.key]
    if (!value) continue
    next[field.key] = value
  }
  return Object.keys(next).length > 0 ? next : null
}

export function appearanceForStorage(input: unknown): { ok: true; value: DoorBuilderAppearance | null } | { ok: false; error: string } {
  if (input == null) return { ok: true, value: null }
  if (typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'Door Builder appearance must be a set of color choices.' }
  }
  const source = input as Record<string, unknown>
  const next: DoorBuilderAppearance = {}
  for (const key of Object.keys(source)) {
    if (!FIELD_KEYS.has(key)) return { ok: false, error: 'Door Builder appearance has an unsupported setting.' }
    const raw = source[key]
    if (raw == null || raw === '') continue
    if (typeof raw !== 'string') return { ok: false, error: 'Door Builder appearance colors must be a HEX value or a brand color.' }
    const normalized = normalizeAppearanceValue(raw)
    if (!normalized) return { ok: false, error: 'Door Builder appearance colors must be a HEX value or a brand color.' }
    next[key as AppearanceToken] = normalized
  }
  return { ok: true, value: orderedAppearance(next) }
}

/** Public and reloaded configs keep valid colors and drop anything else. */
export function appearanceFromStorage(input: unknown): DoorBuilderAppearance | null {
  const strict = appearanceForStorage(input)
  if (strict.ok) return strict.value
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const source = input as Record<string, unknown>
  const next: DoorBuilderAppearance = {}
  for (const field of APPEARANCE_FIELDS) {
    const raw = source[field.key]
    if (typeof raw !== 'string') continue
    const normalized = normalizeAppearanceValue(raw)
    if (normalized) next[field.key] = normalized
  }
  return orderedAppearance(next)
}

export function appearanceEquals(left: DoorBuilderAppearance | null | undefined, right: DoorBuilderAppearance | null | undefined) {
  return JSON.stringify(orderedAppearance(left)) === JSON.stringify(orderedAppearance(right))
}

export function appearanceUpdate(value: DoorBuilderAppearance | null) {
  return { door_builder_appearance: value }
}

export function appearanceRpcArgs(dealerId: string, value: DoorBuilderAppearance | null) {
  return { p_dealer_id: dealerId, p_appearance: value }
}

export function resolveAppearanceValue(value: AppearanceValue | null | undefined, brand: { primary: string; secondary: string }) {
  if (value === 'primary') return brand.primary
  if (value === 'secondary') return brand.secondary
  if (typeof value === 'string' && HEX_COLOR.test(value)) return normalizeHexColor(value, value)
  return null
}

export function isSimplifiedTextColor(value: AppearanceValue | null | undefined) {
  return value === APPEARANCE_BLACK || value === APPEARANCE_WHITE
}

/** Older JSON keeps one variable per key. Simplified JSON expands the six settings. */
export function appearanceUsesLegacyMapping(config: DoorBuilderAppearance | null | undefined) {
  if (!config) return false
  for (const [key, value] of Object.entries(config)) {
    if (!value) continue
    if (!SIMPLIFIED_KEYS.has(key)) return true
    if (SIMPLIFIED_TEXT_KEYS.has(key) && !isSimplifiedTextColor(value)) return true
  }
  return false
}

/** Present only for a six-key document. Older JSON omits it so the original CSS applies. */
export function appearanceMode(config: DoorBuilderAppearance | null | undefined): 'simple' | undefined {
  if (!config || appearanceUsesLegacyMapping(config)) return undefined
  const hasSetting = SIMPLIFIED_APPEARANCE_FIELDS.some((field) => config[field.key])
  return hasSetting ? 'simple' : undefined
}

/** Save payload: only the six editor settings. Non black/white text and every other key are dropped. */
export function appearanceEditorPayload(config: DoorBuilderAppearance | null | undefined): DoorBuilderAppearance | null {
  if (!config) return null
  const next: DoorBuilderAppearance = {}
  for (const field of SIMPLIFIED_APPEARANCE_FIELDS) {
    const value = config[field.key]
    if (!value) continue
    const normalized = normalizeAppearanceValue(value)
    if (!normalized) continue
    if (field.role === 'text' && !isSimplifiedTextColor(normalized)) continue
    next[field.key] = normalized
  }
  return orderedAppearance(next)
}

function explicitAppearanceCssVars(config: DoorBuilderAppearance, brand: { primary: string; secondary: string }) {
  const style: Record<string, string> = {}
  for (const field of APPEARANCE_FIELDS) {
    const resolved = resolveAppearanceValue(config[field.key], brand)
    if (resolved) style[field.cssVar] = resolved
  }
  return style
}

/** Header, both main panels, and footer. Icons, header buttons, links, and step text are derived. */
export function simplifiedAppearanceCssVars(config: DoorBuilderAppearance | null | undefined, brand: { primary: string; secondary: string }) {
  const style: Record<string, string> = {}
  if (!config) return style
  const headerBackground = resolveAppearanceValue(config.headerBackground, brand)
  const headerText = resolveAppearanceValue(config.headerText, brand)
  const bodyBackground = resolveAppearanceValue(config.bodyBackground, brand)
  const bodyText = resolveAppearanceValue(config.bodyText, brand)
  const footerBackground = resolveAppearanceValue(config.footerBackground, brand)
  const footerText = resolveAppearanceValue(config.footerText, brand)
  if (headerBackground) style['--db-header-background'] = headerBackground
  if (headerText) {
    style['--db-header-text'] = headerText
    style['--db-header-icon'] = headerText
    style['--db-header-button-text'] = headerText
    style['--db-header-button-border'] = headerText
    style['--db-header-button-background'] = 'transparent'
  }
  if (bodyBackground) {
    style['--db-body-background'] = bodyBackground
    style['--db-preview-background'] = bodyBackground
    style['--db-step-background'] = bodyBackground
  }
  if (bodyText) {
    style['--db-body-text'] = bodyText
    style['--db-heading-text'] = bodyText
    style['--db-step-text'] = bodyText
    style['--db-preview-text'] = bodyText
    style['--db-preview-label'] = bodyText
  }
  if (footerBackground) style['--db-footer-background'] = footerBackground
  if (footerText) {
    style['--db-footer-text'] = footerText
    style['--db-footer-link'] = footerText
    style['--db-footer-icon'] = footerText
  }
  return style
}

export function appearanceCssVars(config: DoorBuilderAppearance | null | undefined, brand: { primary: string; secondary: string }) {
  if (!config) return {}
  if (appearanceUsesLegacyMapping(config)) return explicitAppearanceCssVars(config, brand)
  return simplifiedAppearanceCssVars(config, brand)
}

function channelLuminance(hex: string, start: number) {
  const srgb = Number.parseInt(hex.slice(start, start + 2), 16) / 255
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
}

export function relativeLuminance(hex: string) {
  const color = normalizeHexColor(hex, '#000000')
  return 0.2126 * channelLuminance(color, 1) + 0.7152 * channelLuminance(color, 3) + 0.0722 * channelLuminance(color, 5)
}

export function contrastRatio(first: string, second: string) {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second))
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second))
  return (lighter + 0.05) / (darker + 0.05)
}

export function isLightHex(hex: string) {
  const color = normalizeHexColor(hex, '#000000')
  const luminance = relativeLuminance(color)
  return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05)
}

export function inkFor(hex: string) {
  return isLightHex(hex) ? '#101417' : '#ffffff'
}

type ContrastPair = {
  id: string
  background: AppearanceToken
  foreground: AppearanceToken | null
  fallbackForeground?: string
  minimum: number
  label: string
}

const CONTRAST_PAIRS: ContrastPair[] = [
  { id: 'header', background: 'headerBackground', foreground: 'headerText', minimum: 4.5, label: 'Header text on the header background' },
  { id: 'main', background: 'bodyBackground', foreground: 'bodyText', minimum: 4.5, label: 'Main text on the main background' },
  { id: 'footer', background: 'footerBackground', foreground: 'footerText', minimum: 4.5, label: 'Footer text on the footer background' },
]

function establishedColors(brand: { primary: string; secondary: string }): Record<AppearanceToken, string> {
  const headerText = inkFor(brand.secondary)
  const primaryText = inkFor(brand.primary)
  return {
    headerBackground: brand.secondary,
    headerText,
    headerIcon: headerText,
    headerButtonBackground: 'transparent',
    headerButtonText: headerText,
    headerButtonBorder: headerText,
    headerAccent: brand.primary,
    bodyBackground: '#f7faff',
    headingText: '#05040b',
    bodyText: '#05040b',
    sectionDivider: '#f8d30e',
    stepNavBackground: '#ffffff',
    stepNavText: '#929a95',
    activeStep: brand.primary,
    cardBackground: '#ffffff',
    cardTitle: '#05040b',
    cardDescription: '#596267',
    cardBorder: '#dfe3e8',
    cardSelectedBorder: brand.primary,
    cardHoverAccent: brand.primary,
    previewBackground: '#e9f0f1',
    previewText: '#243034',
    previewLabel: '#243034',
    previewDivider: '#d5e0e2',
    previewControlsBackground: '#05040b',
    previewControlsText: '#ffffff',
    primaryButtonBackground: brand.primary,
    primaryButtonText: primaryText,
    primaryButtonBorder: 'transparent',
    primaryButtonHover: brand.primary,
    secondaryButtonBackground: '#05040b',
    secondaryButtonText: '#ffffff',
    secondaryButtonBorder: 'transparent',
    secondaryButtonHover: '#05040b',
    footerBackground: brand.secondary,
    footerText: headerText,
    footerLink: headerText,
    footerIcon: headerText,
    footerAccent: brand.primary,
  }
}

export type ContrastWarning = { id: string; label: string; ratio: number }

export function appearanceContrastWarnings(config: DoorBuilderAppearance | null | undefined, source: BrandColorSource): ContrastWarning[] {
  const stored = orderedAppearance(config)
  if (!stored) return []
  const brand = resolvedBrandColors(source)
  const defaults = establishedColors(brand)
  const warnings: ContrastWarning[] = []
  for (const pair of CONTRAST_PAIRS) {
    const backgroundSet = Boolean(stored[pair.background])
    const foregroundSet = pair.foreground ? Boolean(stored[pair.foreground]) : backgroundSet
    if (!backgroundSet && !foregroundSet) continue
    const background = resolveAppearanceValue(stored[pair.background], brand) ?? defaults[pair.background]
    const foreground = pair.foreground
      ? resolveAppearanceValue(stored[pair.foreground], brand) ?? defaults[pair.foreground]
      : pair.fallbackForeground ?? '#ffffff'
    if (background === 'transparent' || foreground === 'transparent') continue
    const ratio = contrastRatio(background, foreground)
    if (ratio < pair.minimum) warnings.push({ id: pair.id, label: pair.label, ratio })
  }
  return warnings
}

export type PickerChoice = 'inherit' | 'primary' | 'secondary' | 'white' | 'black' | 'custom'

export function choiceForValue(value: AppearanceValue | null | undefined): PickerChoice {
  if (!value) return 'inherit'
  if (value === 'primary') return 'primary'
  if (value === 'secondary') return 'secondary'
  if (value.toLowerCase() === APPEARANCE_WHITE) return 'white'
  if (value.toLowerCase() === APPEARANCE_BLACK) return 'black'
  return 'custom'
}

export function valueForChoice(choice: PickerChoice, customHex: string | null): AppearanceValue | null {
  if (choice === 'inherit') return null
  if (choice === 'primary') return 'primary'
  if (choice === 'secondary') return 'secondary'
  if (choice === 'white') return APPEARANCE_WHITE
  if (choice === 'black') return APPEARANCE_BLACK
  return customHex
}

export function parseHexInput(raw: string): { ok: true; hex: string } | { ok: false; error: string } {
  const trimmed = raw.trim()
  if (!trimmed) return { ok: false, error: 'Enter a HEX color.' }
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`
  if (!HEX_COLOR.test(withHash)) return { ok: false, error: 'Use a HEX color like #235176.' }
  return { ok: true, hex: normalizeHexColor(withHash, withHash) }
}

export function hexToRgb(hex: string) {
  const color = normalizeHexColor(hex, '#000000')
  return {
    r: Number.parseInt(color.slice(1, 3), 16),
    g: Number.parseInt(color.slice(3, 5), 16),
    b: Number.parseInt(color.slice(5, 7), 16),
  }
}

export function rgbToHex(red: number, green: number, blue: number) {
  const channel = (value: number) => Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, '0')
  return `#${channel(red)}${channel(green)}${channel(blue)}`
}

export function hexToHsv(hex: string) {
  const { r, g, b } = hexToRgb(hex)
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const delta = max - min
  let hue = 0
  if (delta !== 0) {
    if (max === red) hue = ((green - blue) / delta) % 6
    else if (max === green) hue = (blue - red) / delta + 2
    else hue = (red - green) / delta + 4
    hue *= 60
    if (hue < 0) hue += 360
  }
  return { h: hue, s: max === 0 ? 0 : delta / max, v: max }
}

export function hsvToHex(hue: number, saturation: number, value: number) {
  const wrapped = ((hue % 360) + 360) % 360
  const chroma = value * saturation
  const x = chroma * (1 - Math.abs(((wrapped / 60) % 2) - 1))
  const match = value - chroma
  const channels = wrapped < 60
    ? [chroma, x, 0]
    : wrapped < 120
      ? [x, chroma, 0]
      : wrapped < 180
        ? [0, chroma, x]
        : wrapped < 240
          ? [0, x, chroma]
          : wrapped < 300
            ? [x, 0, chroma]
            : [chroma, 0, x]
  return rgbToHex((channels[0] + match) * 255, (channels[1] + match) * 255, (channels[2] + match) * 255)
}

export function svFromPointer(offsetX: number, offsetY: number, width: number, height: number) {
  const safeWidth = width > 0 ? width : 1
  const safeHeight = height > 0 ? height : 1
  return {
    s: Math.min(1, Math.max(0, offsetX / safeWidth)),
    v: Math.min(1, Math.max(0, 1 - offsetY / safeHeight)),
  }
}

export function hueFromPointer(offsetX: number, width: number) {
  const safeWidth = width > 0 ? width : 1
  return Math.min(360, Math.max(0, (offsetX / safeWidth) * 360))
}

export function nudgeHsv(hex: string, channel: 'h' | 's' | 'v', delta: number) {
  const parsed = parseHexInput(hex)
  const hsv = hexToHsv(parsed.ok ? parsed.hex : '#000000')
  if (channel === 'h') hsv.h = (hsv.h + delta + 360) % 360
  if (channel === 's') hsv.s = Math.min(1, Math.max(0, hsv.s + delta))
  if (channel === 'v') hsv.v = Math.min(1, Math.max(0, hsv.v + delta))
  return hsvToHex(hsv.h, hsv.s, hsv.v)
}

/** Arrow-key steps used by the saturation area and the hue slider. */
export function nudgePickerHex(hex: string, area: 'sv' | 'hue', key: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown') {
  if (area === 'hue') {
    if (key === 'ArrowRight' || key === 'ArrowUp') return nudgeHsv(hex, 'h', 12)
    return nudgeHsv(hex, 'h', -12)
  }
  if (key === 'ArrowRight') return nudgeHsv(hex, 's', 0.05)
  if (key === 'ArrowLeft') return nudgeHsv(hex, 's', -0.05)
  if (key === 'ArrowUp') return nudgeHsv(hex, 'v', 0.05)
  return nudgeHsv(hex, 'v', -0.05)
}

export function describeAppearanceValue(value: AppearanceValue | null | undefined, brand: { primary: string; secondary: string }) {
  const choice = choiceForValue(value)
  const resolved = resolveAppearanceValue(value, brand)
  if (choice === 'inherit') return 'Default'
  if (choice === 'primary') return `Primary · ${brand.primary}`
  if (choice === 'secondary') return `Secondary · ${brand.secondary}`
  if (choice === 'white') return 'White · #ffffff'
  if (choice === 'black') return 'Black · #000000'
  return (resolved ?? '').toUpperCase()
}

export function missingAppearanceColumn(message: string | undefined) {
  return Boolean(message && /door_builder_appearance/i.test(message))
}
