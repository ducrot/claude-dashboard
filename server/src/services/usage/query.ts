import type { UsageIndexer, UsageRow } from './indexer.js'
import { COUNT_FIELDS, inputTokensIncludingCache } from './transcript.js'
import { estimateCost, modelInfo, PRICE_TABLE_AS_OF, PRICE_TABLE_SOURCE } from './models.js'
import { bucketKey, buckets, type UsageQuery } from './ranges.js'

export interface MetricValues { requests: number; outputTokens: number; totalTokens: number; costUsd: number | null }
type Counts = Record<typeof COUNT_FIELDS[number], number>
/** addMetrics owns outputTokens, so a model row must not add it a second time. */
const TOKEN_FIELDS = COUNT_FIELDS.filter(field => field !== 'outputTokens')
const emptyCounts = () => Object.fromEntries(COUNT_FIELDS.map(field => [field, 0])) as Counts
const emptyMetrics = (): MetricValues => ({ requests: 0, outputTokens: 0, totalTokens: 0, costUsd: 0 })
/** Times stay numeric while accumulating and are serialized once per model. */
interface ModelAccumulator extends Counts, MetricValues, ReturnType<typeof modelInfo> {
  inputTokensIncludingCache: number; firstAt: number; lastAt: number; sessions: Set<string>
}
function addMetrics(target: MetricValues, row: UsageRow, totalTokens: number, cost: number | null) {
  target.requests += row.requests; target.outputTokens += row.outputTokens; target.totalTokens += totalTokens
  target.costUsd = target.costUsd === null || cost === null ? null : target.costUsd + cost
}
export function queryUsage(indexer: UsageIndexer, query: UsageQuery) {
  const envelope = { index: indexer.status(), query, priceTable: { asOf: PRICE_TABLE_AS_OF, source: PRICE_TABLE_SOURCE } }
  if (envelope.index.state === 'building') return { ...envelope, data: null }
  const totals = { ...emptyCounts(), requests: 0, totalTokens: 0, inputTokensIncludingCache: 0, sessions: 0, models: 0,
    subagent: { requests: 0, outputTokens: 0 }, cost: { usd: 0, unpricedRequests: 0, unpricedModels: [] as string[] } }
  const sessions = new Set<string>()
  const unpriced = new Set<string>()
  const allModels = new Set<string>()
  const modelRows = new Map<string, ModelAccumulator>()
  const seriesMap = new Map(buckets(query).map(bucket => [bucket, Object.create(null) as Record<string, MetricValues>]))
  for (const { row } of indexer.rows.values()) {
    allModels.add(row.model)
    if (row.date < query.from || row.date > query.to) continue
    if (query.project && row.projectDir !== query.project) continue
    // An explicit model overrides the family filter.
    if (query.model ? row.model !== query.model : query.family && modelInfo(row.model).family.toLowerCase() !== query.family) continue
    if (query.agent !== 'all' && row.agentType !== query.agent) continue
    const cost = estimateCost(row.model, row.speed, row)
    const input = inputTokensIncludingCache(row)
    const total = input + row.outputTokens
    totals.requests += row.requests; totals.totalTokens += total; totals.inputTokensIncludingCache += input
    for (const field of COUNT_FIELDS) totals[field] += row[field]
    if (row.sessionId) sessions.add(row.sessionId)
    if (row.agentType === 'subagent') { totals.subagent.requests += row.requests; totals.subagent.outputTokens += row.outputTokens }
    if (cost === null) { totals.cost.unpricedRequests += row.requests; unpriced.add(row.model) }
    else totals.cost.usd += cost
    let model = modelRows.get(row.model)
    if (!model) {
      model = { ...modelInfo(row.model), ...emptyCounts(), ...emptyMetrics(),
        inputTokensIncludingCache: 0, firstAt: row.firstAt, lastAt: row.lastAt, sessions: new Set() }
      modelRows.set(row.model, model)
    }
    for (const field of TOKEN_FIELDS) model[field] += row[field]
    addMetrics(model, row, total, cost)
    model.inputTokensIncludingCache += input
    model.firstAt = Math.min(model.firstAt, row.firstAt)
    model.lastAt = Math.max(model.lastAt, row.lastAt)
    if (row.sessionId) model.sessions.add(row.sessionId)
    const byModel = seriesMap.get(bucketKey(row.date, query.groupBy))!
    const metric = byModel[row.model] ?? (byModel[row.model] = emptyMetrics())
    addMetrics(metric, row, total, cost)
  }
  for (const byModel of seriesMap.values()) for (const id of modelRows.keys()) byModel[id] ??= emptyMetrics()
  totals.sessions = sessions.size; totals.models = modelRows.size; totals.cost.unpricedModels = [...unpriced].sort()
  return { ...envelope, data: { totals,
    models: [...modelRows.values()].sort((a, b) => b.outputTokens - a.outputTokens || a.modelId.localeCompare(b.modelId))
      .map(({ sessions: ids, firstAt, lastAt, ...model }) => ({ ...model, sessions: ids.size,
        firstUsedAt: new Date(firstAt).toISOString(), lastUsedAt: new Date(lastAt).toISOString() })),
    series: [...seriesMap].map(([bucket, byModel]) => ({ bucket, byModel })),
    filterOptions: { projects: [...indexer.projectOptions.values()].sort((a, b) => a.projectName.localeCompare(b.projectName)),
      models: [...allModels].sort().map(modelInfo) },
  } }
}
