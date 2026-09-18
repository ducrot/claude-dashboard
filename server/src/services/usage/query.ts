import type { ProjectOption, UsageIndexer, UsageRow } from './indexer.js'
import { COUNT_FIELDS, inputTokensIncludingCache, isMainTranscript } from './transcript.js'
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
function addModelMetrics(byModel: Record<string, MetricValues>, row: UsageRow, totalTokens: number, cost: number | null) {
  addMetrics(byModel[row.model] ?? (byModel[row.model] = emptyMetrics()), row, totalTokens, cost)
}
function trackSpan(target: { firstAt: number; lastAt: number }, row: UsageRow) {
  target.firstAt = Math.min(target.firstAt, row.firstAt); target.lastAt = Math.max(target.lastAt, row.lastAt)
}
interface ProjectAccumulator extends ProjectOption, Counts, MetricValues {
  byModel: Record<string, MetricValues>; hasSessions: boolean
}
interface SessionAccumulator extends MetricValues {
  sessionId: string; firstAt: number; lastAt: number; models: Set<string>; subagentRequests: number; hasMainTranscript: boolean
}
function matches(row: UsageRow, query: UsageQuery): boolean {
  return row.date >= query.from && row.date <= query.to
    && (!query.project || row.projectDir === query.project)
    // An explicit model overrides the family filter.
    && (query.model ? row.model === query.model : !query.family || modelInfo(row.model).family.toLowerCase() === query.family)
    && (query.agent === 'all' || row.agentType === query.agent)
}
export function queryUsage(indexer: UsageIndexer, query: UsageQuery) {
  const envelope = { index: indexer.status(), query, priceTable: { asOf: PRICE_TABLE_AS_OF, source: PRICE_TABLE_SOURCE } }
  if (envelope.index.state === 'building') return { ...envelope, data: null }
  const totals = { ...emptyCounts(), requests: 0, totalTokens: 0, inputTokensIncludingCache: 0, sessions: 0, models: 0,
    subagent: { requests: 0, outputTokens: 0 }, cost: { usd: 0, unpricedRequests: 0, unpricedModels: [] as string[] } }
  const sessions = new Set<string>()
  const unpriced = new Set<string>()
  const allModels = new Set<string>()
  const projectRows = new Map<string, ProjectAccumulator>()
  const modelRows = new Map<string, ModelAccumulator>()
  const seriesMap = new Map(buckets(query).map(bucket => [bucket, Object.create(null) as Record<string, MetricValues>]))
  for (const { row } of indexer.rows.values()) {
    allModels.add(row.model)
    if (!matches(row, query)) continue
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
    trackSpan(model, row)
    if (row.sessionId) model.sessions.add(row.sessionId)
    let project = projectRows.get(row.projectDir)
    if (!project) {
      project = { ...indexer.projectOption(row.projectDir), ...emptyCounts(), ...emptyMetrics(),
        byModel: Object.create(null), hasSessions: false }
      projectRows.set(row.projectDir, project)
    }
    for (const field of TOKEN_FIELDS) project[field] += row[field]
    addMetrics(project, row, total, cost)
    addModelMetrics(project.byModel, row, total, cost)
    addModelMetrics(seriesMap.get(bucketKey(row.date, query.groupBy))!, row, total, cost)
  }
  // Resolved after the loop so only projects that survived filtering pay for the file scan.
  if (projectRows.size) for (const file of indexer.files.keys()) {
    const slash = file.indexOf('/')
    const project = slash > 0 ? projectRows.get(file.slice(0, slash)) : undefined
    if (project && !project.hasSessions && isMainTranscript(file)) project.hasSessions = true
  }
  for (const byModel of seriesMap.values()) for (const id of modelRows.keys()) byModel[id] ??= emptyMetrics()
  totals.sessions = sessions.size; totals.models = modelRows.size; totals.cost.unpricedModels = [...unpriced].sort()
  return { ...envelope, data: { totals,
    models: [...modelRows.values()].sort((a, b) => b.outputTokens - a.outputTokens || a.modelId.localeCompare(b.modelId))
      .map(({ sessions: ids, firstAt, lastAt, ...model }) => ({ ...model, sessions: ids.size,
        firstUsedAt: new Date(firstAt).toISOString(), lastUsedAt: new Date(lastAt).toISOString() })),
    projects: [...projectRows.values()].sort((a, b) => b.outputTokens - a.outputTokens || a.projectDir.localeCompare(b.projectDir)),
    series: [...seriesMap].map(([bucket, byModel]) => ({ bucket, byModel })),
    filterOptions: { projects: [...indexer.projectOptions.values()].sort((a, b) => a.projectName.localeCompare(b.projectName)),
      models: [...allModels].sort().map(modelInfo) },
  } }
}

export function queryUsageSessions(indexer: UsageIndexer, query: UsageQuery, limit: number) {
  const index = indexer.status()
  const sessions = new Map<string, SessionAccumulator>()
  if (index.state !== 'building') for (const { row } of indexer.rows.values()) {
    if (!matches(row, query)) continue
    let session = sessions.get(row.sessionId)
    if (!session) {
      session = { ...emptyMetrics(), sessionId: row.sessionId, firstAt: row.firstAt, lastAt: row.lastAt,
        models: new Set(), subagentRequests: 0, hasMainTranscript: indexer.files.has(`${row.projectDir}/${row.sessionId}.jsonl`) }
      sessions.set(row.sessionId, session)
    }
    addMetrics(session, row, inputTokensIncludingCache(row) + row.outputTokens, estimateCost(row.model, row.speed, row))
    trackSpan(session, row)
    session.models.add(row.model)
    if (row.agentType === 'subagent') session.subagentRequests += row.requests
  }
  return { index, sessions: [...sessions.values()]
    .sort((a, b) => b.outputTokens - a.outputTokens || a.sessionId.localeCompare(b.sessionId)).slice(0, limit)
    .map(({ firstAt, lastAt, models, ...session }) => ({ ...session,
      firstAt: new Date(firstAt).toISOString(), lastAt: new Date(lastAt).toISOString(), models: [...models].sort() })) }
}
