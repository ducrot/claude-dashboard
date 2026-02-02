import { Router } from 'express'
import { search } from '../services/search.js'

const router = Router()

router.get('/', async (req, res) => {
  try {
    const query = req.query.q as string

    if (!query || query.trim().length === 0) {
      return res.json([])
    }

    const results = await search(query.trim())
    res.json(results)
  } catch (error) {
    console.error('Error searching:', error)
    res.status(500).json({ error: 'Search failed' })
  }
})

export default router
