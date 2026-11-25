const previewConfigurationErrors = new Set([
  'Dealer marketing management is not configured.',
  'Door Builder webhook management is not configured.',
  'Door Builder webhook management is not configured for HGI Portal Dev.',
  'Dealer access management is not configured.',
  'CRM integration management is not configured.',
  'CRM integration management is not configured for HGI Portal Dev.',
  'Secure webhook storage is not configured. A webhook cannot be saved until the server encryption key is available.',
  'Secure credential storage is not configured. Metadata can be reviewed, but credentials cannot be saved.',
])

export const previewConfigurationNotice = 'This preview does not include the production server configuration for this feature. The service role and encryption keys are only set for production, so nothing was saved or sent.'

export function isVercelPreviewHost(hostname: string) {
  return hostname.endsWith('.vercel.app') && hostname.includes('-git-')
}

export function explainPreviewConfiguration(message: string, hostname = typeof window === 'undefined' ? '' : window.location.hostname) {
  if (!message || !isVercelPreviewHost(hostname) || !previewConfigurationErrors.has(message)) return message
  return previewConfigurationNotice
}
