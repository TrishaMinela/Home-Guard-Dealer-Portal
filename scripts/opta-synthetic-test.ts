import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { optaSyntheticTestCli } from '../api/_lib/optaDeliveryControl.ts'

const entry = process.argv[1]
if (entry && import.meta.url === pathToFileURL(entry).href) {
  const result = await optaSyntheticTestCli(process.argv.slice(2), process.env, async (url, init) => {
    const response = await fetch(url, init)
    return { status: response.status, text: () => response.text() }
  }, { readFile: (path) => readFile(path, 'utf8') })
  process.exit(result.exitCode)
}
