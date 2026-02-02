import express from 'express'
import cors from 'cors'
import { fileWatcher } from './services/watcher.js'
import plansRouter from './routes/plans.js'
import tasksRouter from './routes/tasks.js'
import todosRouter from './routes/todos.js'
import statsRouter from './routes/stats.js'
import sessionsRouter from './routes/sessions.js'
import searchRouter from './routes/search.js'
import eventsRouter from './routes/events.js'

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
app.use('/api/sessions', sessionsRouter)
app.use('/api/search', searchRouter)
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
process.on('SIGINT', () => {
  console.log('\nShutting down...')
  fileWatcher.stop()
  process.exit(0)
})

process.on('SIGTERM', () => {
  fileWatcher.stop()
  process.exit(0)
})
