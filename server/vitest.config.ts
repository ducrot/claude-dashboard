import { defineConfig } from 'vitest/config'

process.env.TZ = 'Europe/Berlin'

export default defineConfig({
  test: { setupFiles: ['./test/setup.ts'] },
})
