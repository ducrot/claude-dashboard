import { Router } from 'express'
import { getStats } from '../services/stats.js'
import type { UsageIndexer } from '../services/usage/indexer.js'

export function createStatsRouter(indexer: UsageIndexer): Router {
  const router = Router()
  router.get('/', (_req, res) => res.json(getStats(indexer)))
  router.get('/summary', (_req, res) => res.json(getStats(indexer).summary))
  return router
}
