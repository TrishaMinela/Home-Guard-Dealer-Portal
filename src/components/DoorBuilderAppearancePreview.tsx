import { useState, type CSSProperties } from 'react'
import type { AdminDealer } from '../types/admin'
import { doorBuilderLogoPreview, isLightBrandColor } from '../utils/dealerLogoVariants'
import { logoWebsiteHref } from '../utils/logoWebsiteUrl'
import {
  appearanceCssVars,
  appearanceEditorPayload,
  inkFor,
  resolveAppearanceValue,
  resolvedBrandColors,
  type DoorBuilderAppearance,
} from '../utils/doorBuilderAppearance'
import '../styles/logoPair.css'
import '../styles/doorBuilderPreview.css'
import '../styles/dealerAppearance.css'

type Props = {
  dealer: AdminDealer
  appearance: DoorBuilderAppearance | null
}

function LogoPair({
  primaryUrl,
  secondaryUrl,
  primaryHref,
  secondaryHref,
  companyName,
}: {
  primaryUrl: string | null
  secondaryUrl: string | null
  primaryHref: string | null
  secondaryHref: string | null
  companyName: string
}) {
  if (!primaryUrl) return <strong>{companyName}</strong>
  const image = <img src={primaryUrl} alt={primaryHref ? '' : `${companyName} logo`} />
  const linkedPrimary = primaryHref
    ? <a className="dealer-logo-link logo-pair__link" href={primaryHref} target="_blank" rel="noopener noreferrer" aria-label={`${companyName} website (opens in a new tab)`}>{image}</a>
    : image
  if (!secondaryUrl) return linkedPrimary
  const second = <img src={secondaryUrl} alt={secondaryHref ? '' : `${companyName} partner logo`} />
  return (
    <span className="logo-pair">
      {linkedPrimary}
      <span className="logo-pair__rule" aria-hidden="true" />
      {secondaryHref
        ? <a className="dealer-logo-link logo-pair__link" href={secondaryHref} target="_blank" rel="noopener noreferrer" aria-label={`${companyName} partner website (opens in a new tab)`}>{second}</a>
        : second}
    </span>
  )
}

export function DoorBuilderAppearancePreview({ dealer, appearance }: Props) {
  const [mobile, setMobile] = useState(false)
  const brand = resolvedBrandColors({ primaryColor: dealer.primary_color, secondaryColor: dealer.secondary_color })
  const headerBackground = resolveAppearanceValue(appearance?.headerBackground, brand) ?? brand.secondary
  const style = {
    '--dealer-primary': brand.primary,
    '--dealer-primary-foreground': inkFor(brand.primary),
    '--dealer-secondary': brand.secondary,
    '--dealer-secondary-foreground': inkFor(brand.secondary),
    ...appearanceCssVars(appearanceEditorPayload(appearance), brand),
  } as CSSProperties
  const home = dealer.logo_placement === 'header' ? doorBuilderLogoPreview(dealer, 'home-header') : null
  const builder = doorBuilderLogoPreview(dealer, 'page-header')
  const finder = doorBuilderLogoPreview(dealer, 'find-my-door')
  const primaryHref = logoWebsiteHref(dealer.logo_website_url, dealer.website)
  const secondaryHref = logoWebsiteHref(dealer.logo_secondary_website_url)
  const logos = (preview: ReturnType<typeof doorBuilderLogoPreview>) => (
    <LogoPair
      primaryUrl={preview?.primaryUrl ?? null}
      secondaryUrl={preview?.showPair ? preview.secondaryUrl : null}
      primaryHref={primaryHref}
      secondaryHref={secondaryHref}
      companyName={dealer.company_name}
    />
  )
  const headerIsLight = isLightBrandColor(headerBackground)

  return (
    <div className="db-preview-shell">
      <div className="db-preview-shell__bar">
        <strong>Live preview</strong>
        <div className="db-preview-shell__toggle" role="group" aria-label="Preview width">
          <button type="button" className={mobile ? '' : 'is-selected'} aria-pressed={!mobile} onClick={() => setMobile(false)}>Desktop</button>
          <button type="button" className={mobile ? 'is-selected' : ''} aria-pressed={mobile} onClick={() => setMobile(true)}>Mobile</button>
        </div>
      </div>
      <div className={`db-preview-frame ${mobile ? 'is-mobile' : 'is-desktop'}`}>
        <div className={`dealer-cobranded db-appearance-preview ${headerIsLight ? 'dealer-secondary-light' : ''}`} data-appearance-mode={appearanceEditorPayload(appearance) ? 'simple' : undefined} style={style}>
          <header aria-label="Homepage header">{logos(home)}<span className="home-return"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M2 7.5 8 2l6 5.5V14H2Z" fill="currentColor" /></svg>Home</span></header>
          <header className="find-my-door-header" aria-label="Find My Door header">{logos(finder)}<span className="find-my-door-builder-link">Door Builder</span></header>
          <header aria-label="Builder header">{logos(builder)}<span className="home-return">Home</span></header>
          <ol className="stepper find-door-steps" aria-label="Step navigation">
            <li><span>Size</span></li>
            <li className="active current"><span><i>2</i></span> Style</li>
            <li><span>Glass</span></li>
          </ol>
          <div className="db-preview-layout">
            <div className="builder-panel find-my-door-main">
              <div className="section-heading">
                <h1>Choose a door</h1>
                <p>Main body text stays independent of the header and footer.</p>
              </div>
              <article className="option-card selected">
                <div className="option-visual" aria-hidden="true" />
                <strong>Craftsman</strong>
                <span className="option-copy"><span>Selected card description.</span></span>
              </article>
              <article className="option-card">
                <div className="option-visual" aria-hidden="true" />
                <strong>Full lite</strong>
                <span className="option-copy"><span>Another door choice.</span></span>
              </article>
              <div className="builder-actions find-door-actions">
                <button type="button" className="back" disabled>Previous</button>
                <button type="button" className="next">Next</button>
                <button type="button" className="preview-reset-design">Restart Build</button>
              </div>
            </div>
            <aside className="db-preview-panel" aria-label="Door preview panel">
              <div className="preview-view-toggle db-preview-controls">
                <button type="button">Outside</button>
                <button type="button">Inside</button>
              </div>
              <div className="door-frame"><div className="db-preview-door" data-door-art="untinted" /></div>
              <p>Preview info stays on the panel, not on the door.</p>
              <p className="db-preview-label">Swing</p>
            </aside>
          </div>
          <footer className="site-footer shared-site-footer">
            <span className="hgi-attribution"><span>Door Builder & Visualizer provided by</span></span>
            <span className="site-footer-contact"><a href="https://homeguardindustries.com">homeguardindustries.com<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="currentColor" /></svg></a></span>
            <div className="site-footer-feedback"><small>Built with <span aria-hidden="true">♥</span> by <a href="https://schoolradius.co/">School Radius</a></small></div>
          </footer>
        </div>
      </div>
      <p className="db-preview-caption">This preview uses the same color tokens as the Door Builder. The door art keeps its own colors. Logo links open each logo’s website.</p>
    </div>
  )
}
