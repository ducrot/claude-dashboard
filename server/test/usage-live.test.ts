import { createHash } from 'node:crypto'
import { appendFileSync } from 'node:fs'
import express from 'express'
import { appendFile, mkdir, writeFile, stat, utimes, rename, rm, open } from 'node:fs/promises'
import { join } from 'node:path'
import type { Server } from 'node:http'
import { afterEach, expect, test, vi } from 'vitest'
import { paths } from '../src/config/paths.js'
import { UsageIndexer } from '../src/services/usage/indexer.js'
import { createUsageRouter } from '../src/routes/usage.js'
import { tempCacheFile } from './setup.js'

const now = () => new Date('2026-09-18T12:00:00Z')
const query = 'range=custom&from=2026-09-17&to=2026-09-18'
const line = (id: string, output = 425, extra: any = {}) => JSON.stringify({
  type: 'assistant', timestamp: '2026-09-17T10:00:00Z', sessionId: '11111111-1111-1111-1111-111111111111', ...extra,
  message: { id, model: extra.model ?? 'claude-opus-5', content: [{ type: 'tool_use', id: 'tool', name: 'Read' }], usage: { output_tokens: output, ...extra.usage } },
}) + '\n'
let sequence = 0
const servers: Server[] = []
async function endpoint(indexer: UsageIndexer) {
  const app = express().use('/api/usage', createUsageRouter(indexer))
  const server = await new Promise<Server>(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
  servers.push(server)
  const { port } = server.address() as { port: number }
  return async (suffix = `?${query}`) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/usage${suffix}`)
    expect(response.status).toBe(200)
    return response.json()
  }
}
async function fixture(content: string, options = {}) {
  const projectsDir = join(paths.projects, `live-${sequence++}`)
  await mkdir(join(projectsDir, 'p'), { recursive: true })
  const file = join(projectsDir, 'p/a.jsonl')
  await writeFile(file, content)
  const indexer = new UsageIndexer({ cacheFile: tempCacheFile(), projectsDir, clock: now, debounceMs: 1, throttleMs: 0, ...options })
  indexer.start(); await indexer.whenIdle()
  const get = await endpoint(indexer)
  const update = async (path = file) => { indexer.notifyChanged(path); await indexer.whenIdle() }
  return { projectsDir, file, indexer, get, update }
}
async function freshIndexer(projectsDir: string) {
  const fresh = new UsageIndexer({ cacheFile: tempCacheFile(), projectsDir, clock: now })
  fresh.start(); await fresh.whenIdle()
  return endpoint(fresh)
}
// Compare the complete public payload, including tools, effort, projects and session attribution.
async function freshEquivalent(f: Awaited<ReturnType<typeof fixture>>) {
  const get = await freshIndexer(f.projectsDir)
  const incremental = await f.get()
  expect(incremental.data).toEqual((await get()).data)
  for (const project of incremental.data.filterOptions.projects) {
    const suffix = `/sessions?${query}&project=${encodeURIComponent(project.projectDir)}`
    expect((await f.get(suffix)).sessions).toEqual((await get(suffix)).sessions)
  }
  for (const { row } of f.indexer.rows.values()) {
    expect(row.requests).toBeGreaterThan(0)
    expect(row.outputTokens).toBeGreaterThanOrEqual(0)
  }
  for (const row of f.indexer.toolRows.values()) expect(row.count).toBeGreaterThan(0)
}
afterEach(async () => { await Promise.all(servers.splice(0).map(s => new Promise<void>(resolve => s.close(() => resolve())))) })

test('append resumes at committed newline, merging prior response and rereading unfinished bytes exactly', async () => {
  const f = await fixture(line('one', 1))
  const before = f.indexer.status().bytesRead
  const completed = line('one', 425)
  const fragment = line('two').trimEnd()
  await appendFile(f.file, completed + fragment); await f.update()
  expect((await f.get()).data.totals).toMatchObject({ requests: 1, outputTokens: 425 })
  expect(f.indexer.status()).toMatchObject({ bytesRead: before + Buffer.byteLength(completed + fragment), fullRereads: 0 })
  await freshEquivalent(f)
  const bytes = f.indexer.status().bytesRead
  await appendFile(f.file, '\n'); await f.update()
  expect(f.indexer.status().bytesRead - bytes).toBe(Buffer.byteLength(fragment) + 1)
  expect((await f.get()).data.totals.requests).toBe(2)
  const state = f.indexer.fileStates.get('p/a.jsonl')!
  expect(state.offset).toBe(state.size)
  expect(state.headHash).toBe(createHash('sha1').update(line('one', 1) + completed + fragment + '\n').digest('hex'))
  expect(state.tailHash).toBe(state.headHash)
  expect(f.indexer.status().fullRereads).toBe(0)
  await freshEquivalent(f)
})

test.each(['shrink above offset', 'shrink below offset', 'same size', 'head', 'tail', 'replace'])('%s triggers full reread and fresh-build equivalence', async kind => {
  const padding = JSON.stringify({ padding: 'x'.repeat(9000) }) + '\n'
  const original = line('first') + padding + line('last')
  const f = await fixture(original + (kind === 'shrink above offset' ? 'x'.repeat(500) : ''))
  const prior = f.indexer.fileStates.get('p/a.jsonl')!
  let replacement = original.replace('425', '999')
  if (kind === 'shrink above offset') replacement += 'x'.repeat(100)
  if (kind === 'shrink below offset') replacement = line('first', 999)
  if (kind === 'head') replacement += line('new')
  if (kind === 'tail') replacement = line('first') + padding + line('last', 999) + line('new')
  if (kind === 'replace') { await writeFile(f.file + '.tmp', replacement); await rename(f.file + '.tmp', f.file) }
  else { await writeFile(f.file, replacement); await utimes(f.file, new Date(), new Date(prior.mtimeMs + 2000)) }
  await f.update()
  expect(f.indexer.status().fullRereads).toBe(1)
  const expected: Record<string, number> = { 'shrink below offset': 999, head: 1849, tail: 1849 }
  expect((await f.get()).data.totals.outputTokens).toBe(expected[kind] ?? 1424)
  if (kind === 'shrink above offset') expect((await stat(f.file)).size).toBeGreaterThan(prior.offset)
  if (kind === 'replace') expect((await stat(f.file)).ino).not.toBe(prior.ino)
  else expect((await stat(f.file)).ino).toBe(prior.ino)
  await freshEquivalent(f)
})

test('unchanged stat skips parsing and events; new file is indexed', async () => {
  const f = await fixture(line('one'))
  const updated = vi.fn(); f.indexer.on('updated', updated)
  const bytes = f.indexer.status().bytesRead
  await f.update()
  expect(f.indexer.status().bytesRead).toBe(bytes)
  expect(updated).not.toHaveBeenCalled()
  const newFile = join(f.projectsDir, 'p/b.jsonl')
  await writeFile(newFile, line('two')); await f.update(newFile)
  expect(updated).toHaveBeenCalledTimes(1)
  await freshEquivalent(f)
})

test('documented two-anchor boundary deliberately misses a middle rewrite on growth', async () => {
  const padding = JSON.stringify({ padding: 'x'.repeat(5000) }) + '\n'
  const f = await fixture(padding + line('middle') + padding)
  await writeFile(f.file, padding + line('middle', 999) + padding + line('new'))
  await f.update()
  expect(f.indexer.status().fullRereads).toBe(0)
  expect((await f.get()).data.totals.outputTokens).toBe(850)
  expect((await (await freshIndexer(f.projectsDir))()).data.totals.outputTokens).toBe(1424)
})

test('removal preserves shared copies, then removes all buckets and options; missing directory removes descendants only', async () => {
  const f = await fixture(line('shared'))
  const b = join(f.projectsDir, 'p/b.jsonl')
  await writeFile(b, line('shared')); await f.update(b)
  await rm(f.file); await f.update()
  expect((await f.get()).data.totals.requests).toBe(1)
  await freshEquivalent(f)
  await rm(b); await f.update(b)
  expect((await f.get()).data).toMatchObject({ totals: { requests: 0 }, models: [], projects: [], tools: [], filterOptions: { projects: [], models: [] } })
  await freshEquivalent(f)
  await writeFile(f.file, line('one')); await f.update()
  await mkdir(join(f.projectsDir, 'prefix'), { recursive: true })
  const other = join(f.projectsDir, 'prefix/b.jsonl')
  await writeFile(other, line('other')); await f.update(other)
  await rm(join(f.projectsDir, 'p'), { recursive: true }); await f.update(join(f.projectsDir, 'p'))
  expect((await f.get()).data.totals.requests).toBe(1)
  expect(f.indexer.fileStates.size).toBe(1)
  await freshEquivalent(f)
})

test.each([false, true])('processing order B first = %s preserves scalar provenance and attribution', async bFirst => {
  const a1 = line('shared', 1)
  const a2 = line('shared', 425, { timestamp: '2026-09-17T12:00:00Z', effort: 'high' })
  const b1 = line('shared', 10, { timestamp: '2026-09-17T11:00:00Z', effort: 'medium' })
  const f = await fixture(bFirst ? '' : a1)
  const b = join(f.projectsDir, 'p/b.jsonl')
  await writeFile(b, b1); await f.update(b)
  await appendFile(f.file, bFirst ? a1 + a2 : a2); await f.update()
  expect((await f.get()).data.effort.byModel[0].byEffort.medium.requests).toBe(1)
  await freshEquivalent(f)
})

test('same-size same-time speed swap replaces old byte-offset provenance and cost', async () => {
  const fast = line('shared', 425, { usage: { speed: 'fast', input_tokens: 1000000 } })
  const standard = line('shared', 425, { usage: { speed: 'standard', input_tokens: 1000000 } })
  const f = await fixture(fast + standard)
  const cost = (await f.get()).data.totals.cost.usd
  const prior = await stat(f.file)
  await writeFile(f.file, standard + fast); await utimes(f.file, new Date(), new Date(prior.mtimeMs + 2000)); await f.update()
  expect((await stat(f.file)).size).toBe(prior.size)
  expect((await f.get()).data.totals.cost.usd).toBeLessThan(cost)
  await freshEquivalent(f)
})

test('debounce coalesces paths, requeues notifications during read and throttles trailing update', async () => {
  const f = await fixture(line('one'), { debounceMs: 20, throttleMs: 100 })
  const original = (f.indexer as any).processFile.bind(f.indexer)
  let passes = 0
  const spy = vi.spyOn(f.indexer as any, 'processFile').mockImplementation(async (file: any) => {
    passes++
    const changed = await original(file)
    if (passes === 1) { await appendFile(f.file, line('three')); f.indexer.notifyChanged(f.file) }
    return changed
  })
  const times: number[] = []; f.indexer.on('updated', () => times.push(Date.now()))
  await appendFile(f.file, line('two'))
  f.indexer.notifyChanged(f.file); f.indexer.notifyChanged(f.file); await f.indexer.whenIdle()
  expect(spy).toHaveBeenCalledTimes(2)
  expect((await f.get()).data.totals.requests).toBe(3)
  await vi.waitFor(() => expect(times).toHaveLength(2))
  expect(times[1] - times[0]).toBeGreaterThanOrEqual(100)
  expect(f.indexer.status().pendingFiles).toBe(0)
  await freshEquivalent(f)
})

test('bounded read leaves bytes appended after stat for the queued pass', async () => {
  const f = await fixture(line('one'))
  const originalSize = (await stat(f.file)).size
  const handle = await open(f.file, 'r')
  // Intercept the stream creation after stat without modifying filesystem APIs globally.
  const prototype = Object.getPrototypeOf(handle)
  await handle.close()
  const create = prototype.createReadStream
  let injected = false
  const spy = vi.spyOn(prototype, 'createReadStream').mockImplementation(function(this: any, options: any) {
    const stream = create.call(this, options)
    if (!injected) {
      injected = true
      appendFileSync(f.file, line('three'))
      f.indexer.notifyChanged(f.file)
    }
    return stream
  })
  try {
    await appendFile(f.file, line('two'))
    await f.update()
    expect(f.indexer.status().bytesRead).toBe(originalSize + Buffer.byteLength(line('two') + line('three')))
    expect((await f.get()).data.totals.requests).toBe(3)
    expect(spy.mock.calls[0][0]).toMatchObject({ start: originalSize, end: originalSize + Buffer.byteLength(line('two')) - 1 })
    await freshEquivalent(f)
  } finally { spy.mockRestore() }
})


test('updating one model preserves deterministic effort payload ordering across fresh builds', async () => {
  const f = await fixture(line('one'))
  const b = join(f.projectsDir, 'p/b.jsonl')
  await writeFile(b, line('two', 425, { model: 'claude-sonnet-5' })); await f.update(b)
  await appendFile(f.file, line('one', 999)); await f.update()
  await freshEquivalent(f)
})


test('unconsumed fragments update file state without emitting an unchanged data payload', async () => {
  const f = await fixture(line('one'))
  const updated = vi.fn(); f.indexer.on('updated', updated)
  await appendFile(f.file, line('two').trimEnd()); await f.update()
  expect(updated).not.toHaveBeenCalled()
  await freshEquivalent(f)
})

test('notifications arriving during startup are drained before whenIdle resolves', async () => {
  const f = await fixture(line('one'))
  const indexer = new UsageIndexer({ cacheFile: tempCacheFile(), projectsDir: f.projectsDir, clock: now, debounceMs: 1, throttleMs: 0 })
  indexer.start()
  await appendFile(f.file, line('two')); indexer.notifyChanged(f.file)
  await indexer.whenIdle()
  expect(indexer.status().pendingFiles).toBe(0)
  expect((await (await endpoint(indexer))()).data.totals.requests).toBe(2)
})

test('equal project display names have stable filter ordering after a file update', async () => {
  const f = await fixture(line('one', 425, { cwd: '/work/same' }))
  const b = join(f.projectsDir, 'q/b.jsonl')
  await mkdir(join(b, '..'), { recursive: true })
  await writeFile(b, line('two', 425, { cwd: '/work/same' })); await f.update(b)
  await appendFile(f.file, line('one', 999, { cwd: '/work/same' })); await f.update()
  await freshEquivalent(f)
})
