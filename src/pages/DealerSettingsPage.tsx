export function DealerSettingsPage() {
  return (
    <div className="page-content">
      <header className="page-header">
        <p className="eyebrow">Account</p>
        <h1>Settings</h1>
        <p>Update your sign-in and find help for this portal.</p>
      </header>
      <section className="content-card" aria-labelledby="password-settings-heading">
        <div className="content-card__header">
          <h2 id="password-settings-heading">Password</h2>
        </div>
        <div className="settings-card__body">
          <p>To change your password, request a reset link for the email on your account. The existing reset page sends that link only after you submit it.</p>
          <p><a className="button button--outline" href="/auth/forgot-password">Reset password</a></p>
        </div>
      </section>
      <section className="content-card" aria-labelledby="help-settings-heading">
        <div className="content-card__header">
          <h2 id="help-settings-heading">Help</h2>
        </div>
        <div className="settings-card__body">
          <p>For questions about your dealership, contact your Home Guard representative.</p>
        </div>
      </section>
    </div>
  )
}
