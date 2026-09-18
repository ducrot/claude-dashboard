import express from 'express'
import { mkdir, writeFile, chmod } from 'node:fs/promises'
import { join } from 'node:path'
import type { Server } from 'node:http'
import { afterEach, expect, test, vi } from 'vitest'
import { paths } from '../src/config/paths.js'
import { UsageIndexer } from '../src/services/usage/indexer.js'
import { createUsageRouter } from '../src/routes/usage.js'
import sessions from '../src/routes/sessions.js'
import { tempCacheFile } from './setup.js'

const servers: Server[] = []
let sequence = 0
const now = () => new Date('2026-09-17T12:00:00Z')
const entry = (id: string, usage: object = {}, extra: any = {}) => ({
  type: 'assistant', timestamp: '2026-09-17T10:00:00Z', sessionId: 'parent', ...extra,
  message: { id, model: 'claude-opus-5', content: [], usage, ...extra.message },
})
async function fixture(files: Record<string, unknown[]>, start = true, root?: string) {
  const projectsDir = root ?? join(paths.projects, `fixture-${sequence++}`)
  for (const [file, lines] of Object.entries(files)) {
    await mkdir(join(projectsDir, file, '..'), { recursive: true })
    await writeFile(join(projectsDir, file), lines.map(v => typeof v === 'string' ? v : JSON.stringify(v)).join('\n') + '\n')
  }
  const indexer = new UsageIndexer({ cacheFile: tempCacheFile(), projectsDir, clock: now })
  const app = express().use('/api/usage', createUsageRouter(indexer)).use('/api/sessions', sessions)
  const server = await new Promise<Server>(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
  servers.push(server)
  const address = server.address() as { port: number }
  const get = async (query = '', path = '/api/usage') => {
    const res = await fetch(`http://127.0.0.1:${address.port}${path}${query ? '?' + query : ''}`)
    return { status: res.status, ...await res.json() }
  }
  if (start) { indexer.start(); await indexer.whenIdle() }
  return { indexer, get }
}
afterEach(async () => { await Promise.all(servers.splice(0).map(s => new Promise<void>(resolve => s.close(() => resolve())))) })

test('HTTP globally deduplicates streamed responses and excludes unusable records', async () => {
  const { get } = await fixture({
    'p/a.jsonl': [entry('one', { output_tokens: 1 }), entry('one', { output_tokens: 1 }), entry('one', { output_tokens: 400, cache_read_input_tokens: 900 }), 'malformed "assistant"', entry('synthetic', {}, { message: { model: '<synthetic>' } }), entry('missing', {}, { message: { model: null } }), entry('undated', {}, { timestamp: null })],
    'p/b.jsonl': [entry('one', { output_tokens: 425, cache_read_input_tokens: 800 }, { sessionId: 'copy' })],
  })
  const result = await get()
  expect(result.status).toBe(200)
  expect(result.data.totals).toMatchObject({ requests: 1, sessions: 1, outputTokens: 425, cacheReadTokens: 900 })
  expect(result.data.models[0].sessions).toBe(1)
})

test('HTTP exposes token arithmetic and standard, fast, unknown and web-search prices', async () => {
  const { get } = await fixture({ 'p/a.jsonl': [
    entry('arithmetic', { input_tokens: 10, output_tokens: 300, output_tokens_details: { thinking_tokens: 120 }, cache_read_input_tokens: 1000, cache_creation_input_tokens: 70, cache_creation: { ephemeral_5m_input_tokens: 50, ephemeral_1h_input_tokens: 20 } }),
    entry('fast', { speed: 'fast', input_tokens: 10 }, { timestamp: '2026-09-16T10:00:00Z' }),
    entry('fast', { speed: 'standard', input_tokens: 10 }, { timestamp: '2026-09-16T10:00:00Z' }),
    entry('fallback', { cache_creation_input_tokens: 70 }, { timestamp: '2026-09-15T10:00:00Z' }),
    entry('fable', { cache_read_input_tokens: 1000000, server_tool_use: { web_search_requests: 2, web_fetch_requests: 3 } }, { message: { model: 'claude-fable-5-1' } }),
    entry('sonnet-fast', { speed: 'fast', output_tokens: 10 }, { message: { model: 'claude-sonnet-5' } }),
    entry('unknown', { output_tokens: 10 }, { message: { model: 'claude-opus-99' } }),
  ] })
  const single = await get('range=custom&from=2026-09-17&to=2026-09-17&model=claude-opus-5')
  expect(single.data.totals).toMatchObject({ outputTokens: 300, thinkingTokens: 120, inputTokensIncludingCache: 1080, totalTokens: 1380 })
  expect(single.data.models[0].costUsd).toBeCloseTo(0.0085625, 10)
  const fast = await get('range=custom&from=2026-09-16&to=2026-09-16')
  expect(fast.data.models[0].costUsd).toBeCloseTo(0.0001, 10)
  const fallback = await get('range=custom&from=2026-09-15&to=2026-09-15')
  expect(fallback.data.totals).toMatchObject({ cacheWrite5mTokens: 70, cacheWrite1hTokens: 0 })
  expect(fallback.data.models[0].costUsd).toBeCloseTo(0.0004375, 10)
  const all = await get()
  expect(all.data.models.find((m: any) => m.modelId === 'claude-fable-5-1').costUsd).toBeCloseTo(0.27, 10)
  expect(all.data.totals.cost.unpricedRequests).toBe(2)
  expect(all.data.totals.cost.unpricedModels.sort()).toEqual(['claude-opus-99', 'claude-sonnet-5'])
  expect(all.data.models.find((m: any) => m.modelId === 'claude-sonnet-5').costUsd).toBeNull()
  expect(all.data.series.at(-1).byModel['claude-opus-99'].costUsd).toBeNull()
})

test('building and missing directory are observable over HTTP', async () => {
  const { get, indexer } = await fixture({}, false)
  expect(await get()).toMatchObject({ status: 200, index: { state: 'building' }, data: null })
  indexer.start(); await indexer.whenIdle()
  expect(await get()).toMatchObject({ index: { state: 'ready', filesTotal: 0, skippedFiles: 0 }, data: { totals: { requests: 0 } } })
})

test('filters, coherent session attribution, recursive agents and global filter options', async () => {
  const uuid = '11111111-1111-1111-1111-111111111111'
  const { get } = await fixture({
    [`p/${uuid}.jsonl`]: [entry('main', {}, { sessionId: uuid, cwd: '/work/my-project' })],
    [`p/${uuid}/subagents/agent-a.jsonl`]: [entry('sub', {}, { sessionId: undefined })],
    [`p/${uuid}/subagents/workflows/w/agent-b.jsonl`]: [entry('workflow', {}, { sessionId: uuid })],
    'p/agent-legacy.jsonl': [entry('legacy', {}, { sessionId: uuid })],
    'p/sidechain.jsonl': [entry('side', {}, { sessionId: uuid, isSidechain: true })],
    'q/main.jsonl': [entry('sonnet', {}, { message: { model: 'claude-sonnet-5' }, cwd: '/work/q' })],
    'q/sessions-index.json': [JSON.stringify({ originalPath: '/preferred/name' })],
  })
  expect((await get('project=p')).data.totals).toMatchObject({ requests: 5, sessions: 1, subagent: { requests: 4 } })
  expect((await get('agent=subagent')).data.totals.requests).toBe(4)
  expect((await get('agent=main')).data.totals.requests).toBe(2)
  expect((await get('family=sonnet')).data.totals.requests).toBe(1)
  const overridden = await get('family=sonnet&model=claude-opus-5')
  expect(overridden.data.totals.requests).toBe(5)
  expect(overridden.data.filterOptions.models).toHaveLength(2)
  expect(overridden.data.filterOptions.projects).toEqual(expect.arrayContaining([
    expect.objectContaining({ projectDir: 'p', projectPath: '/work/my-project', projectName: 'my-project' }),
    expect.objectContaining({ projectDir: 'q', projectPath: '/preferred/name', projectName: 'name' }),
  ]))
  for (const query of ['project=unknown', 'model=unknown']) expect((await get(query)).data.totals.requests).toBe(0)
})

test('local midnight, DST, Monday weeks and empty bucket boundaries', async () => {
  const { get } = await fixture({ 'p/a.jsonl': [entry('midnight', {}, { timestamp: '2026-09-16T22:30:00Z' }), entry('dst', {}, { timestamp: '2026-03-28T23:30:00Z' })] })
  const day = await get('range=custom&from=2026-09-16&to=2026-09-17')
  expect(day.data.series.map((s: any) => s.bucket)).toEqual(['2026-09-16', '2026-09-17'])
  expect(day.data.series[0].byModel['claude-opus-5'].requests).toBe(0)
  expect(day.data.series[1].byModel['claude-opus-5'].requests).toBe(1)
  expect((await get('range=custom&from=2026-03-29&to=2026-03-29')).data.totals.requests).toBe(1)
  expect((await get('range=custom&from=2026-09-16&to=2026-09-22&groupBy=week')).data.series.map((s: any) => s.bucket)).toEqual(['2026-09-14', '2026-09-21'])
  expect((await get('range=year&groupBy=month')).data.series.map((s: any) => s.bucket)).toEqual(Array.from({ length: 9 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`))
})

test('all presets and invalid query values through HTTP', async () => {
  const { get } = await fixture({})
  for (const [range, from, to] of [
    ['7d', '2026-09-11', '2026-09-17'], ['30d', '2026-08-19', '2026-09-17'], ['90d', '2026-06-20', '2026-09-17'],
    ['this-month', '2026-09-01', '2026-09-17'], ['last-month', '2026-08-01', '2026-08-31'], ['year', '2026-01-01', '2026-09-17'],
  ]) expect((await get(`range=${range}`)).query).toMatchObject({ range, from, to })
  for (const query of ['range=bad', 'groupBy=bad', 'family=other', 'agent=bad', 'range=custom', 'range=custom&from=2026-02-30&to=2026-03-01', 'range=custom&from=2026-09-18&to=2026-09-17', 'range=custom&from=bad&to=2026-09-17', 'model=a&model=b']) {
    expect(await get(query), query).toMatchObject({ status: 400, error: expect.any(String) })
  }
})

test('copied history is local in detail pages and globally unique in Usage', async () => {
  const p = 'comparison'
  const ids = ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222']
  const { get } = await fixture(Object.fromEntries(ids.map(id => [`${p}/${id}.jsonl`, [entry('copy', { output_tokens: 425 }, { sessionId: id })]])), true, paths.projects)
  for (const id of ids) expect((await get('', `/api/sessions/${p}/${id}`)).totalOutputTokens).toBe(425)
  expect((await get('project=comparison')).data.totals).toMatchObject({ requests: 1, outputTokens: 425, sessions: 1 })
})

test('earlier timestamp controls the whole attribution tuple, scalar path ties control price', async () => {
  const { get } = await fixture({
    'b/agent-copy.jsonl': [entry('same', { speed: 'fast', input_tokens: 1000000 }, { sessionId: 'copy', timestamp: '2026-09-17T11:00:00Z' })],
    'a/main.jsonl': [entry('same', { speed: 'standard', input_tokens: 10 }, { sessionId: 'original', timestamp: '2026-09-17T10:00:00Z' })],
    'c/late.jsonl': [entry('tie', { speed: 'standard', input_tokens: 1000000 })],
    'c/early.jsonl': [entry('tie', { speed: 'fast', input_tokens: 10 })],
  })
  expect((await get('project=b')).data.totals.requests).toBe(0)
  expect((await get('project=a')).data.totals).toMatchObject({ requests: 1, sessions: 1, subagent: { requests: 0 }, cost: { usd: 5 } })
  expect((await get('project=c')).data.models[0].costUsd).toBe(10)
})


test('unreadable files are skipped once and the rest of the index becomes ready', async () => {
  const { get, indexer } = await fixture({ 'p/good.jsonl': [entry('good')], 'p/unreadable.jsonl': [entry('bad')] }, false)
  const file = join(indexer.projectsDir, 'p/unreadable.jsonl')
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
  await chmod(file, 0)
  try {
    indexer.start(); indexer.start(); await indexer.whenIdle()
    expect(await get()).toMatchObject({ index: { state: 'ready', filesTotal: 2, filesIndexed: 2, skippedFiles: 1, pendingFiles: 0 }, data: { totals: { requests: 1 } } })
    expect(warning).toHaveBeenCalledTimes(1)
  } finally { await chmod(file, 0o600); warning.mockRestore() }
})

test('empty and arbitrary raw model ids cannot access object prototypes', async () => {
  const { get } = await fixture({ 'p/a.jsonl': [entry('proto', {}, { message: { model: '__proto__' } }), entry('constructor', {}, { message: { model: 'constructor' } })] })
  expect((await get()).data.totals.cost.unpricedRequests).toBe(2)
  expect((await get('model=__proto__')).data.models[0]).toMatchObject({ modelId: '__proto__', displayName: '__proto__', family: 'Other', costUsd: null })
})

test('a later file replaces the old date, model and attribution contribution without leaving phantom rows', async () => {
  const { get } = await fixture({
    'a/main.jsonl': [entry('moving', { output_tokens: 400 }, { timestamp: '2026-09-17T10:00:00Z' })],
    'b/agent-copy.jsonl': [entry('moving', { output_tokens: 425 }, { timestamp: '2026-09-16T10:00:00Z', message: { model: 'claude-sonnet-5' } })],
  })
  const result = await get('range=custom&from=2026-09-16&to=2026-09-17')
  expect(result.data.totals).toMatchObject({ requests: 1, outputTokens: 425, subagent: { requests: 1 } })
  expect(result.data.filterOptions.models).toEqual([{ modelId: 'claude-sonnet-5', displayName: 'Sonnet 5', family: 'Sonnet' }])
  expect(result.data.filterOptions.projects.map((p: any) => p.projectDir)).toEqual(['b'])
  expect(result.data.series[0].byModel['claude-sonnet-5'].requests).toBe(1)
  expect(result.data.series[1].byModel['claude-sonnet-5'].requests).toBe(0)
  expect((await get('project=a')).data.totals.requests).toBe(0)
})

test('discovery errors are reported as error status without rejecting whenIdle', async () => {
  const { get, indexer } = await fixture({}, false)
  await mkdir(join(indexer.projectsDir, '..'), { recursive: true })
  await writeFile(indexer.projectsDir, 'not a directory')
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    indexer.start(); await indexer.whenIdle()
    expect(await get()).toMatchObject({ status: 200, index: { state: 'error' }, data: { totals: { requests: 0 } } })
    expect(error).toHaveBeenCalledTimes(1)
  } finally { error.mockRestore() }
})

test('stream chunk boundaries, UTF-8 and incomplete trailing lines preserve first-line scalar provenance', async () => {
  const { get, indexer } = await fixture({ 'p/main.jsonl': [
    entry('stream', { output_tokens: 1, speed: 'standard' }, { cwd: '/work/é', padding: '漢'.repeat(30000) }),
    entry('stream', { output_tokens: 1, speed: 'fast' }),
    entry('stream', { output_tokens: 425 }),
  ] }, false)
  const { appendFile } = await import('node:fs/promises')
  await appendFile(join(indexer.projectsDir, 'p/main.jsonl'), JSON.stringify(entry('incomplete', { output_tokens: 999 })))
  indexer.start(); await indexer.whenIdle()
  const result = await get()
  expect(result.data.totals).toMatchObject({ requests: 1, outputTokens: 425 })
  expect(result.data.models[0].costUsd).toBeCloseTo(425 * 25 / 1e6, 10)
  expect(result.data.filterOptions.projects[0].projectPath).toBe('/work/é')
})

test('first and last use and bucket edges use effective response times inside the range', async () => {
  const { get } = await fixture({
    'p/a.jsonl': [entry('first', {}, { timestamp: '2026-09-17T10:00:00Z' }), entry('last', {}, { timestamp: '2026-09-17T11:00:00Z' }), entry('outside', {}, { timestamp: '2026-09-14T10:00:00Z' })],
    'p/b.jsonl': [entry('first', {}, { timestamp: '2026-09-17T09:00:00Z' })],
  })
  const result = await get('range=custom&from=2026-09-16&to=2026-09-17&groupBy=week')
  expect(result.data.models[0]).toMatchObject({ requests: 2, firstUsedAt: '2026-09-17T09:00:00.000Z', lastUsedAt: '2026-09-17T11:00:00.000Z' })
  expect(result.data.series[0]).toMatchObject({ bucket: '2026-09-14', byModel: { 'claude-opus-5': { requests: 2 } } })
})

test('project matrix totals, model cells and transcript link flags honour every usage filter', async () => {
  const uuid = '11111111-1111-1111-1111-111111111111'
  const { get } = await fixture({
    [`p/${uuid}.jsonl`]: [entry('main', { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 30, cache_creation: { ephemeral_5m_input_tokens: 40, ephemeral_1h_input_tokens: 50 }, output_tokens_details: { thinking_tokens: 5 } }, { sessionId: uuid, cwd: '/work/p' })],
    [`p/${uuid}/subagents/agent-a.jsonl`]: [entry('sub', { output_tokens: 7 }, { sessionId: uuid, message: { model: 'claude-sonnet-5' } })],
    'q/agent-only.jsonl': [entry('unknown', { output_tokens: 3 }, { message: { model: '__proto__' } })],
    'q/sessions-index.json': [JSON.stringify({ originalPath: '/preferred/q' })],
    'r/non-session.jsonl': [entry('old', { output_tokens: 999 }, { timestamp: '2026-08-01T10:00:00Z' })],
  })
  const result = await get()
  expect(result.data.projects).toHaveLength(2)
  const p = result.data.projects.find((row: any) => row.projectDir === 'p')
  expect(p).toMatchObject({ projectName: 'p', projectPath: '/work/p', hasSessions: true, requests: 2, inputTokens: 10, outputTokens: 27, totalTokens: 157, cacheReadTokens: 30, cacheWrite5mTokens: 40, cacheWrite1hTokens: 50, thinkingTokens: 5,
    byModel: { 'claude-opus-5': { requests: 1, outputTokens: 20, totalTokens: 150 }, 'claude-sonnet-5': { requests: 1, outputTokens: 7, totalTokens: 7 } } })
  expect(p.costUsd).toBeCloseTo(p.byModel['claude-opus-5'].costUsd + p.byModel['claude-sonnet-5'].costUsd)
  expect(result.data.projects.find((row: any) => row.projectDir === 'q')).toMatchObject({ projectPath: '/preferred/q', hasSessions: false, costUsd: null, byModel: { ['__proto__']: { requests: 1, costUsd: null } } })
  for (const [query, project, requests, output] of [
    ['project=p', 'p', 2, 27], ['family=sonnet', 'p', 1, 7], ['family=sonnet&model=claude-opus-5', 'p', 1, 20],
    ['agent=main', 'p', 1, 20], ['project=p&agent=subagent', 'p', 1, 7],
    ['range=custom&from=2026-08-01&to=2026-08-01', 'r', 1, 999],
  ]) expect((await get(query as string)).data.projects).toEqual([expect.objectContaining({ projectDir: project, requests, outputTokens: output })])
  expect((await get('project=missing')).data.projects).toEqual([])
})

test('session drilldown combines main and subagents, exposes metrics, sorts and uses current filters', async () => {
  const uuid = '11111111-1111-1111-1111-111111111111'
  const { get } = await fixture({
    [`p/${uuid}.jsonl`]: [entry('main', { input_tokens: 10, output_tokens: 20 }, { sessionId: uuid })],
    [`p/${uuid}/subagents/agent-a.jsonl`]: [entry('sub', { output_tokens: 30 }, { sessionId: undefined, timestamp: '2026-09-17T11:00:00Z', message: { model: 'claude-sonnet-5' } })],
    'p/agent-orphan.jsonl': [entry('orphan', { output_tokens: 70 }, { sessionId: 'orphan', message: { model: 'unknown' } })],
    'q/main.jsonl': [entry('other-project', { output_tokens: 999 })],
  })
  const sessions = async (query = '') => (await get(`project=p&${query}`, '/api/usage/sessions')).sessions
  const rows = await sessions()
  expect(rows).toHaveLength(2)
  expect(rows[0]).toMatchObject({ sessionId: 'orphan', hasMainTranscript: false, costUsd: null })
  expect(rows[1]).toEqual({ sessionId: uuid, firstAt: '2026-09-17T10:00:00.000Z', lastAt: '2026-09-17T11:00:00.000Z', models: ['claude-opus-5', 'claude-sonnet-5'], requests: 2, subagentRequests: 1, outputTokens: 50, totalTokens: 60, costUsd: expect.any(Number), hasMainTranscript: true })
  expect(rows[1].costUsd).toBeCloseTo(0.001)
  expect(await sessions('agent=main')).toEqual([expect.objectContaining({ sessionId: uuid, requests: 1, subagentRequests: 0, outputTokens: 20 })])
  expect(await sessions('family=sonnet')).toEqual([expect.objectContaining({ requests: 1, outputTokens: 30 })])
  expect(await sessions('family=sonnet&model=claude-opus-5')).toEqual([expect.objectContaining({ requests: 1, outputTokens: 20 })])
  expect(await sessions('range=custom&from=2026-09-16&to=2026-09-16')).toEqual([])
  expect(await sessions('limit=1')).toEqual([rows[0]])
  expect((await get('project=missing', '/api/usage/sessions')).sessions).toEqual([])
})

test('session attribution uses earliest response time and then path, independent of later effort', async () => {
  const { get } = await fixture({
    'p/a.jsonl': [entry('effort', {}, { sessionId: 'a', timestamp: '2026-09-17T10:00:00Z' }), entry('effort', { output_tokens: 30 }, { sessionId: 'a', timestamp: '2026-09-17T12:00:00Z', effort: 'high' }), entry('tie', {}, { sessionId: 'a' })],
    'p/b.jsonl': [entry('effort', {}, { sessionId: 'b', timestamp: '2026-09-17T11:00:00Z', effort: 'medium' }), entry('tie', {}, { sessionId: 'b' }), entry('earlier', {}, { sessionId: 'b', timestamp: '2026-09-17T11:00:00Z' })],
    'p/c.jsonl': [entry('earlier', {}, { sessionId: 'c', timestamp: '2026-09-17T09:00:00Z' })],
  })
  expect((await get('project=p', '/api/usage/sessions')).sessions).toEqual([
    expect.objectContaining({ sessionId: 'a', requests: 2, outputTokens: 30 }),
    expect.objectContaining({ sessionId: 'c', requests: 1 }),
  ])
})

test('sessions validate required project, shared filters and bounded integer limit; report building status', async () => {
  const { get, indexer } = await fixture({ 'p/a.jsonl': Array.from({ length: 105 }, (_, i) => entry(`id-${i}`, { output_tokens: i }, { sessionId: `session-${i}` })) }, false)
  expect(await get('project=p', '/api/usage/sessions')).toMatchObject({ status: 200, index: { state: 'building' }, sessions: [] })
  indexer.start(); await indexer.whenIdle()
  expect((await get('project=p', '/api/usage/sessions')).sessions).toHaveLength(20)
  expect((await get('project=p&limit=100', '/api/usage/sessions')).sessions).toHaveLength(100)
  for (const query of ['', 'project=', 'project=p&project=q', ...['0', '-1', '101', '1.5', 'abc', '', '1&limit=2'].map(limit => `project=p&limit=${limit}`), ...['range=bad', 'agent=bad', 'family=bad', 'groupBy=bad', 'model=a&model=b', 'range=custom', 'range=custom&from=2026-09-18&to=2026-09-17'].map(q => `project=p&${q}`)]) {
    expect(await get(query, '/api/usage/sessions'), query).toMatchObject({ status: 400, error: expect.any(String) })
  }
})

test('transcript link flags use indexed paths even when the main file has no usable responses', async () => {
  const uuid = '11111111-1111-1111-1111-111111111111'
  const { get } = await fixture({
    [`p/${uuid}.jsonl`]: [],
    [`p/${uuid}/subagents/agent-a.jsonl`]: [entry('nested', {}, { sessionId: uuid })],
    'q/main.jsonl': [entry('non-uuid', {}, { sessionId: 'main' })],
    [`q/${uuid}/subagents/agent-a.jsonl`]: [entry('no-main', {}, { sessionId: uuid })],
  })
  expect((await get('project=p&agent=subagent')).data.projects[0].hasSessions).toBe(true)
  expect((await get('project=q')).data.projects[0].hasSessions).toBe(false)
  expect((await get('project=p', '/api/usage/sessions')).sessions[0].hasMainTranscript).toBe(true)
  expect((await get('project=q', '/api/usage/sessions')).sessions).toEqual(expect.arrayContaining([
    expect.objectContaining({ sessionId: 'main', hasMainTranscript: true }),
    expect.objectContaining({ sessionId: uuid, hasMainTranscript: false }),
  ]))
})

const tool = (id: string, name: string) => ({ type: 'tool_use', id, name, input: {} })
test('tools dedupe streamed blocks and copies, group MCP session unions and replace contributions', async () => {
  const search = 'mcp__claude_ai_Gmail__search_threads'
  const read = 'mcp__claude_ai_Gmail__read_thread'
  const { get } = await fixture({
    'p/a.jsonl': [entry('stream', { output_tokens: 1 }), entry('stream', { output_tokens: 1 }, { message: { content: [tool('one', search)] } }), entry('stream', { output_tokens: 425 }, { message: { content: [tool('one', search)] } }), entry('second', {}, { message: { content: [tool('two', read), tool('three', 'Read')] } })],
    'p/b.jsonl': [entry('stream', {}, { message: { content: [tool('one', 'Wrong')] } }), entry('other-session', {}, { sessionId: 'other', message: { content: [tool('four', search)] } })],
  })
  const { data } = await get()
  expect(data.totals).toMatchObject({ requests: 3, outputTokens: 425 })
  expect(data.tools).toEqual([
    { name: search, mcpServer: 'claude_ai_Gmail', count: 2, sessions: 2 },
    ...[{ name: read, mcpServer: 'claude_ai_Gmail', count: 1, sessions: 1 }, { name: 'Read', mcpServer: null, count: 1, sessions: 1 }].sort((a, b) => a.name.localeCompare(b.name)),
  ])
  expect(data.toolsByMcp).toEqual([{ name: 'claude_ai_Gmail', mcpServer: 'claude_ai_Gmail', count: 3, sessions: 2 }, { name: 'Read', mcpServer: null, count: 1, sessions: 1 }])
})

test('effort candidates retain independent provenance, fallback, unknown and arbitrary keys', async () => {
  const { get } = await fixture({
    'p/a.jsonl': [entry('ordered', {}, { timestamp: '2026-09-17T09:00:00Z' }), entry('ordered', { output_tokens: 425 }, { timestamp: '2026-09-17T11:00:00Z', effort: 'high' }), entry('tie', {}, { effort: 'high' }), entry('unknown'), entry('fallback', {}, { perTurnEffort: 'low' }), entry('raw', {}, { effort: '__proto__' }), entry('preferred', {}, { effort: 'max', perTurnEffort: 'low' }), entry('present', {}, { timestamp: '2026-09-17T09:00:00Z' }), entry('present', {}, { timestamp: null, effort: 'xhigh' })],
    'p/b.jsonl': [entry('ordered', {}, { effort: 'medium' }), entry('tie', {}, { effort: 'medium' })],
  })
  const { data } = await get('range=custom&from=2026-09-16&to=2026-09-17')
  const levels = data.effort.byModel[0].byEffort
  for (const key of ['low', 'medium', 'high', 'xhigh', 'max', 'unknown', '__proto__']) expect(levels[key].requests, key).toBe(1)
  expect(levels.medium).toMatchObject({ outputTokens: 425, totalTokens: 425, costUsd: 0.010625 })
  expect(data.effort.series[0].byEffort.medium.requests).toBe(0)
  expect(data.effort.series[1].byEffort).toEqual(levels)
})

test('tools and effort follow date, project, family, overriding model and agent filters', async () => {
  const { get } = await fixture({
    'p/main.jsonl': [entry('main', { output_tokens: 20 }, { effort: 'medium', message: { content: [tool('a', 'Read')] } })],
    'q/agent-sub.jsonl': [entry('sub', { output_tokens: 10 }, { effort: 'high', message: { model: 'claude-sonnet-5', content: [tool('b', 'mcp__server__call')] } })],
    'r/main.jsonl': [entry('old', {}, { timestamp: '2026-08-01T10:00:00Z', effort: 'low', message: { content: [tool('c', 'Bash')] } })],
  })
  for (const query of ['project=p', 'family=opus', 'family=sonnet&model=claude-opus-5', 'agent=main']) {
    const { data } = await get(query)
    expect(data.tools).toEqual([{ name: 'Read', mcpServer: null, count: 1, sessions: 1 }])
    expect(data.toolsByMcp).toEqual(data.tools)
    expect(data.effort.byModel).toEqual([{ modelId: 'claude-opus-5', byEffort: { medium: expect.objectContaining({ requests: 1, outputTokens: 20 }) } }])
  }
  const sub = (await get('agent=subagent')).data
  expect(sub.toolsByMcp).toEqual([{ name: 'server', mcpServer: 'server', count: 1, sessions: 1 }])
  expect(sub.effort.byModel[0].byEffort.high.requests).toBe(1)
  const old = (await get('range=custom&from=2026-08-01&to=2026-08-01')).data
  expect(old.tools[0].name).toBe('Bash')
  expect(old.effort.byModel[0].byEffort.low.requests).toBe(1)
  const empty = (await get('project=missing')).data
  expect(empty.tools).toEqual([]); expect(empty.toolsByMcp).toEqual([]); expect(empty.effort.byModel).toEqual([])
})

test('tool names use timestamp then path then offset provenance as attribution moves', async () => {
  const { get } = await fixture({
    'a/main.jsonl': [entry('moving', {}, { effort: 'high', message: { content: [tool('id', 'Late')] } })],
    'b/agent-copy.jsonl': [entry('moving', {}, { timestamp: '2026-09-16T10:00:00Z', effort: 'medium', message: { content: [tool('id', 'First'), tool('id', 'SameLine')] } }), entry('moving', {}, { timestamp: '2026-09-16T10:00:00Z', message: { content: [tool('id', 'LaterOffset')] } })],
  })
  expect((await get('project=a')).data.tools).toEqual([])
  const { data } = await get('range=custom&from=2026-09-16&to=2026-09-16&agent=subagent')
  expect(data.tools).toEqual([{ name: 'First', mcpServer: null, count: 1, sessions: 1 }])
  expect(data.effort.byModel[0].byEffort).toEqual({ medium: expect.objectContaining({ requests: 1 }) })
})
