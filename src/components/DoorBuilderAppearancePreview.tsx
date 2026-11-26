import { useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import type { AdminDealer } from '../types/admin'
import { doorBuilderLogoPreview, isLightBrandColor, type DoorBuilderPreviewSurface } from '../utils/dealerLogoVariants'
import { fontStacks } from '../utils/dealerTypography'
import { logoWebsiteHref } from '../utils/logoWebsiteUrl'
import {
  appearanceCssVars,
  appearanceEditorPayload,
  appearanceMode,
  inkFor,
  resolveAppearanceValue,
  resolvedBrandColors,
  type DoorBuilderAppearance,
} from '../utils/doorBuilderAppearance'
import '../styles/logoPair.css'
import '../styles/doorBuilderPreview.css'
import '../styles/dealerAppearance.css'

type PreviewSurface = 'homepage' | 'builder' | 'find' | 'visualizer'

type Props = {
  dealer: AdminDealer
  appearance: DoorBuilderAppearance | null
  surface?: PreviewSurface
  mobile?: boolean
  hideToolbar?: boolean
  matchLiveDocument?: boolean
}

const DESKTOP_WIDTH = 1280
const MOBILE_WIDTH = 390

const SURFACE_LOGO: Record<PreviewSurface, DoorBuilderPreviewSurface> = {
  homepage: 'home-header',
  builder: 'page-header',
  find: 'find-my-door',
  visualizer: 'page-header',
}

const PREVIEW_PAGES = [
  ['homepage', 'Homepage'],
  ['builder', 'Door Builder'],
  ['visualizer', 'Visualizer'],
  ['find', 'Find My Door'],
] as const

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

export function DoorBuilderAppearancePreview({ dealer, appearance, surface: surfaceProp, mobile: mobileProp, hideToolbar = false, matchLiveDocument = false }: Props) {
  const [mobileState, setMobile] = useState(() => window.matchMedia('(max-width: 900px)').matches)
  const [surfaceState, setSurface] = useState<PreviewSurface>('builder')
  const mobile = mobileProp ?? mobileState
  const surface = surfaceProp ?? surfaceState
  const frameRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [doorView, setDoorView] = useState<'Exterior' | 'Interior' | 'Both'>('Exterior')
  const [scale, setScale] = useState(1)
  const [scaledHeight, setScaledHeight] = useState(640)
  const brand = resolvedBrandColors({ primaryColor: dealer.primary_color, secondaryColor: dealer.secondary_color })
  const shown = appearanceEditorPayload(appearance)
  const headerBackground = resolveAppearanceValue(shown?.headerBackground, brand) ?? brand.secondary
  const footerBackground = resolveAppearanceValue(shown?.footerBackground, brand) ?? brand.secondary
  const headingFont = dealer.heading_font_family ? fontStacks[dealer.heading_font_family] : ''
  const bodyFont = dealer.body_font_family ? fontStacks[dealer.body_font_family] : ''
  const textColor = matchLiveDocument
    ? resolveAppearanceValue(appearance?.bodyText, brand) ?? resolveAppearanceValue(appearance?.headingText, brand)
    : null
  const appearanceModeValue = matchLiveDocument ? appearanceMode(appearance) : (shown ? 'simple' as const : undefined)
  const style = {
    '--dealer-primary': brand.primary,
    '--dealer-primary-foreground': inkFor(brand.primary),
    '--dealer-secondary': brand.secondary,
    '--dealer-secondary-foreground': inkFor(brand.secondary),
    '--peacock': brand.primary,
    '--gold': '#f8d30e',
    ...appearanceCssVars(shown, brand),
    ...(textColor ? { '--db-body-text': textColor, '--db-heading-text': textColor } : {}),
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
      const shell = frame.closest<HTMLElement>('.db-preview-shell')
      const visible = shell?.clientHeight ?? frame.clientHeight
      const nextScale = available > 0 ? available / designWidth : 1
      const page = stage.querySelector<HTMLElement>('.db-appearance-preview')
      if (page && nextScale > 0 && visible > 0) page.style.minHeight = `${Math.ceil(visible / nextScale)}px`
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
      {hideToolbar ? null : <div className="db-preview-shell__bar">
        <strong>Live preview</strong>
        <div className="db-preview-shell__toggle" role="group" aria-label="Preview page">
          {PREVIEW_PAGES.map(([value, label]) => (
            <button key={value} type="button" className={surface === value ? 'is-selected' : ''} aria-pressed={surface === value} onClick={() => setSurface(value)}>{label}</button>
          ))}
        </div>
        <div className="db-preview-shell__toggle" role="group" aria-label="Preview width">
          <button type="button" className={mobile ? '' : 'is-selected'} aria-pressed={!mobile} onClick={() => setMobile(false)}>Desktop</button>
          <button type="button" className={mobile ? 'is-selected' : ''} aria-pressed={mobile} onClick={() => setMobile(true)}>Mobile</button>
        </div>
      </div>}
      <div className={`db-preview-frame ${mobile ? 'is-mobile' : 'is-desktop'}`} ref={frameRef}>
        <div className="db-preview-sizer" style={{ height: scaledHeight }}>
          <div className="db-preview-scale" ref={stageRef} style={{ width: designWidth, transform: `scale(${scale})` }}>
            <div
              className={`dealer-cobranded db-appearance-preview ${mobile ? 'is-mobile' : 'is-desktop'} ${headerIsLight ? 'dealer-secondary-light' : ''} ${surface === 'homepage' ? 'home-app' : ''} ${surface === 'homepage' && dealer.logo_placement !== 'header' ? 'dealer-logo-in-hero' : ''} ${surface === 'visualizer' ? 'visualizer-app' : ''}`}
              data-appearance-mode={appearanceModeValue}
              data-preview-page={surface}
              style={style}
            >
              {surface !== 'find' && (
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
                  {surface !== 'homepage' && <button className="home-return" type="button" aria-label="Home"><HomeIcon /><span>Home</span></button>}
                  {dealer.website && <a className="dealer-website-link" href={dealer.website} onClick={stop}><span>Visit Our Website</span> <ExternalIcon /></a>}
                </div>
              </header>
              )}
              {surface === 'homepage' && (
                <main className="home-page db-home">
                  <section className="home-hero">
                    <div className="home-hero-copy">
                      {heroLogos && (
                        <div className="dealer-hero-logo">
                          <LogoPair primaryUrl={heroLogos.primaryUrl} secondaryUrl={heroLogos.showPair ? heroLogos.secondaryUrl : null} primaryHref={primaryHref} secondaryHref={secondaryHref} companyName={dealer.company_name} />
                        </div>
                      )}
                      <h1>Build a Door Made for <em>Your Home.</em></h1>
                      <p>Choose your door style, finish, glass, and hardware, then bring your vision to life by seeing how your custom door looks on your own home.</p>
                      <button className="start-building" type="button">Start Building Your Door</button>
                    </div>
                    <div className="home-hero-visual">
                      <div className="hero-composite">
                        <div className="hero-composite-stage">
                          <img className="home-entryway-image" src="/appearance-preview/hero-entryway.webp" alt="Welcoming home entryway with a customizable door preview" />
                          <img className="hero-door" src="/appearance-preview/hero-ai-01-navy.webp" alt="" />
                        </div>
                      </div>
                    </div>
                  </section>
                  <div className="home-preview-caption"><p>Made to complement your home.</p><p>Styles. Finishes. Glass. Hardware.</p></div>
                </main>
              )}
              {surface === 'find' && (
                <div className="db-find find-my-door-app dealer-cobranded" data-appearance-mode={appearanceModeValue} style={style}>
                  <header className="find-my-door-header">
                    <div className="brand">
                      {logos ? <LogoPair primaryUrl={logos.primaryUrl} secondaryUrl={logos.showPair ? logos.secondaryUrl : null} primaryHref={primaryHref} secondaryHref={secondaryHref} companyName={dealer.company_name} /> : <strong>{dealer.company_name}</strong>}
                      <span className="app-name"><strong>HGI Door Finder</strong></span>
                    </div>
                    <a className="home-return find-my-door-builder-link" href="#builder" onClick={stop}>Door Builder</a>
                  </header>
                  <ol className="find-door-steps" aria-label="Progress">
                    {['Photo', 'Style', 'Glass', 'Details', 'Door'].map((label, index) => (
                      <li key={label}><span className={index === 0 ? 'current' : 'upcoming'}><i>{index + 1}</i>{label}</span></li>
                    ))}
                  </ol>
                  <main className="find-my-door-main">
                    <div className="find-door-open">
                      <div>
                        <p className="find-door-name">HGI Door Finder</p>
                        <h1>Find the right front door for your home.</h1>
                        <p className="find-door-lead">Upload a photo of your house. We’ll suggest Home Guard doors that fit its style, then show you one on your home.</p>
                        <button className="next find-door-upload" type="button">Upload a photo of your home</button>
                        <p className="find-door-hint">Best results: daylight, straight on, whole entry in frame.</p>
                      </div>
                      <figure className="find-door-feature">
                        <img src="/appearance-preview/find-my-door/hero-craftsman-full-lite.webp" alt="Full lite front door on a craftsman house" />
                      </figure>
                    </div>
                    <section className="find-door-gallery" aria-labelledby="find-door-gallery-title">
                      <h2 id="find-door-gallery-title">Popular right now</h2>
                      <div className="find-door-marquee">
                        {['signature-f482-sidelites.webp', 'farmhouse-f482.webp', 'shaker-cottage.webp'].map((file) => (
                          <img key={file} src={`/appearance-preview/find-my-door/${file}`} alt="" />
                        ))}
                      </div>
                    </section>
                  </main>
                </div>
              )}
              {surface === 'visualizer' && (
                <main className="db-visualizer">
                  <section className="db-visualizer__card">
                    <p>Home Visualizer</p>
                    <h1>See your door on your home.</h1>
                    <p>Upload a photo of the entrance. This page uses the same header as the Door Builder.</p>
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
                  <div className="preview-view-toggle" role="group" aria-label="Preview view">
                    {(['Exterior', 'Interior', 'Both'] as const).map((item) => (
                      <button key={item} type="button" className={doorView === item ? 'active' : ''} aria-pressed={doorView === item} onClick={() => setDoorView(item)}>{item}</button>
                    ))}
                  </div>
                </div>
              </div>
              <main>
                <div className="mobile-live-preview" aria-hidden={mobile ? undefined : true}>
                  <div className="preview-view-toggle mobile-preview-view-toggle" role="group" aria-label="Preview view">
                    {(['Exterior', 'Interior', 'Both'] as const).map((item) => (
                      <button key={item} type="button" className={doorView === item ? 'active' : ''} aria-pressed={doorView === item} onClick={() => setDoorView(item)}>{item}</button>
                    ))}
                  </div>
                  {doorView === 'Both' ? (
                    <div className="preview-comparison" aria-label="Exterior and interior door previews">
                      <img src="/appearance-preview/single-door.webp" alt="Exterior door preview" />
                      <img src="/appearance-preview/single-door.webp" alt="Interior door preview" />
                    </div>
                  ) : <img src="/appearance-preview/single-door.webp" alt={`${doorView} door preview`} />}
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
      <p className="db-preview-caption">
        {surface === 'find'
          ? (shown?.headerBackground
            ? 'Find My Door is using the header color from this draft. Other pages can use a different header. Nothing is published until you save.'
            : 'Find My Door keeps a black header and gold line until a header color is saved. Homepage and Door Builder use the brand header. This preview does not change the live site.')
          : surface === 'homepage'
            ? 'The homepage header is shorter and has no color bar. The logo is in the header or above the headline, the same way the live site does it. Nothing is published until you save.'
            : 'The Door Builder and the visualizer share this header. It is 94px tall on desktop, with the brand colors and a color bar. Nothing is published until you save.'}
      </p>
    </div>
  )
}
