import type { ProjectOption, ToolRow, UsageIndexer, UsageRow } from './indexer.js'
import { COUNT_FIELDS, inputTokensIncludingCache, isMainTranscript } from './transcript.js'
import { estimateCost, modelInfo, PRICE_TABLE_AS_OF, PRICE_TABLE_SOURCE } from './models.js'
import { bucketCount, bucketKey, buckets, type UsageQuery } from './ranges.js'

/** Cap on bucket × (models + effort levels) cells; at the measured ~170 bytes per cell this bounds the series allocation near 20 MB. */
export const MAX_SERIES_CELLS = 100_000

/** Counts the matching model and effort dimensions before any bucket is allocated, so it never allocates by window. */
export function assertSeriesBounds(indexer: UsageIndexer, query: UsageQuery): void {
  const bucketTotal = bucketCount(query)
  const models = new Set<string>()
  const efforts = new Set<string>()
  for (const { row } of indexer.rows.values()) {
    if (!matches(row, query)) continue
    models.add(row.model)
    efforts.add(row.effort)
  }
  const dimensions = models.size + efforts.size
  const cells = bucketTotal * dimensions
  if (cells > MAX_SERIES_CELLS) throw new Error(`Range too large for this index: ${bucketTotal} ${query.groupBy} buckets across ${dimensions} model and effort levels would fill ${cells} series cells, above the supported maximum of ${MAX_SERIES_CELLS}. Choose a shorter range or a coarser grouping.`)
}

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
function addKeyedMetrics(byKey: Record<string, MetricValues>, key: string, row: UsageRow, totalTokens: number, cost: number | null) {
  addMetrics(byKey[key] ?? (byKey[key] = emptyMetrics()), row, totalTokens, cost)
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
interface ToolAccumulator { name: string; mcpServer: string | null; count: number; sessions: Set<string> }
function addToolRow(map: Map<string, ToolAccumulator>, key: string, name: string, mcpServer: string | null, row: ToolRow) {
  let target = map.get(key)
  if (!target) { target = { name, mcpServer, count: 0, sessions: new Set() }; map.set(key, target) }
  target.count += row.count
  if (row.sessionId) target.sessions.add(row.sessionId)
}
function matches(row: ToolRow | UsageRow, query: UsageQuery): boolean {
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
  const bucketList = buckets(query)
  const seriesMap = new Map(bucketList.map(bucket => [bucket, Object.create(null) as Record<string, MetricValues>]))
  const effortSeries = new Map(bucketList.map(bucket => [bucket, Object.create(null) as Record<string, MetricValues>]))
  const effortModels = new Map<string, Record<string, MetricValues>>()
  // Every level seen anywhere must exist in every bucket, so the stacked series line up.
  // Row order, because the backfill order below is observable as the JSON key order of each bucket.
  const effortLevels = new Set<string>()
  for (const { row } of indexer.rows.values()) {
    allModels.add(row.model)
    if (!matches(row, query)) continue
    const cost = estimateCost(row.model, row.speed, row)
    const input = inputTokensIncludingCache(row)
    const total = input + row.outputTokens
    const bucket = bucketKey(row.date, query.groupBy)
    effortLevels.add(row.effort)
    let byEffort = effortModels.get(row.model)
    if (!byEffort) { byEffort = Object.create(null) as Record<string, MetricValues>; effortModels.set(row.model, byEffort) }
    addKeyedMetrics(byEffort, row.effort, row, total, cost)
    addKeyedMetrics(effortSeries.get(bucket)!, row.effort, row, total, cost)
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
    addKeyedMetrics(project.byModel, row.model, row, total, cost)
    addKeyedMetrics(seriesMap.get(bucket)!, row.model, row, total, cost)
  }
  // Resolved after the loop so only projects that survived filtering pay for the file scan.
  if (projectRows.size) for (const file of indexer.files.keys()) {
    const slash = file.indexOf('/')
    const project = slash > 0 ? projectRows.get(file.slice(0, slash)) : undefined
    if (project && !project.hasSessions && isMainTranscript(file)) project.hasSessions = true
  }
  for (const byModel of seriesMap.values()) for (const id of modelRows.keys()) byModel[id] ??= emptyMetrics()
  totals.sessions = sessions.size; totals.models = modelRows.size; totals.cost.unpricedModels = [...unpriced].sort()
  for (const byEffort of effortSeries.values()) for (const level of effortLevels) byEffort[level] ??= emptyMetrics()
  return { ...envelope, data: { totals,
    ...queryTools(indexer, query),
    effort: { series: [...effortSeries].map(([bucket, byEffort]) => ({ bucket, byEffort })),
      byModel: [...effortModels].sort(([a], [b]) => a.localeCompare(b)).map(([modelId, byEffort]) => ({ modelId, byEffort })) },
    models: [...modelRows.values()].sort((a, b) => b.outputTokens - a.outputTokens || a.modelId.localeCompare(b.modelId))
      .map(({ sessions: ids, firstAt, lastAt, ...model }) => ({ ...model, sessions: ids.size,
        firstUsedAt: new Date(firstAt).toISOString(), lastUsedAt: new Date(lastAt).toISOString() })),
    projects: [...projectRows.values()].sort((a, b) => b.outputTokens - a.outputTokens || a.projectDir.localeCompare(b.projectDir)),
    series: [...seriesMap].map(([bucket, byModel]) => ({ bucket, byModel })),
    filterOptions: { projects: [...indexer.projectOptions.values()].sort((a, b) => a.projectName.localeCompare(b.projectName) || a.projectDir.localeCompare(b.projectDir)),
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

/** Keep session sets until grouping is complete; summing per-tool session counts overcounts. */
function queryTools(indexer: UsageIndexer, query: UsageQuery) {
  const tools = new Map<string, ToolAccumulator>()
  const grouped = new Map<string, ToolAccumulator>()
  for (const row of indexer.toolRows.values()) {
    if (!matches(row, query)) continue
    const parts = row.name.split('__')
    const mcpServer = parts[0] === 'mcp' && parts.length >= 3 && parts[1] && parts[2] ? parts[1] : null
    addToolRow(tools, row.name, row.name, mcpServer, row)
    // Separate key namespaces, so a plain tool never merges with a server of the same name.
    addToolRow(grouped, mcpServer ? `mcp:${mcpServer}` : `tool:${row.name}`, mcpServer ?? row.name, mcpServer, row)
  }
  const serialize = (map: Map<string, ToolAccumulator>) => [...map.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .map(({ sessions, ...row }) => ({ ...row, sessions: sessions.size }))
  return { tools: serialize(tools), toolsByMcp: serialize(grouped) }
}
