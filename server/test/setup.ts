import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll } from 'vitest'

const originalHome = process.env.HOME
const testHome = mkdtempSync(join(tmpdir(), 'dashboard-test-'))
process.env.HOME = testHome

// Fixtures are written under the resolved home; abort rather than touch the real ~/.claude.
if (homedir() !== testHome) {
  throw new Error(`Home override failed: tests would write to ${homedir()}`)
}

// Resolved lazily: a static `paths` import would run before the home override above.
export const tempCacheFile = () => join(homedir(), '.claude', `cache-${randomUUID()}.json`)

afterAll(() => {
  rmSync(testHome, { recursive: true, force: true })
  if (originalHome === undefined) delete process.env.HOME
  else process.env.HOME = originalHome
})
