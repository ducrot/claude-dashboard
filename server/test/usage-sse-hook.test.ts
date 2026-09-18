import { expect, test, vi } from 'vitest'
const { invalidateQueries, effects } = vi.hoisted(() => ({ invalidateQueries: vi.fn(), effects: [] as (() => () => void)[] }))
vi.mock('react', () => ({ useEffect: (effect: () => () => void) => effects.push(effect), useCallback: (fn: unknown) => fn, useRef: () => ({ current: null }) }))
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries }) }))
import { useSSE } from '../../client/src/hooks/useSSE.js'

const listeners: Record<string, unknown> = {}
const windowStub = {
  addEventListener: (type: string, listener: unknown) => { listeners[type] = listener },
  removeEventListener: (type: string, listener: unknown) => {
    if (listeners[type] === listener) delete listeners[type]
  },
}

const connect = () => {
  let source: any
  vi.stubGlobal('EventSource', class {
    onmessage: any
    close = vi.fn()
    constructor(readonly url: string) { source = this }
  })
  vi.stubGlobal('window', windowStub)
  useSSE()
  const cleanup = effects.pop()!()
  return { source, cleanup }
}

test('usage SSE invalidates both usage (including sessions) and dashboard query prefixes', () => {
  const { source, cleanup } = connect()
  try {
    expect(source.url).toBe('/api/events')
    source.onmessage({ data: JSON.stringify({ type: 'usage', path: '' }) })
    expect(invalidateQueries.mock.calls).toEqual([[{ queryKey: ['usage'] }], [{ queryKey: ['stats'] }]])
    invalidateQueries.mockClear()
    source.onmessage({ data: JSON.stringify({ type: 'stats' }) })
    expect(invalidateQueries).not.toHaveBeenCalled()
    source.onmessage({ data: 'not json' })
    expect(invalidateQueries).not.toHaveBeenCalled()
    cleanup()
    expect(source.close).toHaveBeenCalled()
    expect(listeners['pagehide']).toBeUndefined()
  } finally { vi.unstubAllGlobals() }
})

test('pagehide closes the EventSource so page teardown cannot fire a spurious error', () => {
  const { source, cleanup } = connect()
  try {
    expect(listeners['pagehide']).toBeTypeOf('function')
    const pagehide = listeners['pagehide'] as (event: { persisted: boolean }) => void
    // A bfcache freeze must keep the stream: the effect never re-runs on restore.
    pagehide({ persisted: true })
    expect(source.close).not.toHaveBeenCalled()
    pagehide({ persisted: false })
    expect(source.close).toHaveBeenCalled()
    // Unmount removes the pagehide listener as well, so no listener leaks.
    cleanup()
    expect(listeners['pagehide']).toBeUndefined()
  } finally { vi.unstubAllGlobals() }
})
