import { afterEach, expect, test, vi } from 'vitest'
import { FileWatcher } from '../src/services/watcher.js'

afterEach(() => { vi.restoreAllMocks() })

test('more than ten change listeners on a FileWatcher emit no MaxListenersExceededWarning', () => {
  // Node calls process.emitWarning synchronously, as the listener count passes the budget.
  const emitWarning = vi.spyOn(process, 'emitWarning').mockImplementation(() => {})

  const watcher = new FileWatcher()
  // One listener per SSE connection, as routes/events.ts registers them.
  const listeners = Array.from({ length: 15 }, () => vi.fn())
  for (const listener of listeners) watcher.on('change', listener)

  watcher.emit('change', { type: 'plans', path: '/tmp/plan.md' })

  for (const listener of listeners) expect(listener).toHaveBeenCalledTimes(1)
  const maxListenerWarnings = emitWarning.mock.calls.filter(
    call => call.some(arg => String(arg).includes('MaxListeners')))
  expect(maxListenerWarnings).toHaveLength(0)
})
