import { Router } from 'express'
import type { UsageIndexer } from '../services/usage/indexer.js'
import { queryUsage } from '../services/usage/query.js'
import { resolveQuery } from '../services/usage/ranges.js'

export function createUsageRouter(indexer: UsageIndexer): Router {
  const router = Router()
  router.get('/', (req, res) => {
    let query
    try { query = resolveQuery(req.query, indexer.clock()) }
    catch (error) { res.status(400).json({ error: (error as Error).message }); return }
    res.json(queryUsage(indexer, query))
  })
  return router
}
