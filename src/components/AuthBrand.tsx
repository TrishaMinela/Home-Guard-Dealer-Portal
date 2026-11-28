type AuthBrandProps = {
  subtitle: string
  bordered?: boolean
}

export function AuthBrand({ subtitle, bordered = false }: AuthBrandProps) {
  return (
    <div className={`brand-lockup${bordered ? ' invite-brand' : ''}`}>
      <img className="auth-logo" src="/appearance-preview/hgi-logo-black.webp" alt="" />
      <div>
        <span className="brand-name">Home Guard Industries</span>
        <span className="brand-subtitle">{subtitle}</span>
      </div>
    </div>
  )
}
