type PlaceholderPageProps = {
  title: string
  eyebrow?: string
}

export function PlaceholderPage({
  title,
  eyebrow = 'Dealer Portal',
}: PlaceholderPageProps) {
  return (
    <div className="page-content">
      <header className="page-header">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
      </header>
      <section className="content-card placeholder-card">
        <h2>{title}</h2>
        <p>Coming soon.</p>
      </section>
    </div>
  )
}
