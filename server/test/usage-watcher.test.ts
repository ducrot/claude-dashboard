import express from 'express'
import { appendFile, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test, vi } from 'vitest'
import { paths } from '../src/config/paths.js'
import { fileWatcher } from '../src/services/watcher.js'
import { UsageIndexer } from '../src/services/usage/indexer.js'
import events from '../src/routes/events.js'
import { invalidateSubAgentsCache } from '../src/services/subagents.js'

vi.mock('../src/services/subagents.js', () => ({ invalidateSubAgentsCache: vi.fn() }))

test('real watcher add/change/unlink/unlinkDir delivers transcript notifications and usage SSE, retaining subagent invalidation', async () => {
  const dir = join(paths.projects, 'watcher/subagents')
  await mkdir(dir, { recursive: true })
  const indexer = new UsageIndexer({ debounceMs: 5, throttleMs: 0 })
  indexer.start(); await indexer.whenIdle()
  const notifications: string[] = []
  const notify = (path: string) => { notifications.push(path); indexer.notifyChanged(path) }
  const forward = () => fileWatcher.emit('change', { type: 'usage', path: '' })
  fileWatcher.on('transcript', notify); indexer.on('updated', forward)
  fileWatcher.start()
  await new Promise<void>(resolve => (fileWatcher as any).watcher.once('ready', resolve))
  // Chokidar 3 emits ready before all overlapping glob scans have settled.
  await new Promise(resolve => setTimeout(resolve, 100))
  const app = express().use('/api/events', events)
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>(resolve => server.on('listening', resolve))
  const { port } = server.address() as { port: number }
  const controller = new AbortController()
  const res = await fetch(`http://127.0.0.1:${port}/api/events`, { signal: controller.signal })
  const reader = res.body!.getReader()
  const initial = await reader.read()
  expect(new TextDecoder().decode(initial.value)).toContain('connected')
  const file = join(dir, 'agent-one.jsonl')
  const line = (id: string) => JSON.stringify({ type: 'assistant', timestamp: '2026-09-18T10:00:00Z', message: { id, model: 'claude-opus-5', usage: { output_tokens: 1 } } }) + '\n'
  try {
    await writeFile(file, line('one'))
    await vi.waitFor(() => expect(notifications).toContain(file))
    await indexer.whenIdle()
    expect(indexer.rows.size).toBe(1)
    expect(invalidateSubAgentsCache).toHaveBeenCalled()
    let received = ''
    while (!received.includes('data: {"type":"usage","path":""}')) {
      received += new TextDecoder().decode((await reader.read()).value)
    }
    expect(received).toContain('data: {"type":"usage","path":""}')
    const main = join(paths.projects, 'new-project/workflow/main.jsonl')
    await mkdir(join(main, '..'), { recursive: true }); await writeFile(main, line('one'))
    await vi.waitFor(() => expect(notifications).toContain(main)); await indexer.whenIdle()
    await rm(main)
    await vi.waitFor(() => expect(notifications.filter(path => path === main)).toHaveLength(2)); await indexer.whenIdle()
    notifications.length = 0
    await appendFile(file, line('two'))
    await vi.waitFor(() => expect(notifications).toContain(file)); await indexer.whenIdle()
    expect([...indexer.rows.values()][0].row.requests).toBe(2)
    notifications.length = 0
    await rm(file)
    await vi.waitFor(() => expect(notifications).toContain(file)); await indexer.whenIdle()
    expect(indexer.rows.size).toBe(0)
    await rm(dir, { recursive: true })
    await vi.waitFor(() => expect(notifications).toContain(dir)); await indexer.whenIdle()
  } finally {
    controller.abort(); await reader.cancel().catch(() => {})
    await new Promise<void>(resolve => server.close(() => resolve()))
    fileWatcher.off('transcript', notify); indexer.off('updated', forward)
    await (fileWatcher as any).watcher.close(); fileWatcher.stop()
  }
})
