import { Router } from 'express'
import { listMemoryProjects, getMemoryFile } from '../services/memory.js'

const router = Router()

router.get('/', async (_req, res) => {
  try {
    const projects = await listMemoryProjects()
    res.json(projects)
  } catch (error) {
    console.error('Error fetching memory projects:', error)
    res.status(500).json({ error: 'Failed to fetch memory projects' })
  }
})

router.get('/:projectDir/:filename', async (req, res) => {
  try {
    const file = await getMemoryFile(req.params.projectDir, req.params.filename)
    if (!file) return res.status(404).json({ error: 'Memory file not found' })
    res.json(file)
  } catch (error) {
    console.error('Error fetching memory file:', error)
    res.status(500).json({ error: 'Failed to fetch memory file' })
  }
})

export default router
