import { Router } from 'express'
import { listSessions } from '../services/sessions.js'

const router = Router()

router.get('/', async (_req, res) => {
  try {
    const sessions = await listSessions()
    res.json(sessions)
  } catch (error) {
    console.error('Error fetching sessions:', error)
    res.status(500).json({ error: 'Failed to fetch sessions' })
  }
})

export default router
