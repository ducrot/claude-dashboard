import { Router } from 'express'
import { listTasks } from '../services/tasks.js'

const router = Router()

router.get('/', async (_req, res) => {
  try {
    const tasks = await listTasks()
    res.json(tasks)
  } catch (error) {
    console.error('Error fetching tasks:', error)
    res.status(500).json({ error: 'Failed to fetch tasks' })
  }
})

export default router
