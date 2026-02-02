import { readFile } from 'fs/promises'
import { paths } from '../config/paths.js'

export interface Stats {
  summary: {
    totalSessions: number
    totalMessages: number
    totalToolCalls: number
    totalTokens: number
    avgMessagesPerSession: number
    avgToolCallsPerSession: number
  }
  dailyActivity: Array<{
    date: string
    messages: number
    toolCalls: number
    sessions: number
  }>
  modelUsage: Array<{
    model: string
    tokens: number
    percentage: number
  }>
  hourlyActivity: Array<{
    hour: number
    count: number
  }>
  insights: {
    mostActiveDay: { date: string; messages: number } | null
    peakHour: { hour: number; sessions: number } | null
  }
}

// V2 format of stats-cache.json
interface RawStatsCache {
  version?: number
  totalSessions?: number
  totalMessages?: number
  dailyActivity?: Array<{
    date: string
    messageCount: number
    sessionCount: number
    toolCallCount: number
  }>
  modelUsage?: Record<string, {
    inputTokens?: number
    outputTokens?: number
    cacheReadInputTokens?: number
    cacheCreationInputTokens?: number
  }>
  hourCounts?: Record<string, number>
}

export async function getStats(): Promise<Stats> {
  try {
    const content = await readFile(paths.statsCache, 'utf-8')
    const raw: RawStatsCache = JSON.parse(content)

    // Process daily activity from v2 format (array)
    const rawDailyActivity = raw.dailyActivity || []
    const dailyActivity = rawDailyActivity
      .map((item) => ({
        date: item.date,
        messages: item.messageCount || 0,
        toolCalls: item.toolCallCount || 0,
        sessions: item.sessionCount || 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30) // Last 30 days

    // Aggregate totals from daily activity
    const totalToolCalls = rawDailyActivity.reduce(
      (sum, item) => sum + (item.toolCallCount || 0),
      0
    )

    // Process model usage from v2 format (includes cache tokens)
    const modelEntries = Object.entries(raw.modelUsage || {})
    const totalModelTokens = modelEntries.reduce((sum, [, data]) => {
      return (
        sum +
        (data.inputTokens || 0) +
        (data.outputTokens || 0) +
        (data.cacheReadInputTokens || 0) +
        (data.cacheCreationInputTokens || 0)
      )
    }, 0)

    const modelUsage = modelEntries.map(([model, data]) => {
      const tokens =
        (data.inputTokens || 0) +
        (data.outputTokens || 0) +
        (data.cacheReadInputTokens || 0) +
        (data.cacheCreationInputTokens || 0)
      return {
        model,
        tokens,
        percentage: totalModelTokens > 0 ? Math.round((tokens / totalModelTokens) * 100) : 0,
      }
    })

    // Process hourly activity from v2 format (hourCounts)
    const hourlyActivity = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      count: raw.hourCounts?.[hour.toString()] || 0,
    }))

    // Calculate derived metrics
    const totalSessions = raw.totalSessions || 0
    const totalMessages = raw.totalMessages || 0
    const avgMessagesPerSession = totalSessions > 0 ? Math.round(totalMessages / totalSessions) : 0
    const avgToolCallsPerSession = totalSessions > 0 ? Math.round(totalToolCalls / totalSessions) : 0

    // Find most active day
    const mostActiveDay = rawDailyActivity.length > 0
      ? rawDailyActivity.reduce((max, item) =>
          item.messageCount > (max?.messageCount || 0) ? item : max
        )
      : null

    // Find peak hour
    const hourEntries = Object.entries(raw.hourCounts || {})
    const peakHourEntry = hourEntries.length > 0
      ? hourEntries.reduce((max, [hour, count]) =>
          count > (max ? max[1] : 0) ? [hour, count] : max
        )
      : null

    return {
      summary: {
        totalSessions,
        totalMessages,
        totalToolCalls,
        totalTokens: totalModelTokens,
        avgMessagesPerSession,
        avgToolCallsPerSession,
      },
      dailyActivity,
      modelUsage,
      hourlyActivity,
      insights: {
        mostActiveDay: mostActiveDay
          ? { date: mostActiveDay.date, messages: mostActiveDay.messageCount }
          : null,
        peakHour: peakHourEntry
          ? { hour: parseInt(peakHourEntry[0], 10), sessions: peakHourEntry[1] }
          : null,
      },
    }
  } catch (error) {
    console.error('Error reading stats cache:', error)
    return {
      summary: {
        totalSessions: 0,
        totalMessages: 0,
        totalToolCalls: 0,
        totalTokens: 0,
        avgMessagesPerSession: 0,
        avgToolCallsPerSession: 0,
      },
      dailyActivity: [],
      modelUsage: [],
      hourlyActivity: Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 })),
      insights: {
        mostActiveDay: null,
        peakHour: null,
      },
    }
  }
}
