import { expect, test } from 'vitest'
import { modelInfo, estimateCost, PRICE_TABLE_AS_OF } from '../src/services/usage/models.js'
import { parsePartialLine, mergePartials, classifyPath } from '../src/services/usage/transcript.js'

const names = [
  ['claude-fable-5-1', 'Fable 5.1', 'Fable'], ['claude-fable-5', 'Fable 5', 'Fable'],
  ['claude-opus-5', 'Opus 5', 'Opus'], ['claude-opus-4-8', 'Opus 4.8', 'Opus'], ['claude-opus-4-7', 'Opus 4.7', 'Opus'],
  ['claude-opus-4-6', 'Opus 4.6', 'Opus'], ['claude-opus-4-5-20251101', 'Opus 4.5', 'Opus'],
  ['claude-sonnet-5', 'Sonnet 5', 'Sonnet'], ['claude-sonnet-4-6', 'Sonnet 4.6', 'Sonnet'], ['claude-sonnet-4-5-20250929', 'Sonnet 4.5', 'Sonnet'],
  ['claude-haiku-4-5-20251001', 'Haiku 4.5', 'Haiku'], ['claude-3-5-haiku-20241022', 'Haiku 3.5', 'Haiku'],
]
test.each(names)('catalog maps %s', (modelId, displayName, family) => expect(modelInfo(modelId)).toEqual({ modelId, displayName, family }))
test('unknown names follow both patterns but never acquire a price', () => {
  expect(PRICE_TABLE_AS_OF).toBe('2026-09-17')
  for (const [id, name, family] of [['claude-opus-99-2-20260917', 'Opus 99.2', 'Opus'], ['claude-99-2-haiku-20260917', 'Haiku 99.2', 'Haiku'], ['vendor', 'vendor', 'Other'], ['claude-new-1', 'New 1', 'Other']]) {
    expect(modelInfo(id)).toMatchObject({ displayName: name, family })
    expect(estimateCost(id, '', { inputTokens: 1, outputTokens: 1, thinkingTokens: 0, cacheReadTokens: 0, cacheWrite5mTokens: 0, cacheWrite1hTokens: 0, webSearchRequests: 1 })).toBeNull()
  }
})

test('scalar provenance survives intermediate merges, absent times, chunks and byte offsets', () => {
  const line = (timestamp: unknown, model: unknown, speed: unknown, cwd: unknown) => JSON.stringify({ type: 'assistant', timestamp, cwd, sessionId: 's', agentId: 'a', gitBranch: 'main', version: '1', entrypoint: 'cli', message: { id: 'id', model, usage: { speed } } })
  const a = parsePartialLine(line('2026-09-17T10:00:00Z', null, null, '/early'), 'p/a.jsonl', 100)!
  const b = parsePartialLine(line('2026-09-17T11:00:00Z', 'claude-opus-5', 'fast', ''), 'p/b.jsonl', 0)!
  const c = parsePartialLine(line('2026-09-17T11:00:00Z', 'claude-sonnet-5', 'standard', '/later'), 'p/c.jsonl', 0)!
  const d = parsePartialLine(line(null, 'claude-haiku-4-5', 'standard', '/undated'), 'p/0.jsonl', 0)!
  const expected = mergePartials(mergePartials(a, b), mergePartials(c, d))
  for (const order of [[d, c, b, a], [b, a, d, c], [c, a, b, d]]) expect(order.reduce(mergePartials)).toEqual(expected)
  expect(expected.scalars.model).toMatchObject({ value: 'claude-opus-5', file: 'p/b.jsonl' })
  expect(expected.scalars.cwd?.value).toBe('/early')
  expect(Object.keys(expected.scalars)).toHaveLength(8)
  const earlyOffset = parsePartialLine(line('2026-09-17T11:00:00Z', 'claude-opus-5', 'standard', null), 'p/b.jsonl', 0)!
  const lateOffset = parsePartialLine(line('2026-09-17T11:00:00Z', 'claude-opus-5', 'fast', null), 'p/b.jsonl', 200)!
  expect(mergePartials(lateOffset, earlyOffset).scalars.speed?.value).toBe('standard')
  expect(classifyPath('p/agent-legacy.jsonl', a).agentType).toBe('subagent')
})

test.each([
  ['claude-fable-5-1', 10, 12.5, 20, 0.25, 50], ['claude-fable-5', 10, 12.5, 20, 1, 50],
  ['claude-opus-5', 5, 6.25, 10, 0.5, 25], ['claude-opus-4-8', 5, 6.25, 10, 0.5, 25], ['claude-opus-4-7', 5, 6.25, 10, 0.5, 25],
  ['claude-opus-4-6', 5, 6.25, 10, 0.5, 25], ['claude-opus-4-5-20251101', 5, 6.25, 10, 0.5, 25],
  ['claude-sonnet-5', 2, 2.5, 4, 0.2, 10], ['claude-sonnet-4-6', 3, 3.75, 6, 0.3, 15], ['claude-sonnet-4-5-20250929', 3, 3.75, 6, 0.3, 15],
  ['claude-haiku-4-5-20251001', 1, 1.25, 2, 0.1, 5], ['claude-3-5-haiku-20241022', 0.8, 1, 1.6, 0.08, 4],
])('prices the five classes independently for %s', (id, ...prices) => {
  const empty = { inputTokens: 0, outputTokens: 0, thinkingTokens: 0, cacheReadTokens: 0, cacheWrite5mTokens: 0, cacheWrite1hTokens: 0, webSearchRequests: 0 }
  for (const [i, field] of ['inputTokens', 'cacheWrite5mTokens', 'cacheWrite1hTokens', 'cacheReadTokens', 'outputTokens'].entries()) {
    expect(estimateCost(id as string, 'standard', { ...empty, [field]: 1e6, thinkingTokens: 1e6 })).toBe(prices[i])
  }
  const supportsFast = ['claude-opus-5', 'claude-opus-4-8'].includes(id as string)
  expect(estimateCost(id as string, 'fast', { ...empty, inputTokens: 1e6 })).toBe(supportsFast ? 10 : null)
})
