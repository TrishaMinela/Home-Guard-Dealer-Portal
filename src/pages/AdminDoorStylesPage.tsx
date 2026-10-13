import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDoorStylesAdmin } from '../hooks/useDoorStylesAdmin'

type AvailabilityFilter = 'all' | 'visible' | 'inactive'

function availabilityLabel(customerSelectable: boolean, status: string) {
  if (status === 'discontinued') return 'Discontinued'
  if (status === 'legacy_only') return 'Legacy only'
  return customerSelectable ? 'Customer visible' : 'Hidden'
}

export function AdminDoorStylesPage() {
  const { revision, styles, materialSeriesOptions, variantCount, isLoading, error, refresh } = useDoorStylesAdmin()
  const [search, setSearch] = useState('')
  const [availability, setAvailability] = useState<AvailabilityFilter>('all')
  const [relationshipFilter, setRelationshipFilter] = useState('all')
  const [brokenThumbnails, setBrokenThumbnails] = useState<Set<string>>(() => new Set())

  const filteredStyles = useMemo(() => {
    const query = search.trim().toLowerCase()
    const selectedOption = materialSeriesOptions.find((option) => option.value === relationshipFilter)
    const selectedName = selectedOption?.label.replace(/^Material: |^Series: /, '')
    const filterType = relationshipFilter.split(':')[0]
    return styles.filter((style) => {
      const matchesSearch = !query || [style.name, style.legacyId, style.internalCode, style.productCode, ...style.materials, ...style.series, ...style.signatureGrains]
        .filter(Boolean).some((value) => value!.toLowerCase().includes(query))
      const matchesAvailability = availability === 'all'
        || (availability === 'visible' && style.customerSelectable && style.status === 'active')
        || (availability === 'inactive' && (!style.customerSelectable || style.status !== 'active'))
      const matchesRelationship = relationshipFilter === 'all'
        || (filterType === 'material' && style.materials.includes(selectedName ?? ''))
        || (filterType === 'series' && style.series.includes(selectedName ?? ''))
      return matchesSearch && matchesAvailability && matchesRelationship
    })
  }, [availability, materialSeriesOptions, relationshipFilter, search, styles])

  return (
    <div className="page-content door-styles-page">
      <header className="page-header page-header--with-action admin-page-header">
        <div><p className="eyebrow">Inventory</p><h1>Door Styles</h1><p>Review imported door styles, compatibility relationships, and current asset coverage.</p></div>
        <Link className="button button--outline" to="/admin/inventory">Back to Inventory</Link>
      </header>
      {revision && <div className="door-catalog-summary" aria-label="Door catalog summary"><span className={`catalog-status__badge catalog-status__badge--${revision.status}`}>{revision.status}</span><strong>{styles.length} door styles</strong><span>{variantCount} material / grain variants</span></div>}
      {isLoading && <div className="data-state">Loading Door Styles...</div>}
      {!isLoading && error && <section className="content-card inventory-error" role="alert"><strong>Door Styles are temporarily unavailable.</strong><p>{error}</p><button className="button button--outline" type="button" onClick={() => void refresh()}>Try Again</button></section>}
      {!isLoading && !error && !revision && <section className="content-card empty-state inventory-empty"><strong>No catalog revision exists yet.</strong></section>}
      {!isLoading && !error && revision && <>
        <section className="content-card door-style-toolbar" aria-label="Filter Door Styles">
          <label className="filter-field door-style-search"><span>Search</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, code, material, series, or grain" /></label>
          <label className="filter-field"><span>Availability</span><select value={availability} onChange={(event) => setAvailability(event.target.value as AvailabilityFilter)}><option value="all">All</option><option value="visible">Customer visible</option><option value="inactive">Hidden / inactive</option></select></label>
          <label className="filter-field"><span>Material / series</span><select value={relationshipFilter} onChange={(event) => setRelationshipFilter(event.target.value)}><option value="all">All materials and series</option>{materialSeriesOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        </section>
        <p className="door-style-result-count">Showing {filteredStyles.length} of {styles.length} door styles</p>
        {filteredStyles.length === 0 ? <section className="content-card empty-state inventory-empty"><strong>No Door Styles match these filters.</strong><p>Adjust the search or filters to see more records.</p></section> :
          <section className="door-style-grid" aria-label="Door Styles catalog">{filteredStyles.map((style) => <article className="content-card door-style-card" key={style.id}>
            <div className="door-style-card__thumbnail">{style.thumbnailPath && !brokenThumbnails.has(style.id) ? <img src={style.thumbnailPath} alt={`${style.name} selection thumbnail`} onError={() => setBrokenThumbnails((current) => new Set(current).add(style.id))} /> : <span aria-label="Thumbnail unavailable">{style.productCode || 'Door'}</span>}</div>
            <div className="door-style-card__body"><div className="door-style-card__heading"><div><p className="eyebrow">{style.productCode || style.internalCode || 'No code'}</p><h2>{style.name}</h2></div><span className={`status-badge ${style.customerSelectable && style.status === 'active' ? 'status-badge--active' : 'status-badge--inactive'}`}>{availabilityLabel(style.customerSelectable, style.status)}</span></div>
              <dl className="door-style-card__facts"><div><dt>Variants</dt><dd>{style.variantCount}</dd></div><div><dt>Materials</dt><dd>{style.materials.join(', ') || '—'}</dd></div><div><dt>Series</dt><dd>{style.series.join(', ') || '—'}</dd></div><div><dt>Signature grains</dt><dd>{style.signatureGrains.join(', ') || 'Not applicable'}</dd></div></dl>
              <div className={`door-asset-status ${style.hasRequiredAssets ? 'door-asset-status--complete' : 'door-asset-status--partial'}`}><strong>{style.hasRequiredAssets ? 'Core assets mapped' : 'Asset mapping needs review'}</strong><span>{style.thumbnailCount} thumbnail · {style.renderAssetCount} render assets · {style.maskCount} masks</span></div>
              <div className="door-asset-coverage" aria-label={`${style.name} asset locations`}>
                <span className="door-asset-coverage__item door-asset-coverage__item--local">Local/source available: {style.localAssetCount}</span>
                <span className="door-asset-coverage__item door-asset-coverage__item--storage">Supabase Storage available: {style.storageAssetCount}</span>
                <span className={`door-asset-coverage__item ${style.missingAssetCount > 0 ? 'door-asset-coverage__item--missing' : 'door-asset-coverage__item--clear'}`}>Missing: {style.missingAssetCount}</span>
              </div>
              <small className="door-style-card__path" title={style.thumbnailPath ?? undefined}>{style.thumbnailPath || 'No thumbnail path mapped'}</small>
              <Link className="button button--outline" to={`/admin/inventory/door-styles/${style.id}`}>Manage</Link>
            </div>
          </article>)}</section>}
      </>}
    </div>
  )
}
