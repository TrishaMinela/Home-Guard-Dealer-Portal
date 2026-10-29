export type InvitationFailure = {
  code: 'invitation_rate_limited' | 'invitation_provider_failure' | 'invitation_auth_failure'
  status: 429 | 502
  message: string
}

type AuthErrorLike = { code?: unknown; status?: unknown; message?: unknown }

export function classifyInvitationFailure(error: unknown): InvitationFailure {
  const value = error && typeof error === 'object' ? error as AuthErrorLike : {}
  const code = typeof value.code === 'string' ? value.code.toLowerCase() : ''
  const status = typeof value.status === 'number' ? value.status : 0
  const message = typeof value.message === 'string' ? value.message.toLowerCase() : ''

  if (status === 429 || code.includes('rate_limit') || message.includes('rate limit')) {
    return {
      code: 'invitation_rate_limited',
      status: 429,
      message: 'Invitation email delivery is temporarily rate limited. Please try again shortly.',
    }
  }
  if (code.includes('smtp') || code.includes('email') || /smtp|mailer|sending.*email|email.*send/.test(message)) {
    return {
      code: 'invitation_provider_failure',
      status: 502,
      message: 'The invitation email provider did not accept the request. Please try again or contact support.',
    }
  }
  return {
    code: 'invitation_auth_failure',
    status: 502,
    message: 'The invitation could not be created by the authentication service. Please try again.',
  }
}
