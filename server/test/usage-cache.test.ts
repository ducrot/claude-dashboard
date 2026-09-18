import express from 'express'
import * as fs from 'node:fs/promises'
import type { Server } from 'node:http'
import { join } from 'node:path'
import { afterEach, expect, test, vi } from 'vitest'
import { paths } from '../src/config/paths.js'
import { UsageIndexer } from '../src/services/usage/indexer.js'
import { createUsageRouter } from '../src/routes/usage.js'
import * as cache from '../src/services/usage/cache.js'

vi.mock('node:fs/promises', async importOriginal => ({ ...await importOriginal<typeof import('node:fs/promises')>() }))
vi.mock('../src/services/usage/cache.js', async importOriginal => ({ ...await importOriginal<typeof import('../src/services/usage/cache.js')>() }))
// Same module records the indexer uses, so `fs.rename` and `cache.encodeCache` stay spyable.
const { appendFile, mkdir, readFile, rm, writeFile } = fs
const { decodeCache, encodeCache } = cache

const servers: Server[] = []
const indexers: UsageIndexer[] = []
const clock = () => new Date('2026-09-18T12:00:00Z')
const query = '?range=custom&from=2026-09-17&to=2026-09-18'
const line = (hour: number | null, effort?: string, sessionId = 'A', id = 'shared') => JSON.stringify({
  type: 'assistant', timestamp: hour === null ? null : `2026-09-17T${hour}:00:00Z`, effort, sessionId,
  version: 'v1', entrypoint: 'cli', cwd: '/work/p',
  message: { id, model: 'claude-opus-5', usage: { output_tokens: 425, speed: 'fast' }, content: [{ type: 'tool_use', id: 'tool', name: effort ?? 'Read' }] },
}) + '\n'
async function fixture() {
  const root = join(paths.claude, crypto.randomUUID())
  const projectsDir = join(root, 'projects')
  await mkdir(join(projectsDir, 'p'), { recursive: true })
  return { projectsDir, cacheFile: join(root, 'cache.json') }
}
async function start(options: Awaited<ReturnType<typeof fixture>>, ready?: (i: UsageIndexer) => void) {
  const i = new UsageIndexer({ ...options, clock, debounceMs: 0, throttleMs: 0 })
  indexers.push(i)
  if (ready) i.once('ready', () => ready(i))
  i.start(); await i.whenIdle()
  return i
}
async function payload(i: UsageIndexer) {
  const app = express().use('/api/usage', createUsageRouter(i))
  const s = await new Promise<Server>(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)) })
  servers.push(s)
  const url = `http://127.0.0.1:${(s.address() as { port: number }).port}/api/usage`
  const usage = await (await fetch(url + query)).json()
  const sessions = await (await fetch(url + '/sessions' + query + '&project=p')).json()
  return { data: usage.data, sessions: sessions.sessions }
}
/** The same fixture indexed from scratch, so a cached result can be compared against a fresh build. */
async function freshPayload(f: Awaited<ReturnType<typeof fixture>>) {
  return payload(await start({ ...f, cacheFile: f.cacheFile + '.fresh' }))
}
async function update(i: UsageIndexer, file: string, content: string, append = false) {
  await (append ? appendFile : writeFile)(join(i.projectsDir, file), content)
  i.notifyChanged(file); await i.whenIdle()
}
afterEach(async () => {
  await Promise.all(indexers.splice(0).map(i => i.shutdown()))
  await Promise.all(servers.splice(0).map(s => new Promise<void>(resolve => s.close(() => resolve()))))
})

test('unchanged restart uses zero content bytes, retains all provenance and excludes deletions before first ready', async () => {
  const f = await fixture()
  await writeFile(join(f.projectsDir, 'p/a.jsonl'), line(10, 'medium'))
  await writeFile(join(f.projectsDir, 'p/b.jsonl'), line(11, 'high', 'B', 'other'))
  const first = await start(f)
  const original = await payload(first)
  await first.shutdown()
  const second = await start(f)
  expect(second.status()).toMatchObject({ state: 'ready', bytesRead: 0, fullRereads: 0 })
  expect(await payload(second)).toEqual(original)
  expect(second.files).toEqual(first.files)
  expect(second.fileStates).toEqual(first.fileStates)
  await second.shutdown()
  await rm(join(f.projectsDir, 'p/b.jsonl'))
  let readyRequests = -1
  const third = await start(f, i => { readyRequests = [...i.rows.values()].reduce((sum, b) => sum + b.row.requests, 0) })
  expect(readyRequests).toBe(1)
  const fresh = await freshPayload(f)
  expect(await payload(third)).toEqual(fresh)
})

test.each(['corrupt', 'schema', 'structure', 'missing', 'unreadable'])('%s cache rebuilds completely while building', async kind => {
  const f = await fixture()
  await writeFile(join(f.projectsDir, 'p/a.jsonl'), line(10, 'medium'))
  const first = await start(f)
  const expected = await payload(first)
  await first.shutdown()
  if (kind === 'missing' || kind === 'unreadable') {
    await rm(f.cacheFile)
    if (kind === 'unreadable') await mkdir(f.cacheFile)
  } else {
    const raw = JSON.parse(await readFile(f.cacheFile, 'utf8'))
    if (kind === 'schema') raw.schemaVersion++
    if (kind === 'structure') raw.files[0][1].offset = -1
    await writeFile(f.cacheFile, kind === 'corrupt' ? '{oops' : JSON.stringify(raw))
  }
  const i = new UsageIndexer({ ...f, clock })
  indexers.push(i)
  const original = (i as any).processFile.bind(i)
  vi.spyOn(i as any, 'processFile').mockImplementation(async (file: any) => {
    expect(i.status().state).toBe('building')
    return original(file)
  })
  i.start(); await i.whenIdle()
  expect(i.status().bytesRead).toBeGreaterThan(0)
  expect(await payload(i)).toEqual(expected)
  if (kind === 'unreadable') await rm(f.cacheFile, { recursive: true })
})

test('cached startup reconciles changed and new files in background and emits updated', async () => {
  const f = await fixture()
  await writeFile(join(f.projectsDir, 'p/a.jsonl'), line(10))
  const first = await start(f); await first.shutdown()
  await appendFile(join(f.projectsDir, 'p/a.jsonl'), line(12, 'high'))
  await writeFile(join(f.projectsDir, 'p/b.jsonl'), line(11, 'medium', 'B'))
  const updated = vi.fn()
  const i = await start(f, i => {
    expect(i.status().bytesRead).toBe(0)
    expect([...i.rows.values()][0].row.effort).toBe('unknown')
    i.on('updated', updated)
  })
  expect(updated).toHaveBeenCalledOnce()
  expect((await payload(i)).data.effort.byModel[0].byEffort.medium.requests).toBe(1)
  expect(i.status().fullRereads).toBe(0)
  expect(await payload(i)).toEqual(await freshPayload(f))
})

test.each(['fresh', 'A-B-append', 'B-A', 'A-reload-B-reload-append', 'B-reload-A'])('effort and attribution are order independent: %s', async order => {
  const f = await fixture()
  const a1 = line(10), a2 = line(12, 'high'), b = line(11, 'medium', 'B')
  let i: UsageIndexer
  if (order === 'fresh') {
    await writeFile(join(f.projectsDir, 'p/a.jsonl'), a1 + a2)
    await writeFile(join(f.projectsDir, 'p/b.jsonl'), b)
    i = await start(f)
  } else {
    i = await start(f)
    const reload = async () => { if (order.includes('reload')) { await i.shutdown(); i = await start(f) } }
    if (order.startsWith('A')) {
      await update(i, 'p/a.jsonl', a1); await reload()
      await update(i, 'p/b.jsonl', b); await reload()
      await update(i, 'p/a.jsonl', a2, true)
    } else {
      await update(i, 'p/b.jsonl', b); await reload()
      await update(i, 'p/a.jsonl', a1 + a2)
    }
  }
  const actual = await payload(i)
  expect(actual.data.effort.byModel[0].byEffort.medium.requests).toBe(1)
  expect(actual.sessions).toHaveLength(1)
  expect(actual.sessions[0].sessionId).toBe('A')
  expect(actual).toEqual(await freshPayload(f))
  await i.shutdown()
  expect(await payload(await start(f))).toEqual(actual)
})

test.each([false, true])('equal timestamp resolves by path across reload; B first %s', async bFirst => {
  const f = await fixture()
  let i = await start(f)
  await update(i, bFirst ? 'p/b.jsonl' : 'p/a.jsonl', line(10, bFirst ? 'medium' : 'high', bFirst ? 'B' : 'A'))
  await i.shutdown(); i = await start(f)
  await update(i, bFirst ? 'p/a.jsonl' : 'p/b.jsonl', line(10, bFirst ? 'high' : 'medium', bFirst ? 'A' : 'B'))
  const result = await payload(i)
  expect(result.data.effort.byModel[0].byEffort.high.requests).toBe(1)
  expect(result.sessions[0].sessionId).toBe('A')
  expect(result).toEqual(await freshPayload(f))
})

test.each([false, true])('missing time survives reload; finite line arrives later %s', async later => {
  const f = await fixture()
  let i = await start(f)
  await update(i, 'p/a.jsonl', line(null, 'high') + line(null, 'high', 'A', 'undated'))
  if (!later) await update(i, 'p/b.jsonl', line(11, 'medium', 'B'))
  await i.shutdown()
  const raw = await readFile(f.cacheFile, 'utf8')
  const decoded = decodeCache(raw, f.projectsDir)
  expect(decoded.files.get('p/a.jsonl')!.get('shared')!.scalars.effort!.at).toBe(Infinity)
  expect(decoded.files.get('p/a.jsonl')!.get('undated')!.ts).toBeNull()
  expect(JSON.parse(raw).strings.filter((s: string) => s === 'high')).toHaveLength(1)
  expect(encodeCache(f.projectsDir, decoded.states, decoded.files)).toBe(raw)
  i = await start(f)
  if (later) {
    expect((await payload(i)).data.totals.requests).toBe(0)
    await update(i, 'p/b.jsonl', line(11, 'medium', 'B'))
  }
  const result = await payload(i)
  expect(result.data.totals.requests).toBe(1)
  expect(result.data.effort.byModel[0].byEffort.medium.requests).toBe(1)
  expect(result.sessions[0].sessionId).toBe('B')
  await i.shutdown()
  expect(await payload(await start(f))).toEqual(result)
})

test('incremental persistence is throttled and shutdown flushes unconsumed fragments', async () => {
  const f = await fixture()
  const i = await start(f)
  const before = await readFile(f.cacheFile, 'utf8')
  await update(i, 'p/a.jsonl', line(10))
  await update(i, 'p/a.jsonl', 'unfinished', true)
  expect(await readFile(f.cacheFile, 'utf8')).toBe(before)
  await i.shutdown()
  const cached = decodeCache(await readFile(f.cacheFile, 'utf8'), f.projectsDir)
  expect(cached.states.get('p/a.jsonl')).toEqual(i.fileStates.get('p/a.jsonl'))
  expect(cached.states.get('p/a.jsonl')!.size).toBeGreaterThan(cached.states.get('p/a.jsonl')!.offset)
})

test('throttled timer writes the latest state after 30 seconds, then starts a new interval', async () => {
  const f = await fixture()
  const i = await start(f)
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  try {
    const persist = vi.spyOn(i, 'persist')
    await update(i, 'p/a.jsonl', line(10))
    await vi.advanceTimersByTimeAsync(29_000)
    expect(persist).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    await vi.waitFor(() => expect(persist).toHaveBeenCalledOnce())
    await (i as any).cacheWrite
    expect(decodeCache(await readFile(f.cacheFile, 'utf8'), f.projectsDir).files).toEqual(i.files)
    await update(i, 'p/b.jsonl', line(11, 'medium', 'B'))
    await vi.advanceTimersByTimeAsync(29_000)
    expect(persist).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1000)
    await (i as any).cacheWrite
    expect(persist).toHaveBeenCalledTimes(2)
  } finally { vi.useRealTimers() }
})


test('atomic replacement exposes complete snapshots and a failed rename retains the previous cache', async () => {
  const f = await fixture()
  const i = await start(f)
  const before = await readFile(f.cacheFile, 'utf8')
  await update(i, 'p/a.jsonl', line(10))
  const rename = fs.rename
  const replacement = vi.spyOn(fs, 'rename').mockImplementation(async (source, target) => {
    expect(await readFile(target, 'utf8')).toBe(before)
    expect(decodeCache(await readFile(source, 'utf8'), f.projectsDir).files).toEqual(i.files)
    throw new Error('simulated rename failure')
  })
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
  try {
    await i.persist()
    expect(replacement).toHaveBeenCalledOnce()
    expect(await readFile(f.cacheFile, 'utf8')).toBe(before)
    replacement.mockImplementation(rename)
    await i.persist()
    expect(decodeCache(await readFile(f.cacheFile, 'utf8'), f.projectsDir).files).toEqual(i.files)
    expect((await fs.readdir(join(f.cacheFile, '..'))).filter(name => name.endsWith('.tmp'))).toEqual([])
  } finally { replacement.mockRestore(); warning.mockRestore() }
})

test('an encoding failure is logged, keeps the previous cache and leaves later writes working', async () => {
  const f = await fixture()
  const i = await start(f)
  const before = await readFile(f.cacheFile, 'utf8')
  await update(i, 'p/a.jsonl', line(10))
  // Bounded stand-in for the RangeError a stringify of an oversized index raises.
  const encode = vi.spyOn(cache, 'encodeCache').mockImplementationOnce(() => { throw new RangeError('Invalid string length') })
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
  try {
    await i.persist()
    expect(encode).toHaveBeenCalledOnce()
    expect(warning).toHaveBeenCalledWith('Unable to persist usage cache:', expect.any(RangeError))
    expect(await readFile(f.cacheFile, 'utf8')).toBe(before)
    await i.persist()
    expect(decodeCache(await readFile(f.cacheFile, 'utf8'), f.projectsDir).files).toEqual(i.files)
    expect((await fs.readdir(join(f.cacheFile, '..'))).filter(name => name.endsWith('.tmp'))).toEqual([])
  } finally { encode.mockRestore(); warning.mockRestore() }
})
