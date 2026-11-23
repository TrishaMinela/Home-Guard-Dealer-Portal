import { useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import type { AdminDealer } from '../types/admin'
import { doorBuilderLogoPreview, isLightBrandColor, type DoorBuilderPreviewSurface } from '../utils/dealerLogoVariants'
import { fontStacks } from '../utils/dealerTypography'
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

const DESKTOP_WIDTH = 1280
const MOBILE_WIDTH = 390
type PreviewSurface = 'homepage' | 'builder' | 'find'

const SURFACE_LOGO: Record<PreviewSurface, DoorBuilderPreviewSurface> = {
  homepage: 'home-header',
  builder: 'page-header',
  find: 'find-my-door',
}

const CONFIGURATIONS = [
  { name: 'Single Door', description: 'One standard entry door.', image: '/appearance-preview/single-door.webp', selected: true },
  { name: 'French Door', description: 'Two operating door panels.', image: '/appearance-preview/french-door.webp', selected: false },
  { name: 'Savannah Door', description: 'Double-door appearance with one fixed panel.', image: '/appearance-preview/savannah-door.webp', selected: false },
]

const POPULAR = [
  { name: 'Modern Farmhouse', detail: 'Black 3/4 lite', image: '/appearance-preview/popular/01-modern-farmhouse.png' },
  { name: 'Craftsman', detail: 'Fir with nutmeg stain', image: '/appearance-preview/popular/02-craftsman.png' },
  { name: 'Farmhouse with Sidelites', detail: 'Forest, two sidelites', image: '/appearance-preview/popular/03-farmhouse-sidelites.png' },
  { name: 'French Double Door', detail: 'Black, locks on both doors', image: '/appearance-preview/popular/04-french-double.png' },
  { name: 'Stacked 3 Lite', detail: 'Black, clear low-E', image: '/appearance-preview/popular/05-stacked-3-lite.png' },
]

const SUMMARY = [
  ['Door Style', 'Not selected'],
  ['Finish', 'Not selected'],
  ['Glass', 'Not applicable'],
  ['Sidelites', 'None'],
  ['Hardware', 'Not selected'],
  ['Door Swing', 'Not selected'],
]

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
  if (!secondaryUrl) return <span className="dealer-brand-mark">{linkedPrimary}</span>
  const second = <img src={secondaryUrl} alt={secondaryHref ? '' : `${companyName} partner logo`} />
  return (
    <span className="dealer-brand-mark dealer-brand-mark--pair logo-pair">
      {linkedPrimary}
      <span className="logo-pair__rule" aria-hidden="true" />
      {secondaryHref
        ? <a className="dealer-logo-link logo-pair__link" href={secondaryHref} target="_blank" rel="noopener noreferrer" aria-label={`${companyName} partner website (opens in a new tab)`}>{second}</a>
        : second}
    </span>
  )
}

function HomeIcon() {
  return <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path d="M4 10.5 12 4l8 6.5V20H4Z" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
}

function ExternalIcon() {
  return <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M14 5h5v5M19 5l-9 9M10 6H6v12h12v-4" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
}

function PhoneIcon() {
  return <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path d="M8 4h3l1 4-2 1a12 12 0 0 0 5 5l1-2 4 1v3c0 1-1 2-2 2A15 15 0 0 1 6 6c0-1 1-2 2-2Z" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
}

function GlobeIcon() {
  return <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M4 12h16M12 4c2.5 2.4 2.5 13.6 0 16M12 4c-2.5 2.4-2.5 13.6 0 16" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
}

export function DoorBuilderAppearancePreview({ dealer, appearance }: Props) {
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 900px)').matches)
  const [surface, setSurface] = useState<PreviewSurface>('builder')
  const frameRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [scaledHeight, setScaledHeight] = useState(640)
  const brand = resolvedBrandColors({ primaryColor: dealer.primary_color, secondaryColor: dealer.secondary_color })
  const shown = appearanceEditorPayload(appearance)
  const headerBackground = resolveAppearanceValue(shown?.headerBackground, brand) ?? brand.secondary
  const footerBackground = resolveAppearanceValue(shown?.footerBackground, brand) ?? brand.secondary
  const headingFont = dealer.heading_font_family ? fontStacks[dealer.heading_font_family] : ''
  const bodyFont = dealer.body_font_family ? fontStacks[dealer.body_font_family] : ''
  const style = {
    '--dealer-primary': brand.primary,
    '--dealer-primary-foreground': inkFor(brand.primary),
    '--dealer-secondary': brand.secondary,
    '--dealer-secondary-foreground': inkFor(brand.secondary),
    '--peacock': brand.primary,
    '--gold': '#f8d30e',
    ...appearanceCssVars(shown, brand),
    ...(headingFont ? { '--db-preview-heading-font': headingFont } : {}),
    ...(dealer.heading_font_size ? { '--db-preview-heading-size': `${dealer.heading_font_size}px` } : {}),
    ...(dealer.heading_font_weight ? { '--db-preview-heading-weight': String(dealer.heading_font_weight) } : {}),
    ...(bodyFont ? { '--db-preview-body-font': bodyFont } : {}),
    ...(dealer.body_font_size ? { '--db-preview-body-size': `${dealer.body_font_size}px` } : {}),
  } as CSSProperties
  const logos = doorBuilderLogoPreview(dealer, SURFACE_LOGO[surface])
  const heroLogos = surface === 'homepage' ? doorBuilderLogoPreview(dealer, 'home-hero') : null
  const primaryHref = logoWebsiteHref(dealer.logo_website_url, dealer.website)
  const secondaryHref = logoWebsiteHref(dealer.logo_secondary_website_url)
  const headerIsLight = isLightBrandColor(headerBackground)
  const footerIsLight = isLightBrandColor(footerBackground)
  const designWidth = mobile ? MOBILE_WIDTH : DESKTOP_WIDTH

  useLayoutEffect(() => {
    const frame = frameRef.current
    const stage = stageRef.current
    if (!frame || !stage) return
    const measure = () => {
      const available = frame.clientWidth
      const nextScale = available > 0 ? available / designWidth : 1
      setScale(nextScale)
      setScaledHeight(Math.ceil(stage.offsetHeight * nextScale))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(frame)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [designWidth, appearance, dealer, mobile, surface])

  const stop = (event: MouseEvent<HTMLAnchorElement>) => event.preventDefault()

  return (
    <div className="db-preview-shell">
      <div className="db-preview-shell__bar">
        <strong>Live preview</strong>
        <div className="db-preview-shell__toggle" role="group" aria-label="Preview page">
          {([['homepage', 'Homepage'], ['builder', 'Door Builder'], ['find', 'Find My Door']] as const).map(([value, label]) => (
            <button key={value} type="button" className={surface === value ? 'is-selected' : ''} aria-pressed={surface === value} onClick={() => setSurface(value)}>{label}</button>
          ))}
        </div>
        <div className="db-preview-shell__toggle" role="group" aria-label="Preview width">
          <button type="button" className={mobile ? '' : 'is-selected'} aria-pressed={!mobile} onClick={() => setMobile(false)}>Desktop</button>
          <button type="button" className={mobile ? 'is-selected' : ''} aria-pressed={mobile} onClick={() => setMobile(true)}>Mobile</button>
        </div>
      </div>
      <div className={`db-preview-frame ${mobile ? 'is-mobile' : 'is-desktop'}`} ref={frameRef}>
        <div className="db-preview-sizer" style={{ height: scaledHeight }}>
          <div className="db-preview-scale" ref={stageRef} style={{ width: designWidth, transform: `scale(${scale})` }}>
            <div
              className={`dealer-cobranded db-appearance-preview ${mobile ? 'is-mobile' : 'is-desktop'} ${headerIsLight ? 'dealer-secondary-light' : ''}`}
              data-appearance-mode={shown ? 'simple' : undefined}
              style={style}
            >
              <header aria-label={surface === 'homepage' ? 'Homepage header' : 'Door Builder header'}>
                <div className="dealer-header-brand">
                  {logos && <LogoPair
                    primaryUrl={logos.primaryUrl}
                    secondaryUrl={logos.showPair ? logos.secondaryUrl : null}
                    primaryHref={primaryHref}
                    secondaryHref={secondaryHref}
                    companyName={dealer.company_name}
                  />}
                </div>
                <div className="dealer-header-actions">
                  <button className="home-return" type="button" aria-label="Home"><HomeIcon /><span>Home</span></button>
                  {dealer.website && <a className="dealer-website-link" href={dealer.website} onClick={stop}><span>Visit Our Website</span> <ExternalIcon /></a>}
                </div>
              </header>
              {surface === 'homepage' && (
                <main className="home-page db-home">
                  <section className="home-hero">
                    <div className="home-hero-copy">
                      {heroLogos && (
                        <div className="dealer-hero-logo">
                          <LogoPair primaryUrl={heroLogos.primaryUrl} secondaryUrl={heroLogos.showPair ? heroLogos.secondaryUrl : null} primaryHref={primaryHref} secondaryHref={secondaryHref} companyName={dealer.company_name} />
                        </div>
                      )}
                      <h1>Build a Door Made for Your Home.</h1>
                      <p>Choose your door style, finish, glass, and hardware, then bring your vision to life.</p>
                      <button className="start-building" type="button">Start Building Your Door</button>
                    </div>
                    <div className="home-hero-visual">
                      <img src="/appearance-preview/single-door.webp" alt="Door on a home entryway" />
                    </div>
                  </section>
                </main>
              )}
              {surface === 'find' && (
                <main className="find-my-door-main db-find">
                  <section className="find-door-options">
                    <h1>Find My Door</h1>
                    <p>Answer a few questions and we will suggest a starting door.</p>
                  </section>
                </main>
              )}
              {surface === 'builder' && <>
              <div className="builder-toolbar">
                <nav className="stepper" aria-label="Configuration progress">
                  {['Door', 'Finish', 'Glass', 'Hardware'].map((label, index) => (
                    <button key={label} type="button" className={index === 0 ? 'active' : ''} aria-current={index === 0 ? 'step' : undefined}><span>{index + 1}</span><em>{label}</em></button>
                  ))}
                </nav>
                <div className="preview-toolbar">
                  <button className="preview-reset-design" type="button">Restart Build</button>
                </div>
              </div>
              <main>
                <div className="mobile-live-preview" aria-hidden={mobile ? undefined : true}>
                  <img src="/appearance-preview/single-door.webp" alt="" />
                  <button className="preview-reset-design" type="button">Restart Build</button>
                </div>
                <section className="builder-panel configuration-step">
                  <div className="section-heading step-heading">
                    <div className="step-label-row"><span>Step 1 of 4 · Door</span></div>
                  </div>
                  <section className="popular-styles" aria-labelledby="popular-styles-heading">
                    <h2 id="popular-styles-heading">Don&apos;t know which door to choose? Start with a popular style.</h2>
                    <div className="popular-styles-row">
                      {POPULAR.map((item) => (
                        <button key={item.name} type="button">
                          <span className="popular-styles-visual"><img src={item.image} alt="" /></span>
                          <span className="popular-styles-copy"><strong>{item.name}</strong><span>{item.detail}</span></span>
                        </button>
                      ))}
                    </div>
                    <p className="popular-styles-or">or start from scratch below</p>
                  </section>
                  <div className="section-heading step-heading">
                    <h1>Choose Your Door Configuration</h1>
                    <p>Start by choosing the type of entry door you want to build.</p>
                  </div>
                  <div className="door-configuration-grid">
                    {CONFIGURATIONS.map((item) => (
                      <article key={item.name} className={`option-card door-catalog-card door-configuration-card${item.selected ? ' selected' : ''}`}>
                        <span className="option-visual"><img src={item.image} alt="" /></span>
                        <span className="option-copy">
                          <small>Entry configuration</small>
                          <strong>{item.name}</strong>
                          <span>{item.description}</span>
                        </span>
                      </article>
                    ))}
                  </div>
                  <div className="builder-actions">
                    <button className="back" type="button" disabled>Previous</button>
                    <button className="next" type="button">Next</button>
                  </div>
                </section>
                <aside className="db-preview-panel" aria-label="Door preview panel">
                  <img className="stage-door" src="/appearance-preview/single-door.webp" alt="Single door preview" />
                  <div className="mini-summary">
                    {SUMMARY.map(([label, value]) => <span key={label}><b>{label}</b><strong>{value}</strong></span>)}
                  </div>
                </aside>
              </main>
              </>}
              <footer className="site-footer shared-site-footer">
                <div className="site-footer-feedback">
                  <div className="site-footer-actions">
                    <button className="site-feedback-trigger" type="button">Feedback</button>
                    <button className="dealer-mode-access" type="button">Dealer Mode</button>
                  </div>
                  <small>Built with <span aria-hidden="true">♥</span> by <a href="https://schoolradius.co/" onClick={stop}>School Radius</a></small>
                </div>
                <div className="site-footer-branding">
                  <div className="hgi-attribution">
                    <span>Door Builder & Visualizer provided by</span>
                    <img src={footerIsLight ? '/appearance-preview/hgi-logo-black.webp' : '/appearance-preview/hgi-logo-white.png'} alt="Home Guard Industries" />
                  </div>
                </div>
                <div className="site-footer-contact">
                  <a href="tel:+18005251885" onClick={stop}><PhoneIcon /><span>1-800-525-1885</span></a>
                  <a href="https://homeguardindustries.com" onClick={stop}><GlobeIcon /><span>homeguardindustries.com</span></a>
                </div>
              </footer>
            </div>
          </div>
        </div>
      </div>
      <p className="db-preview-caption">This preview uses the Door Builder layout and color tokens. It does not save a configuration or send a lead.</p>
    </div>
  )
}
