import { Router } from 'express'
import { EventEmitter } from 'node:events'
import type { FileChangeEvent } from '../services/watcher.js'

// Comment lines (leading ':') never reach onmessage, so heartbeats cannot
// invalidate queries. Precautionary against intermediaries dropping an idle
// stream; no idle disconnect was reproduced in this stack.
const HEARTBEAT_MS = 15_000

/** Listener and heartbeat are per connection, so one disconnect leaks nothing and leaves other clients untouched. */
export function createEventsRouter(watcher: EventEmitter, heartbeatMs = HEARTBEAT_MS): Router {
  const router = Router()

  router.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`)

    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), heartbeatMs)

    const handleChange = (event: FileChangeEvent) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`)
    }
    watcher.on('change', handleChange)

    req.on('close', () => {
      clearInterval(heartbeat)
      watcher.off('change', handleChange)
    })
  })

  return router
}
