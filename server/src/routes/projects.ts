import { Router } from 'express'
import { listProjects, getProject } from '../services/projects.js'

const router = Router()

router.get('/', async (_req, res) => {
  try {
    const projects = await listProjects()
    res.json(projects)
  } catch (error) {
    console.error('Error fetching projects:', error)
    res.status(500).json({ error: 'Failed to fetch projects' })
  }
})

router.get('/:encodedName', async (req, res) => {
  try {
    const project = await getProject(req.params.encodedName)
    if (!project) {
      return res.status(404).json({ error: 'Project not found' })
    }
    res.json(project)
  } catch (error) {
    console.error('Error fetching project:', error)
    res.status(500).json({ error: 'Failed to fetch project' })
  }
})

export default router
