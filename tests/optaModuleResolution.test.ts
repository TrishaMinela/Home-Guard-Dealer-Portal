import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

test('CRM function and its runtime imports resolve after TypeScript emission', async () => {
  const out = mkdtempSync(join(tmpdir(), 'opta-runtime-'))
  try {
    execFileSync(process.execPath, [resolve('node_modules/typescript/bin/tsc'), '--ignoreConfig', '--module', 'nodenext', '--target', 'es2023', '--strict', '--skipLibCheck', '--types', 'node', '--outDir', out, 'api/dealer-crm-integrations.ts'], { stdio: 'pipe' })
    symlinkSync(resolve('node_modules'), join(out, 'node_modules'), 'dir')
    const emitted = await import(pathToFileURL(join(out, 'dealer-crm-integrations.js')).href)
    assert.equal(typeof emitted.default, 'function')
  } finally { rmSync(out, { recursive: true, force: true }) }
})
