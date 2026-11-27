export const PASSWORD_RULE = 'Use at least 10 characters, including a letter and a number.'

export function passwordRuleError(password: string): string | null {
  if (password.length < 10 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) return PASSWORD_RULE
  return null
}

export function passwordChangeError(current: string, next: string, confirmation: string): string | null {
  if (!current) return 'Enter your current password.'
  const rule = passwordRuleError(next)
  if (rule) return rule
  if (next !== confirmation) return 'Passwords do not match.'
  if (next === current) return 'Choose a password that is different from your current password.'
  return null
}
