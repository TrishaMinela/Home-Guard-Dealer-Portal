import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const clientFiles = [
  new URL('../src/types/billing.ts', import.meta.url),
  new URL('../src/hooks/useClientBilling.ts', import.meta.url),
  new URL('../src/pages/AdminBillingPage.tsx', import.meta.url),
]

test('client billing code never requests or labels confidential pricing fields', async () => {
  const source = (await Promise.all(clientFiles.map((file) => readFile(file, 'utf8')))).join('\n')
  for (const forbidden of ['provider_cost', 'markup_basis_points', 'service margin', 'profit calculation', 'internal estimated']) {
    assert.equal(source.toLowerCase().includes(forbidden), false, `Client bundle includes forbidden billing detail: ${forbidden}`)
  }
})

test('client dashboard labels the charge as AI Usage Charges', async () => {
  const source = await readFile(new URL('../src/pages/AdminBillingPage.tsx', import.meta.url), 'utf8')
  assert.match(source, /AI Usage Charges/)
})
