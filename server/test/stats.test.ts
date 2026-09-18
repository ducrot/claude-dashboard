import express from 'express'
import { mkdir, writeFile, appendFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { Server } from 'node:http'
import { afterEach, expect, test } from 'vitest'
import { paths } from '../src/config/paths.js'
import { UsageIndexer } from '../src/services/usage/indexer.js'
import { createStatsRouter } from '../src/routes/stats.js'
import { tempCacheFile } from './setup.js'

const resources: { server: Server; indexer: UsageIndexer }[] = []
let sequence = 0
const entry = (id: string, timestamp: string, model = 'claude-opus-5', output = 100, sessionId = 'parent') => ({
  type: 'assistant', timestamp, sessionId,
  message: { id, model, usage: { output_tokens: output, cache_read_input_tokens: 9000 }, content: [{ type: 'tool_use', id: `tool-${id}`, name: 'Read' }] },
})
const line = (value: unknown) => JSON.stringify(value) + '\n'
async function fixture(entries: unknown[] = [], start = true) {
  const projectsDir = join(paths.projects, `stats-${sequence++}`)
  const file = join(projectsDir, 'p/main.jsonl')
  await mkdir(join(file, '..'), { recursive: true })
  await writeFile(file, entries.map(line).join(''))
  const options = { projectsDir, cacheFile: tempCacheFile(), clock: () => new Date('2026-09-18T12:00:00'), debounceMs: 0, throttleMs: 0 }
  const indexer = new UsageIndexer(options)
  const app = express().use('/api/stats', createStatsRouter(indexer))
  const server = await new Promise<Server>(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
  resources.push({ server, indexer })
  const get = async (suffix = '') => {
    const res = await fetch(`http://127.0.0.1:${(server.address() as { port: number }).port}/api/stats${suffix}`)
    expect(res.status).toBe(200)
    return res.json()
  }
  if (start) { indexer.start(); await indexer.whenIdle() }
  return { indexer, get, file, options }
}
afterEach(async () => {
  for (const { server, indexer } of resources.splice(0)) {
    await indexer.shutdown()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})

test('stats HTTP uses deduplicated all-time totals, local hours, and a zero-filled 30-day window', async () => {
  const a = entry('a', '2026-09-18T00:30:00', 'claude-opus-5', 100)
  const { get } = await fixture([
    a, a, { ...a, message: { ...a.message, usage: { output_tokens: 300 } } },
    entry('b', '2026-09-18T00:45:00', 'claude-sonnet-5', 200),
    entry('c', '2026-08-20T23:59:00', 'claude-fable-5-1', 500, 'second'),
    ...Array.from({ length: 4 }, (_, i) => entry(`old-${i}`, '2026-08-19T04:00:00', 'old-model', 10, 'old')),
    entry('invalid', 'bad-date'),
  ])
  const stats = await get()
  expect(Object.keys(stats).sort()).toEqual(['dailyActivity', 'hourlyActivity', 'index', 'insights', 'modelUsage', 'summary'])
  expect(stats.summary).toEqual({ totalSessions: 3, totalRequests: 7, totalToolCalls: 7, totalOutputTokens: 1040, avgRequestsPerSession: 2, avgToolCallsPerSession: 2 })
  expect(await get('/summary')).toEqual(stats.summary)
  expect(stats.dailyActivity).toHaveLength(30)
  expect(stats.dailyActivity[0]).toEqual({ date: '2026-08-20', requests: 1, toolCalls: 1, sessions: 1 })
  expect(stats.dailyActivity[1]).toEqual({ date: '2026-08-21', requests: 0, toolCalls: 0, sessions: 0 })
  expect(stats.dailyActivity.at(-1)).toEqual({ date: '2026-09-18', requests: 2, toolCalls: 2, sessions: 1 })
  expect(stats.modelUsage).toEqual([
    { modelId: 'claude-fable-5-1', displayName: 'Fable 5.1', family: 'Fable', outputTokens: 500, percentage: 50 },
    { modelId: 'claude-opus-5', displayName: 'Opus 5', family: 'Opus', outputTokens: 300, percentage: 30 },
    { modelId: 'claude-sonnet-5', displayName: 'Sonnet 5', family: 'Sonnet', outputTokens: 200, percentage: 20 },
  ])
  expect(stats.hourlyActivity).toHaveLength(24)
  expect(stats.hourlyActivity[0]).toEqual({ hour: 0, requests: 2 })
  expect(stats.hourlyActivity[4]).toEqual({ hour: 4, requests: 4 })
  expect(stats.insights).toEqual({ mostActiveDay: { date: '2026-08-19', requests: 4 }, peakHour: { hour: 4, requests: 4 } })
  expect(stats.index.state).toBe('ready')
})

test('building and empty ready stats are observable without NaN averages or false insights', async () => {
  const { get, indexer } = await fixture([], false)
  expect((await get()).index.state).toBe('building')
  indexer.start(); await indexer.whenIdle()
  const stats = await get()
  expect(stats.index.state).toBe('ready')
  expect(stats.summary).toEqual({ totalSessions: 0, totalRequests: 0, totalToolCalls: 0, totalOutputTokens: 0, avgRequestsPerSession: 0, avgToolCallsPerSession: 0 })
  expect(stats.insights).toEqual({ mostActiveDay: null, peakHour: null })
  expect(stats.modelUsage).toEqual([])
})

test('hour contributions move with earlier duplicate timestamps, survive cache reload, and disappear on deletion', async () => {
  const { get, indexer, file, options } = await fixture([entry('a', '2026-09-18T10:00:00')])
  await appendFile(file, line(entry('a', '2026-09-18T09:00:00')) + line(entry('b', '2026-09-18T09:00:00')))
  indexer.notifyChanged(file); await indexer.whenIdle()
  expect([...indexer.hourRows.values()]).toEqual([{ date: '2026-09-18', hour: 9, requests: 2 }])
  expect((await get()).hourlyActivity[10].requests).toBe(0)
  await indexer.persist()
  const reloaded = new UsageIndexer(options)
  reloaded.start(); await reloaded.whenIdle()
  expect([...reloaded.hourRows]).toEqual([...indexer.hourRows])
  await reloaded.shutdown()
  await writeFile(file, line(entry('b', '2026-09-17T08:00:00')))
  indexer.notifyChanged(file); await indexer.whenIdle()
  expect([...indexer.hourRows.values()]).toEqual([{ date: '2026-09-17', hour: 8, requests: 1 }])
  await rm(file); indexer.notifyChanged(file); await indexer.whenIdle()
  expect(indexer.hourRows.size).toBe(0)
  expect((await get()).summary.totalRequests).toBe(0)
})

test('hour rows use server-local dates across UTC midnight and coalesce both DST fall-back hours', async () => {
  const { indexer, get } = await fixture([
    entry('midnight', '2026-09-17T22:30:00Z'),
    entry('dst-first', '2025-10-26T00:30:00Z'),
    entry('dst-second', '2025-10-26T01:30:00Z'),
  ])
  expect([...indexer.hourRows.values()]).toEqual([
    { date: '2026-09-18', hour: 0, requests: 1 },
    { date: '2025-10-26', hour: 2, requests: 2 },
  ])
  expect((await get()).dailyActivity.at(-1).requests).toBe(1)
})

test('cross-file duplicates count once and restore the surviving hour when the earlier source disappears', async () => {
  const { indexer, file, get } = await fixture([entry('shared', '2026-09-18T10:00:00')])
  const copy = join(file, '..', 'copy.jsonl')
  await writeFile(copy, line(entry('shared', '2026-09-18T08:00:00', 'claude-opus-5', 200)))
  indexer.notifyChanged(copy); await indexer.whenIdle()
  expect((await get()).summary).toMatchObject({ totalRequests: 1, totalToolCalls: 1, totalOutputTokens: 200 })
  expect([...indexer.hourRows.values()]).toEqual([{ date: '2026-09-18', hour: 8, requests: 1 }])
  await rm(copy); indexer.notifyChanged(copy); await indexer.whenIdle()
  expect((await get()).summary).toMatchObject({ totalRequests: 1, totalToolCalls: 1, totalOutputTokens: 100 })
  expect([...indexer.hourRows.values()]).toEqual([{ date: '2026-09-18', hour: 10, requests: 1 }])
})
