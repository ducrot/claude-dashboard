import { expect, test, vi } from 'vitest'
const { watch, watcher } = vi.hoisted(() => {
  const watcher = { on: vi.fn(), close: vi.fn() }
  return { watcher, watch: vi.fn(() => watcher) }
})
vi.mock('chokidar', () => ({ watch }))
import { FileWatcher } from '../src/services/watcher.js'
import { paths } from '../src/config/paths.js'

test('stats cache is neither watched nor emitted as a change event', () => {
  const service = new FileWatcher()
  const changes = vi.fn()
  service.on('change', changes)
  service.start()
  try {
    expect(watch.mock.calls[0][0].some((path: string) => path.includes('stats-cache'))).toBe(false)
    const onChange = watcher.on.mock.calls.find(([event]) => event === 'change')![1]
    onChange(`${paths.claude}/stats-cache.json`)
    expect(changes).not.toHaveBeenCalled()
    onChange(`${paths.plans}/plan.md`)
    expect(changes).toHaveBeenCalledWith({ type: 'plans', path: `${paths.plans}/plan.md` })
  } finally { service.stop() }
})
