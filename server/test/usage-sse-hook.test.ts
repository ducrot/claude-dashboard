import { expect, test, vi } from 'vitest'
const { invalidateQueries, effects } = vi.hoisted(() => ({ invalidateQueries: vi.fn(), effects: [] as (() => () => void)[] }))
vi.mock('react', () => ({ useEffect: (effect: () => () => void) => effects.push(effect), useCallback: (fn: unknown) => fn, useRef: () => ({ current: null }) }))
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries }) }))
import { useSSE } from '../../client/src/hooks/useSSE.js'

test('usage SSE invalidates both usage (including sessions) and dashboard query prefixes', () => {
  let source: any
  vi.stubGlobal('EventSource', class {
    onmessage: any
    close = vi.fn()
    constructor(readonly url: string) { source = this }
  })
  try {
    useSSE()
    const cleanup = effects.pop()!()
    expect(source.url).toBe('/api/events')
    source.onmessage({ data: JSON.stringify({ type: 'usage', path: '' }) })
    expect(invalidateQueries.mock.calls).toEqual([[{ queryKey: ['usage'] }], [{ queryKey: ['stats'] }]])
    invalidateQueries.mockClear()
    source.onmessage({ data: JSON.stringify({ type: 'stats' }) })
    expect(invalidateQueries).not.toHaveBeenCalled()
    cleanup()
    expect(source.close).toHaveBeenCalled()
  } finally { vi.unstubAllGlobals() }
})
