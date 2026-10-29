import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const modal = readFileSync('src/components/ConfirmationModal.tsx', 'utf8')
const access = readFileSync('src/pages/BillingAccessManagementPage.tsx', 'utf8')
const billing = readFileSync('src/components/InternalBillingPanel.tsx', 'utf8')
const styles = readFileSync('src/App.css', 'utf8')

test('generic confirmation modal handles focus, Escape, backdrop, and loading safety', () => {
  assert.match(modal, /showModal\(\)/)
  assert.match(modal, /onCancel=/)
  assert.match(modal, /previousFocus\.current\?\.focus\(\)/)
  assert.match(modal, /event\.target !== event\.currentTarget/)
  assert.match(modal, /if \(isConfirming\) return/)
  assert.match(modal, /role="alert"/)
})

test('access revocations use the Portal modal and preserve existing API actions', () => {
  assert.doesNotMatch(access, /window\.confirm|\bconfirm\s*\(/)
  assert.match(access, /<ConfirmationModal/)
  assert.match(access, /action: 'revoke'/)
  assert.match(access, /'revoke_client'/)
  assert.match(access, /Remove Access/)
})

test('billing finalization and invoice issuance use the same modal', () => {
  assert.doesNotMatch(billing, /window\.confirm|\bconfirm\s*\(/)
  assert.match(billing, /<ConfirmationModal/)
  assert.match(billing, /finalize_month_end_billing/)
  assert.match(billing, /issue_billing_invoice/)
})

test('modal is centered and stacks actions on phone layouts', () => {
  assert.match(styles, /\.confirmation-dialog::backdrop/)
  assert.match(styles, /width: min\(480px, calc\(100vw - 32px\)\)/)
  assert.match(styles, /\.confirmation-dialog__actions \{ display: grid; grid-template-columns: 1fr;/)
})
