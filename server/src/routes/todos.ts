import { Router } from 'express'
import { listTodos } from '../services/todos.js'

const router = Router()

router.get('/', async (_req, res) => {
  try {
    const todos = await listTodos()
    res.json(todos)
  } catch (error) {
    console.error('Error fetching todos:', error)
    res.status(500).json({ error: 'Failed to fetch todos' })
  }
})

export default router
