import express from 'express'
import cors from 'cors'
import { fileWatcher } from './services/watcher.js'
import plansRouter from './routes/plans.js'
import tasksRouter from './routes/tasks.js'
import todosRouter from './routes/todos.js'
import statsRouter from './routes/stats.js'
import sessionsRouter from './routes/sessions.js'
import searchRouter from './routes/search.js'
import projectsRouter from './routes/projects.js'
import memoryRouter from './routes/memory.js'
import subagentsRouter from './routes/subagents.js'
import eventsRouter from './routes/events.js'
import { UsageIndexer } from './services/usage/indexer.js'
import { createUsageRouter } from './routes/usage.js'

const usageIndexer = new UsageIndexer()
fileWatcher.on('transcript', (path: string) => usageIndexer.notifyChanged(path))
usageIndexer.on('updated', () => fileWatcher.emit('change', { type: 'usage', path: '' }))
usageIndexer.start()

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(cors())
app.use(express.json())

// Routes
app.use('/api/plans', plansRouter)
app.use('/api/tasks', tasksRouter)
app.use('/api/todos', todosRouter)
app.use('/api/stats', statsRouter)
app.use('/api/usage', createUsageRouter(usageIndexer))
app.use('/api/sessions', sessionsRouter)
app.use('/api/search', searchRouter)
app.use('/api/projects', projectsRouter)
app.use('/api/memory', memoryRouter)
app.use('/api/subagents', subagentsRouter)
app.use('/api/events', eventsRouter)

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

// Start file watcher
fileWatcher.start()

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})

// Graceful shutdown
let shuttingDown = false
async function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  fileWatcher.stop()
  // A stuck or failing cache flush must never keep the process alive.
  const flushed = usageIndexer.shutdown().catch(error => console.warn('Usage cache flush failed:', error))
  await Promise.race([flushed, new Promise(resolve => setTimeout(resolve, 5000))])
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
