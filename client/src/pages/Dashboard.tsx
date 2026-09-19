import { useQuery } from '@tanstack/react-query'
import { MessageSquare, Wrench, Coins, Clock, TrendingUp, Activity, Calendar } from 'lucide-react'
import { BuildingUsageIndex, UsageIndexError } from '@/components/usage'
import { api } from '@/lib/api'
import { formatDayLabel, formatNumber } from '@/lib/utils'
import {
  StatsCard,
  ActivityChart,
  ModelUsageChart,
  HourlyActivityChart,
} from '@/components/dashboard'

export default function Dashboard() {
  const { data: stats, isLoading, error } = useQuery({
    queryKey: ['stats'],
    queryFn: api.stats.get,
    refetchInterval: query => query.state.data?.index.state === 'building' ? 2000 : false,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">Loading dashboard...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-destructive" role="alert">
          Failed to load dashboard data. Make sure the server is running.
        </div>
      </div>
    )
  }

  if (!stats) {
    return null
  }

  if (stats.index.state === 'building') return <BuildingUsageIndex index={stats.index} />

  // A failed index yields zeroed or partial statistics, so say so instead of showing them as measured results.
  if (stats.index.state === 'error') return <div className="flex items-center justify-center py-12"><UsageIndexError /></div>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of your Claude Code activity
        </p>
      </div>

      {/* Stats Grid - Row 1 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Sessions"
          value={formatNumber(stats.summary.totalSessions)}
          icon={<Clock className="h-4 w-4" />}
        />
        <StatsCard
          title="API Requests"
          value={formatNumber(stats.summary.totalRequests)}
          icon={<MessageSquare className="h-4 w-4" />}
        />
        <StatsCard
          title="Tool Calls"
          value={formatNumber(stats.summary.totalToolCalls)}
          icon={<Wrench className="h-4 w-4" />}
        />
        <StatsCard
          title="Output Tokens"
          value={formatNumber(stats.summary.totalOutputTokens)}
          icon={<Coins className="h-4 w-4" />}
        />
      </div>

      {/* Stats Grid - Row 2 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Avg Requests/Session"
          value={formatNumber(stats.summary.avgRequestsPerSession)}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatsCard
          title="Avg Tool Calls/Session"
          value={formatNumber(stats.summary.avgToolCallsPerSession)}
          icon={<Activity className="h-4 w-4" />}
        />
        <StatsCard
          title="Most Active Day"
          value={stats.insights.mostActiveDay
            ? formatDayLabel(stats.insights.mostActiveDay.date)
            : 'N/A'}
          description={stats.insights.mostActiveDay
            ? `${formatNumber(stats.insights.mostActiveDay.requests)} requests`
            : undefined}
          icon={<Calendar className="h-4 w-4" />}
        />
        <StatsCard
          title="Peak Hour"
          value={stats.insights.peakHour
            ? `${stats.insights.peakHour.hour.toString().padStart(2, '0')}:00`
            : 'N/A'}
          description={stats.insights.peakHour
            ? `${formatNumber(stats.insights.peakHour.requests)} requests`
            : undefined}
          icon={<Clock className="h-4 w-4" />}
        />
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ActivityChart data={stats.dailyActivity} />
        <ModelUsageChart data={stats.modelUsage} />
      </div>

      <HourlyActivityChart data={stats.hourlyActivity} />
    </div>
  )
}
