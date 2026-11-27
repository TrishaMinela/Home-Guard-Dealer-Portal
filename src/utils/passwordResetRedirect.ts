const productionResetUrl = 'https://home-guard-dealer-portal.vercel.app/auth/reset-password'

export function passwordResetRedirectUrl(): string {
  const isLocalDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  return isLocalDevelopment ? `${window.location.origin}/auth/reset-password` : productionResetUrl
}
