/**
 * Readable Opta notes from a saved Door Builder snapshot.
 * OPTA_NOTES_MAX_LENGTH is provisional until Opta confirms a notes limit.
 * Only the customer note is shortened first.
 */
export const OPTA_NOTES_MAX_LENGTH = 1000

const LOCK_NAMES: Record<string, string> = {
  DDLLBO: 'Locks on Both Doors',
  DDLLAC: 'Lock on Main Door Only',
  DDLLKP: 'Knob Prep Only',
}

export function optaDoorConfigurationNotes(doorConfiguration: Record<string, unknown> | null, customerNote: string | null): string | null {
  const door = asRecord(doorConfiguration) ?? {}
  const configuration = configurationRecord(door)
  const lines = [
    labeled('Door line', doorLine(configuration) || text(door.door_line)),
    labeled('Style', styleLabel(configuration.style) || text(door.door_style)),
    labeled('Sidelites/slab/sidelite glass', sideliteSummary(configuration) || text(door.sidelite_placement)),
    labeled('Main glass', mainGlass(configuration) || text(door.main_door_glass)),
    labeled('Finish type/color', finishSummary(configuration) || joinParts([text(door.door_finish_type), text(door.door_finish_color)])),
    labeled('Jamb type/finish', jambSummary(configuration) || joinParts([text(door.jamb_type), text(door.jamb_finish_type), text(door.jamb_finish_color)])),
    labeled('Hardware', hardwareLabel(configuration.hardware) || text(door.hardware)),
    labeled('Lock setup', lockSetup(configuration) || meaningful(text(door.lock_setup))),
    labeled('Swing', swingLabel(configuration) || text(door.door_swing)),
    labeled('Hinge', hingeLabel(configuration) || meaningful(text(door.hinge_option))),
  ].filter((line): line is string => Boolean(line))
  return capNotes(lines, customerNote?.trim() ?? '')
}

function capNotes(lines: string[], customerNote: string) {
  const summary = lines.join('\n')
  if (!customerNote) return bound(summary)
  const noteLine = `Customer note: ${customerNote}`
  const full = summary ? `${summary}\n${noteLine}` : noteLine
  if (full.length <= OPTA_NOTES_MAX_LENGTH) return full
  const prefix = summary ? `${summary}\nCustomer note: ` : 'Customer note: '
  const room = OPTA_NOTES_MAX_LENGTH - prefix.length
  if (room > 1) return `${prefix}${customerNote.slice(0, room - 1).trimEnd()}…`
  return bound(summary)
}

function bound(summary: string) {
  if (summary.length <= OPTA_NOTES_MAX_LENGTH) return summary || null
  return `${summary.slice(0, OPTA_NOTES_MAX_LENGTH - 1).trimEnd()}…`
}

function configurationRecord(door: Record<string, unknown>) {
  const inner = asRecord(door.configuration)
  if (inner && ('style' in inner || 'product' in inner || 'doorLine' in inner || 'doorSwing' in inner)) return inner
  return door
}

function doorLine(configuration: Record<string, unknown>) {
  return text(configuration.doorLine) || text(asRecord(configuration.product)?.doorType)
}

function styleLabel(value: unknown) {
  if (typeof value === 'string') return value.trim()
  const style = asRecord(value)
  if (!style) return ''
  const code = text(style.code)
  const name = text(style.name)
  if (code && name && !name.toLowerCase().startsWith(code.toLowerCase())) return `${code} - ${name}`
  return name || code
}

function sideliteSummary(configuration: Record<string, unknown>) {
  const placement = text(configuration.sideliteConfigurationLabel) || sideliteLabel(configuration.sidelitePlacement ?? configuration.sidelites)
  const slab = text(configuration.sideliteStyle)
  const glass = sideliteGlass(configuration.sideliteGlass)
  if (placement === 'No sidelites' && !slab && !glass) return placement
  return joinParts([placement, slab, glass])
}

function sideliteLabel(value: unknown) {
  const raw = text(value)
  if (raw === 'none' || raw === 'NOSIDE') return 'No sidelites'
  if (raw === 'both' || raw === 'both-sides' || raw === 'BOTHSIDES') return 'Sidelites on Both Sides'
  if (raw === 'left' || raw === 'hinge-side' || raw === 'LEFTSIDE') return 'Sidelite on Left'
  if (raw === 'right' || raw === 'lock-side' || raw === 'RIGHTSIDE') return 'Sidelite on Right'
  return raw
}

function sideliteGlass(value: unknown) {
  if (typeof value === 'string') return value.trim()
  const glass = asRecord(value)
  if (!glass) return ''
  const details = [text(glass.glassCoating), gridDetails(glass)].filter(Boolean)
  return [text(glass.glass), details.join(' / ')].filter(Boolean).join(' — ')
}

function mainGlass(configuration: Record<string, unknown>) {
  const glass = glassName(configuration.mainDoorGlass) || glassName(configuration.glass)
  const grid = gridDetails(asRecord(configuration.grid))
  return [glass, grid].filter(Boolean).join(' — ')
}

function glassName(value: unknown) {
  if (typeof value === 'string') return value.trim()
  return text(asRecord(value)?.name)
}

function gridDetails(record: Record<string, unknown> | null) {
  if (!record) return ''
  const location = text(record.gridLocation)
  if (!location || location === 'No Grids') return ''
  return [location, text(record.gridStyle), text(record.gridPattern), text(record.gridColor), text(record.gridWidth)].filter(Boolean).join(' / ')
}

function finishSummary(configuration: Record<string, unknown>) {
  const finish = asRecord(configuration.finish)
  return joinParts([
    titleCase(text(configuration.doorFinishType) || text(finish?.finishType)),
    text(configuration.doorFinishColor) || text(finish?.name),
  ])
}

function jambSummary(configuration: Record<string, unknown>) {
  return joinParts([
    titleCase(text(configuration.jambType)),
    titleCase(text(configuration.jambFinishType)),
    text(configuration.jambFinishColor),
  ])
}

function hardwareLabel(value: unknown) {
  if (typeof value === 'string') return value.trim()
  const hardware = asRecord(value)
  if (!hardware) return ''
  const manufacturer = text(hardware.manufacturer)
  const style = text(hardware.style)
  const finish = text(hardware.finish)
  if (manufacturer && style && finish) return `${manufacturer} ${style} - ${finish}`
  return [manufacturer, style, finish].filter(Boolean).join(' ')
}

function lockSetup(configuration: Record<string, unknown>) {
  const type = text(configuration.doorConfigurationType) || 'single'
  if (type === 'single') return ''
  const code = type === 'savannah' ? 'DDLLAC' : text(configuration.doubleDoorLockPrep) || 'DDLLAC'
  return LOCK_NAMES[code] ?? ''
}

function swingLabel(configuration: Record<string, unknown>) {
  if (text(configuration.doorConfigurationType) === 'french') return 'Both slabs operable'
  const swing = configuration.doorSwing
  if (typeof swing === 'string') return swing.trim()
  const record = asRecord(swing)
  return text(record?.name) || text(record?.id)
}

function hingeLabel(configuration: Record<string, unknown>) {
  const option = asRecord(configuration.doorConfigurationProductOption)
  return text(option?.customerLabel) || text(option?.label)
}

function labeled(label: string, value: string) {
  const cleaned = meaningful(value)
  return cleaned ? `${label}: ${cleaned}` : null
}

function meaningful(value: string) {
  const cleaned = value.trim()
  if (!cleaned || cleaned.toLowerCase() === 'not applicable') return ''
  return cleaned
}

function joinParts(parts: string[]) {
  return parts.map((part) => part.trim()).filter(Boolean).join(' / ')
}

function titleCase(value: string) {
  if (!value) return ''
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function asRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}
