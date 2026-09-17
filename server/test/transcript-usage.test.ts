import { expect, test, vi } from 'vitest'
import { parseTranscriptUsageLine, TranscriptUsageAccumulator } from '../src/services/usage/transcript.js'

const line = (usage: unknown, id: unknown = 'response') => JSON.stringify({ type: 'assistant', message: { id, usage } })

test('skips non-sources and malformed JSON; filters before JSON.parse', () => {
  const parse = vi.spyOn(JSON, 'parse')
  expect(parseTranscriptUsageLine('{"type":"user"}')).toBeUndefined()
  expect(parse).not.toHaveBeenCalled()
  parse.mockRestore()
  for (const source of ['broken "assistant"', 'null', '{}',
    '{"type":"user","message":{"id":"assistant"}}',
    line({}, ''), line({}, 123), line({}, null), '{"type":"assistant","message":{}}']) {
    expect(parseTranscriptUsageLine(source)).toBeUndefined()
  }
})

test('normalizes cache breakdown, legacy cache totals, and thinking separately', () => {
  expect(parseTranscriptUsageLine(line({ input_tokens: 3, output_tokens: 4,
    cache_read_input_tokens: 5, cache_creation_input_tokens: 20,
    output_tokens_details: { thinking_tokens: 2 } }))?.usage).toEqual({
    inputTokens: 3, outputTokens: 4, cacheReadTokens: 5,
    cacheWrite5mTokens: 20, cacheWrite1hTokens: 0, thinkingTokens: 2,
  })
  for (const [total, five, hour, expected] of [[50, 10, 15, 35], [10, 30, 15, 30], [0, 0, 15, 0]]) {
    expect(parseTranscriptUsageLine(line({ cache_creation_input_tokens: total,
      cache_creation: { ephemeral_5m_input_tokens: five, ephemeral_1h_input_tokens: hour } }))?.usage)
      .toMatchObject({ cacheWrite5mTokens: expected, cacheWrite1hTokens: hour })
  }
})

test.each([undefined, null, '9', -1, true, {}, []])('invalid token values normalize to zero: %j', value => {
  const usage = parseTranscriptUsageLine(line({ input_tokens: value, output_tokens: value,
    cache_read_input_tokens: value, cache_creation_input_tokens: value,
    cache_creation: { ephemeral_5m_input_tokens: value, ephemeral_1h_input_tokens: value },
    output_tokens_details: { thinking_tokens: value } }))!.usage
  expect(Object.values(usage)).toEqual([0, 0, 0, 0, 0, 0])
})

test('non-finite numbers and absent usage normalize to zero', () => {
  const overflow = line({ input_tokens: 1, output_tokens: 1 }).replaceAll(':1', ':1e999')
  expect(parseTranscriptUsageLine(overflow)?.usage.inputTokens).toBe(0)
  expect(parseTranscriptUsageLine(overflow)?.usage.outputTokens).toBe(0)
  expect(Object.values(parseTranscriptUsageLine(line(undefined))!.usage)).toEqual([0, 0, 0, 0, 0, 0])
})

test('merges all fields by maximum independent of order and sums distinct IDs', () => {
  const sources = [
    line({ input_tokens: 20, output_tokens: 1, cache_creation_input_tokens: 40 }),
    line({ input_tokens: 10, output_tokens: 425, cache_read_input_tokens: 30,
      cache_creation: { ephemeral_1h_input_tokens: 50 }, output_tokens_details: { thinking_tokens: 100 } }),
    line({ input_tokens: 7, output_tokens: 8 }, 'other'),
  ]
  for (const order of [sources, [...sources].reverse(), [sources[1], sources[0], sources[2]]]) {
    const accumulator = new TranscriptUsageAccumulator()
    for (const source of order) accumulator.addLine(source)
    expect(accumulator.records.size).toBe(2)
    expect(accumulator.records.get('response')).toEqual({ inputTokens: 20, outputTokens: 425,
      cacheReadTokens: 30, cacheWrite5mTokens: 40, cacheWrite1hTokens: 50, thinkingTokens: 100 })
    expect(accumulator.totals()).toEqual({ totalInputTokens: 147, totalOutputTokens: 433 })
  }
})

test('assigns merged totals to the first target of each response only', () => {
  const accumulator = new TranscriptUsageAccumulator()
  const first: { inputTokens?: number; outputTokens?: number } = {}
  const later: { inputTokens?: number; outputTokens?: number } = {}
  const untargeted: { inputTokens?: number; outputTokens?: number } = {}
  accumulator.add(JSON.parse(line({ input_tokens: 10, output_tokens: 1, cache_read_input_tokens: 20 })), first)
  accumulator.add(JSON.parse(line({ output_tokens: 425 })), later)
  accumulator.add(JSON.parse(line({ input_tokens: 7, output_tokens: 8 }, 'other')))
  accumulator.add(JSON.parse('{"type":"user"}'), untargeted)
  accumulator.applyTotals()
  expect(first).toEqual({ inputTokens: 30, outputTokens: 425 })
  expect(later).toEqual({})
  expect(untargeted).toEqual({})
  expect(accumulator.totals()).toEqual({ totalInputTokens: 37, totalOutputTokens: 433 })
})
