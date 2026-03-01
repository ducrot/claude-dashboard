import { Router } from 'express'
import { listSessions, getSessionDetail } from '../services/sessions.js'

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

router.get('/:projectDir/:sessionId', async (req, res) => {
  try {
    const { projectDir, sessionId } = req.params
    const detail = await getSessionDetail(projectDir, sessionId)
    res.json(detail)
  } catch (error) {
    console.error('Error fetching session detail:', error)
    res.status(500).json({ error: 'Failed to fetch session detail' })
  }
})

export default router
