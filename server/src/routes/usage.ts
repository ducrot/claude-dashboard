import { Router, type Response } from 'express'
import type { UsageIndexer } from '../services/usage/indexer.js'
import { assertSeriesBounds, queryUsage, queryUsageSessions } from '../services/usage/query.js'
import { parseLimit, resolveQuery } from '../services/usage/ranges.js'

/** Only parsing and validation run inside the catch, so an unexpected query fault still surfaces instead of reading as a bad request. */
function parseOr400<T>(res: Response, read: () => T): T | null {
  try { return read() }
  catch (error) { res.status(400).json({ error: (error as Error).message }); return null }
}

export function createUsageRouter(indexer: UsageIndexer): Router {
  const router = Router()
  router.get('/', (req, res) => {
    const query = parseOr400(res, () => {
      const resolved = resolveQuery(req.query, indexer.clock())
      assertSeriesBounds(indexer, resolved)
      return resolved
    })
    if (query) res.json(queryUsage(indexer, query))
  })
  router.get('/sessions', (req, res) => {
    const parsed = parseOr400(res, () => {
      const query = resolveQuery(req.query, indexer.clock())
      if (!query.project) throw new Error('project is required')
      return { query, limit: parseLimit(req.query.limit, 20, 100) }
    })
    if (parsed) res.json(queryUsageSessions(indexer, parsed.query, parsed.limit))
  })
  return router
}
