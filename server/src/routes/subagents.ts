import { Router } from 'express'
import { listSubAgents } from '../services/subagents.js'

const router = Router()

router.get('/', async (_req, res) => {
  try {
    const agents = await listSubAgents()
    res.json(agents)
  } catch (error) {
    console.error('Error fetching subagents:', error)
    res.status(500).json({ error: 'Failed to fetch subagents' })
  }
})

export default router
