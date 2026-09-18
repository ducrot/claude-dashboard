import type { IndexStatus, UsageIndexer } from './usage/indexer.js'
import { modelInfo } from './usage/models.js'
import { buckets, resolveQuery } from './usage/ranges.js'

export interface Stats {
  summary: {
    totalSessions: number
    totalRequests: number
    totalToolCalls: number
    totalOutputTokens: number
    avgRequestsPerSession: number
    avgToolCallsPerSession: number
  }
  dailyActivity: Array<{ date: string; requests: number; toolCalls: number; sessions: number }>
  modelUsage: Array<ReturnType<typeof modelInfo> & { outputTokens: number; percentage: number }>
  hourlyActivity: Array<{ hour: number; requests: number }>
  insights: {
    mostActiveDay: { date: string; requests: number } | null
    peakHour: { hour: number; requests: number } | null
  }
  index: IndexStatus
}

export function getStats(indexer: UsageIndexer): Stats {
  const query = resolveQuery({}, indexer.clock())
  const days = new Map(buckets(query).map(date => [date, { date, requests: 0, toolCalls: 0, sessions: new Set<string>() }]))
  const sessions = new Set<string>()
  const models = new Map<string, number>()
  let totalRequests = 0, totalOutputTokens = 0, totalToolCalls = 0
  for (const { row } of indexer.rows.values()) {
    totalRequests += row.requests
    totalOutputTokens += row.outputTokens
    if (row.sessionId) sessions.add(row.sessionId)
    const day = days.get(row.date)
    if (day) {
      day.requests += row.requests
      if (row.sessionId) day.sessions.add(row.sessionId)
      // Model usage is deliberately scoped to the same 30-day window as the daily chart.
      models.set(row.model, (models.get(row.model) ?? 0) + row.outputTokens)
    }
  }
  for (const row of indexer.toolRows.values()) {
    totalToolCalls += row.count
    const day = days.get(row.date)
    if (day) day.toolCalls += row.count
  }
  const hourlyActivity = Array.from({ length: 24 }, (_, hour) => ({ hour, requests: 0 }))
  const allDays = new Map<string, number>()
  for (const row of indexer.hourRows.values()) {
    hourlyActivity[row.hour].requests += row.requests
    allDays.set(row.date, (allDays.get(row.date) ?? 0) + row.requests)
  }
  // All-time insights; stable ties pick the earliest day/hour.
  let mostActiveDay: Stats['insights']['mostActiveDay'] = null
  for (const [date, requests] of [...allDays].sort(([a], [b]) => a.localeCompare(b))) {
    if (requests > (mostActiveDay?.requests ?? 0)) mostActiveDay = { date, requests }
  }
  let peakHour: Stats['insights']['peakHour'] = null
  for (const row of hourlyActivity) if (row.requests > (peakHour?.requests ?? 0)) peakHour = { ...row }
  const modelTotal = [...models.values()].reduce((sum, tokens) => sum + tokens, 0)
  return {
    summary: {
      totalSessions: sessions.size, totalRequests, totalToolCalls, totalOutputTokens,
      avgRequestsPerSession: sessions.size ? Math.round(totalRequests / sessions.size) : 0,
      avgToolCallsPerSession: sessions.size ? Math.round(totalToolCalls / sessions.size) : 0,
    },
    dailyActivity: [...days.values()].map(day => ({ ...day, sessions: day.sessions.size })),
    modelUsage: [...models].map(([id, outputTokens]) => ({ ...modelInfo(id), outputTokens, percentage: modelTotal ? Math.round(outputTokens / modelTotal * 100) : 0 }))
      .sort((a, b) => b.outputTokens - a.outputTokens || a.modelId.localeCompare(b.modelId)),
    hourlyActivity,
    insights: { mostActiveDay, peakHour },
    index: indexer.status(),
  }
}
