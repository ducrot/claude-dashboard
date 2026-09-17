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

afterAll(() => {
  rmSync(testHome, { recursive: true, force: true })
  if (originalHome === undefined) delete process.env.HOME
  else process.env.HOME = originalHome
})
