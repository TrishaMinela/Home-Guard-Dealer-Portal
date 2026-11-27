import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { passwordChangeError, passwordRuleError } from '../src/utils/passwordRules.ts'

test('password changes require the current password, a stronger new password, and a match', () => {
  assert.equal(passwordChangeError('', 'Northwind-1', 'Northwind-1'), 'Enter your current password.')
  assert.match(passwordChangeError('old-password-1', 'short1', 'short1') ?? '', /at least 10 characters/)
  assert.equal(passwordRuleError('longpassword'), 'Use at least 10 characters, including a letter and a number.')
  assert.equal(passwordChangeError('Northwind-1', 'Northwind-2', 'Northwind-3'), 'Passwords do not match.')
  assert.equal(passwordChangeError('Northwind-1', 'Northwind-1', 'Northwind-1'), 'Choose a password that is different from your current password.')
  assert.equal(passwordChangeError('Northwind-1', 'Northwind-2', 'Northwind-2'), null)
})

test('signed-in password changes recheck the current password and still offer email recovery', () => {
  const form = readFileSync('src/components/ChangePasswordForm.tsx', 'utf8')
  const settings = readFileSync('src/pages/DealerSettingsPage.tsx', 'utf8')
  assert.match(form, /signInWithPassword\(\{[\s\S]*email,[\s\S]*password: currentPassword/)
  assert.match(form, /updateUser\(\{ password \}\)/)
  assert.match(form, /resetPasswordForEmail\(email\.trim\(\), \{[\s\S]*redirectTo: passwordResetRedirectUrl\(\)/)
  assert.match(form, /Email me a reset link/)
  assert.match(settings, /href="\/auth\/forgot-password"/)
  assert.match(settings, /<ChangePasswordForm email=\{email\} \/>/)
  assert.doesNotMatch(form, /console\.(log|error)/)
})
