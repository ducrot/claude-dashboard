import { Router } from 'express'
import { listSubAgents, getSubAgent } from '../services/subagents.js'

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

router.get('/:projectDir/:sessionId/:agentId', async (req, res) => {
  try {
    const { projectDir, sessionId, agentId } = req.params
    const agent = await getSubAgent(projectDir, sessionId, agentId)
    res.json(agent)
  } catch (error) {
    console.error('Error fetching subagent detail:', error)
    res.status(500).json({ error: 'Failed to fetch subagent detail' })
  }
})

export default router
