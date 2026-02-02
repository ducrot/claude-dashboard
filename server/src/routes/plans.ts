import { Router } from 'express'
import { listPlans, getPlan } from '../services/plans.js'

const router = Router()

router.get('/', async (_req, res) => {
  try {
    const plans = await listPlans()
    res.json(plans)
  } catch (error) {
    console.error('Error fetching plans:', error)
    res.status(500).json({ error: 'Failed to fetch plans' })
  }
})

router.get('/:filename', async (req, res) => {
  try {
    const plan = await getPlan(req.params.filename)
    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' })
    }
    res.json(plan)
  } catch (error) {
    console.error('Error fetching plan:', error)
    res.status(500).json({ error: 'Failed to fetch plan' })
  }
})

export default router
