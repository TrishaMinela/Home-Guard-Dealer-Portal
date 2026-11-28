import { ChangePasswordForm } from '../components/ChangePasswordForm'

type DealerSettingsPageProps = {
  email: string
}

export function DealerSettingsPage({ email }: DealerSettingsPageProps) {
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
          <ChangePasswordForm email={email} />
          <p><a href="/auth/forgot-password">Reset password</a></p>
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
