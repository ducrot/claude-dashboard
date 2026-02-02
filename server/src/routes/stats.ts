import { Router } from 'express'
import { getStats } from '../services/stats.js'

const router = Router()

router.get('/', async (_req, res) => {
  try {
    const stats = await getStats()
    res.json(stats)
  } catch (error) {
    console.error('Error fetching stats:', error)
    res.status(500).json({ error: 'Failed to fetch stats' })
  }
})

router.get('/summary', async (_req, res) => {
  try {
    const stats = await getStats()
    res.json(stats.summary)
  } catch (error) {
    console.error('Error fetching stats summary:', error)
    res.status(500).json({ error: 'Failed to fetch stats summary' })
  }
})

export default router
