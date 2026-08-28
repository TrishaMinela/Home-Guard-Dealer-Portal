type PlaceholderPageProps = {
  title: string
}

export function PlaceholderPage({ title }: PlaceholderPageProps) {
  return (
    <div className="page-content">
      <header className="page-header">
        <p className="eyebrow">Dealer Portal</p>
        <h1>{title}</h1>
      </header>
      <section className="content-card placeholder-card">
        <h2>{title}</h2>
        <p>Coming soon.</p>
      </section>
    </div>
  )
}
