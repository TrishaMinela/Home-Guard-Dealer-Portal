import { useEffect, useMemo } from 'react'
import type { AdminLead } from '../types/admin'

type AdminLeadDetailProps = {
  lead: AdminLead
  dealerName: string
  onClose: () => void
}

type DetailItem = { label: string; value: string }
type UnknownRecord = Record<string, unknown>

const configurationTypeLabels: Record<string, string> = {
  single: 'Single Door',
  french: 'French Door',
  savannah: 'Savannah Door',
}

const lockOptionLabels: Record<string, string> = {
  DDLLBO: 'Locks on Both Doors',
  DDLLAC: 'Lock on Main Door Only',
  DDLLKP: 'Knob Prep Only',
}

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : null
}

function read(source: UnknownRecord | null, ...paths: string[][]): unknown {
  for (const path of paths) {
    let value: unknown = source
    for (const key of path) value = asRecord(value)?.[key]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return null
}

function displayValue(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

function item(label: string, value: unknown, transform?: (value: string) => string): DetailItem | null {
  const displayed = displayValue(value)
  return displayed ? { label, value: transform ? transform(displayed) : displayed } : null
}

function titleCase(value: string) {
  return value.replaceAll('-', ' ').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(date))
}

function DetailSection({ title, items }: { title: string; items: Array<DetailItem | null> }) {
  const visibleItems = items.filter((entry): entry is DetailItem => Boolean(entry))
  if (!visibleItems.length) return null

  return (
    <section className="lead-detail__section">
      <h3>{title}</h3>
      <dl className="lead-detail__grid">
        {visibleItems.map((entry) => (
          <div className="lead-detail__item" key={`${title}-${entry.label}`}>
            <dt>{entry.label}</dt>
            <dd>{entry.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export function AdminLeadDetail({ lead, dealerName, onClose }: AdminLeadDetailProps) {
  const snapshot = asRecord(lead.door_configuration)
  const configuration = asRecord(snapshot?.configuration)

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    document.body.classList.add('has-dialog')
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.classList.remove('has-dialog')
    }
  }, [onClose])

  const configurationItems = useMemo(() => {
    const configurationType = displayValue(read(
      configuration,
      ['doorConfigurationType'],
      ['configurationType'],
    )).toLowerCase()
    const lockOption = displayValue(read(
      configuration,
      ['doubleDoorLockPrep'],
      ['frenchDoorLockPrep'],
      ['savannahLockPrep'],
      ['lockOption'],
    ))
    return [
      item('Configuration type', configurationType, (value) => configurationTypeLabels[value] ?? titleCase(value)),
      item('Door line / material', read(configuration, ['doorLine'], ['material'], ['product', 'doorTypeLabel'], ['product', 'doorType'])),
      item('Product', read(configuration, ['product', 'name'], ['product', 'doorTypeLabel'], ['product', 'doorType'], ['productName'])),
      item('Door style', read(configuration, ['style', 'name'], ['doorStyle', 'name'], ['doorStyle'])),
      item('Door code', read(configuration, ['style', 'code'], ['doorCode'])),
      item('Grain', read(configuration, ['grain', 'name'], ['grain'])),
      item('Door finish', read(configuration, ['finish', 'name'], ['doorFinish'])),
      item('Finish type', read(configuration, ['doorFinishType'], ['finish', 'finishType']), titleCase),
      item('Finish color', read(configuration, ['doorFinishColor'], ['finish', 'color'], ['finish', 'name'])),
      item('Glass', read(configuration, ['mainDoorGlass', 'name'], ['glass', 'name'])),
      item('Glass coating', read(configuration, ['mainDoorGlass', 'glassCoating'], ['glass', 'glassCoating'], ['grid', 'glassCoating'], ['glassCoating'])),
      item('Glass frame color mode', read(configuration, ['glassFrameColorMode']), titleCase),
      item('Glass frame finish color', read(configuration, ['glassFrameFinishColor'])),
      item('Grid location', read(configuration, ['grid', 'gridLocation'])),
      item('Grid style', read(configuration, ['grid', 'gridStyle'])),
      item('Grid pattern', read(configuration, ['grid', 'gridPattern'])),
      item('Grid color', read(configuration, ['grid', 'gridColor'])),
      item('Grid width', read(configuration, ['grid', 'gridWidth'])),
      item('Hardware manufacturer', read(configuration, ['hardware', 'manufacturer'])),
      item('Hardware style', read(configuration, ['hardware', 'style'])),
      item('Hardware finish', read(configuration, ['hardware', 'finish'])),
      item('Hardware handing', read(configuration, ['hardware', 'handing'])),
      item('Door swing', read(configuration, ['doorSwing', 'name'], ['doorSwing'])),
      item('Jamb type', read(configuration, ['jambType']), titleCase),
      item('Jamb finish', read(configuration, ['jambFinishType']), titleCase),
      item('Jamb color', read(configuration, ['jambFinishColor'])),
      item('Sidelite placement', read(configuration, ['sideliteConfigurationLabel'], ['sidelitePlacement'], ['sidelites']), titleCase),
      item('Sidelite product', read(configuration, ['sideliteProduct', 'name'], ['sideliteSlab', 'name'], ['sideliteSlab'], ['sideliteConfigurationCode'])),
      item('Sidelite style', read(configuration, ['sideliteStyle', 'name'], ['sideliteStyle'])),
      item('Sidelite glass', read(configuration, ['sideliteGlass', 'name'], ['sideliteGlass', 'glass'])),
      item('Sidelite glass coating', read(configuration, ['sideliteGlass', 'glassCoating'])),
      item('Sidelite grid style', read(configuration, ['sideliteGlass', 'gridStyle'])),
      item('Sidelite grid pattern', read(configuration, ['sideliteGlass', 'gridPattern'])),
      item('Sidelite grid color', read(configuration, ['sideliteGlass', 'gridColor'])),
      item('Lock setup', lockOption, (value) => lockOptionLabels[value] ?? value),
      item('Hinge option', read(configuration, ['doorConfigurationProductOption', 'label'], ['frenchDoorHingeOption', 'label'], ['savannahHingeOption', 'label'], ['hingeOption', 'label'], ['hingeOption'])),
    ]
  }, [configuration])

  return (
    <div className="lead-detail-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <article className="lead-detail" role="dialog" aria-modal="true" aria-labelledby="lead-detail-title">
        <header className="lead-detail__header">
          <div>
            <p className="eyebrow">Lead details</p>
            <h2 id="lead-detail-title">{lead.first_name} {lead.last_name}</h2>
            <p>{lead.email}</p>
          </div>
          <button className="lead-detail__close" type="button" aria-label="Close lead details" onClick={onClose}>×</button>
        </header>

        <div className="lead-detail__body">
          <DetailSection title="Customer" items={[
            item('Name', `${lead.first_name} ${lead.last_name}`.trim()),
            item('Email', lead.email),
            item('Phone', lead.phone),
            item('Address', lead.address),
            item('City', lead.city),
            item('State', lead.state),
            item('ZIP', lead.zip),
            item('Preferred contact method', lead.preferred_contact_method, titleCase),
            item('Comments / notes', lead.comments),
          ]} />
          <DetailSection title="Lead" items={[
            item('Dealer', dealerName),
            item('Source', lead.source, titleCase),
            item('Status', lead.status, titleCase),
            item('Project timeline', lead.project_timeline),
            item('Submitted date', formatDate(lead.created_at)),
            item('Submission ID', lead.submission_id),
            item('Configuration schema', snapshot?.schemaVersion ? `Version ${snapshot.schemaVersion}` : null),
          ]} />
          <DetailSection title="Attribution" items={[
            item('UTM source', lead.utm_source),
            item('UTM medium', lead.utm_medium),
            item('UTM campaign', lead.utm_campaign),
            item('UTM content', lead.utm_content),
          ]} />
          {configurationItems.some(Boolean) ? (
            <DetailSection title="Door Configuration" items={configurationItems} />
          ) : (
            <section className="lead-detail__section">
              <h3>Door Configuration</h3>
              <p className="lead-detail__empty">Configuration details are not available for this older lead.</p>
            </section>
          )}
          {lead.visualizer_url && (
            <a className="button button--primary lead-detail__visualizer" href={lead.visualizer_url} target="_blank" rel="noreferrer">
              Open visualization
            </a>
          )}
        </div>
      </article>
    </div>
  )
}
