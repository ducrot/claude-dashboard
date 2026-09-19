import express from 'express'
import http from 'node:http'
import type { Server } from 'node:http'
import { EventEmitter } from 'node:events'
import { afterEach, expect, test, vi } from 'vitest'
import { createEventsRouter } from '../src/routes/events.js'
import { FileWatcher } from '../src/services/watcher.js'

const servers: Server[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  for (const server of servers.splice(0)) {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})

async function startServer(watcher: EventEmitter, heartbeatMs = 60_000) {
  const app = express().use('/api/events', createEventsRouter(watcher, heartbeatMs))
  const server = await new Promise<Server>(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
  servers.push(server)
  const { port } = server.address() as { port: number }
  return `http://127.0.0.1:${port}/api/events`
}

async function connect(url: string) {
  const chunks: string[] = []
  let closed = false
  let error: Error | null = null
  const req = http.get(url, res => {
    res.setEncoding('utf8')
    res.on('data', (chunk: string) => chunks.push(chunk))
    res.on('close', () => { closed = true })
  })
  req.on('error', e => { error = e })
  const stream = () => chunks.join('')
  const waitFor = async (check: (stream: string) => boolean, timeoutMs = 3000) => {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (error) throw new Error(`SSE connection failed: ${error}`)
      if (check(stream())) return
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    throw new Error(`SSE expectation not met within ${timeoutMs}ms; received ${JSON.stringify(stream())}`)
  }
  return {
    stream,
    isClosed: () => closed,
    close: () => { req.destroy() },
    waitForText: (text: string) => waitFor(s => s.includes(text)),
    waitForHeartbeats: (count: number) => waitFor(s => (s.match(/: heartbeat\n\n/g) ?? []).length >= count),
  }
}

test('idle connections receive comment heartbeats, no application data, and stay open', async () => {
  const url = await startServer(new EventEmitter(), 50)
  const client = await connect(url)

  await client.waitForText('"type":"connected"')
  await client.waitForHeartbeats(3)

  const stream = client.stream()
  expect(stream.startsWith('data: {"type":"connected"}\n\n')).toBe(true)
  // Heartbeats are SSE comments, never data events, so clients cannot parse
  // or invalidate queries from them.
  expect(stream.includes('data: {"type":"heartbeat"')).toBe(false)
  expect(stream.includes('data: : heartbeat')).toBe(false)
  // The connection survives the idle window instead of being closed.
  expect(client.isClosed()).toBe(false)
  client.close()
})

test('change events reach every client independently and disconnects clean up listeners and timers', async () => {
  const watcher = new EventEmitter()
  const url = await startServer(watcher)
  const baseline = watcher.listenerCount('change')
  const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
  const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')

  const a = await connect(url)
  const b = await connect(url)
  await a.waitForText('"type":"connected"')
  await b.waitForText('"type":"connected"')
  expect(watcher.listenerCount('change')).toBe(baseline + 2)

  // Only the heartbeat timers of this router use the configured interval.
  const heartbeatHandles = () =>
    setIntervalSpy.mock.calls
      .map(([, delay], i) => (delay === 60_000 ? setIntervalSpy.mock.results[i]!.value : null))
      .filter(Boolean)
  expect(heartbeatHandles().length).toBe(2)

  watcher.emit('change', { type: 'usage', path: '/some/session.jsonl' })
  await a.waitForText('"type":"usage"')
  await b.waitForText('"type":"usage"')

  // Disconnecting one client removes only its listener; the other keeps working.
  a.close()
  await vi.waitFor(() => expect(watcher.listenerCount('change')).toBe(baseline + 1))
  watcher.emit('change', { type: 'plans', path: '/some/plan.md' })
  await b.waitForText('"type":"plans"')

  b.close()
  await vi.waitFor(() => expect(watcher.listenerCount('change')).toBe(baseline))
  // Every heartbeat timer was cleared on disconnect instead of leaking.
  const handles = heartbeatHandles()
  await vi.waitFor(() =>
    expect(handles.every(handle => clearIntervalSpy.mock.calls.some(([cleared]) => cleared === handle))).toBe(true))
})

test('eleven concurrent SSE connections on a real FileWatcher stay warning-free and clean up', async () => {
  const emitWarning = vi.spyOn(process, 'emitWarning').mockImplementation(() => {})
  const watcher = new FileWatcher()
  const url = await startServer(watcher)
  const baseline = watcher.listenerCount('change')

  const clients = await Promise.all(Array.from({ length: 11 }, async () => {
    const client = await connect(url)
    await client.waitForText('"type":"connected"')
    return client
  }))
  expect(watcher.listenerCount('change')).toBe(baseline + 11)

  watcher.emit('change', { type: 'usage', path: '/some/session.jsonl' })
  await Promise.all(clients.map(client => client.waitForText('"type":"usage"')))

  // Node's default cap of 10 would have tripped a MaxListenersExceededWarning
  // on the eleventh connection; the watcher's raised budget keeps it quiet.
  expect(emitWarning.mock.calls.filter(call => call.some(arg => String(arg).includes('MaxListeners')))).toHaveLength(0)

  for (const client of clients) client.close()
  await vi.waitFor(() => expect(watcher.listenerCount('change')).toBe(baseline))
})

test('a reconnecting client receives fresh events exactly once and keeps receiving heartbeats', async () => {
  const watcher = new EventEmitter()
  const url = await startServer(watcher, 50)

  const first = await connect(url)
  await first.waitForText('"type":"connected"')
  first.close()

  const second = await connect(url)
  await second.waitForText('"type":"connected"')
  await second.waitForHeartbeats(1)

  watcher.emit('change', { type: 'usage', path: '' })
  await second.waitForText('"type":"usage"')
  // Exactly one delivery: the closed connection left no duplicate subscription.
  expect((second.stream().match(/"type":"usage"/g) ?? []).length).toBe(1)
  await vi.waitFor(() => expect(watcher.listenerCount('change')).toBe(1))
  second.close()
})
