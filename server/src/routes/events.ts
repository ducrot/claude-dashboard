import { Router, Response } from 'express'
import { fileWatcher, FileChangeEvent } from '../services/watcher.js'

const router = Router()

const clients: Set<Response> = new Set()

router.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`)

  clients.add(res)

  const handleChange = (event: FileChangeEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`)
  }

  fileWatcher.on('change', handleChange)

  req.on('close', () => {
    clients.delete(res)
    fileWatcher.off('change', handleChange)
  })
})

export default router
