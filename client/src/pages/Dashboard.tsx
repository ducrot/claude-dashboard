import { useQuery } from '@tanstack/react-query'
import { MessageSquare, Wrench, Coins, Clock, TrendingUp, Activity, Calendar } from 'lucide-react'
import { api } from '@/lib/api'
import { formatNumber } from '@/lib/utils'
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
        <div className="text-destructive">
          Failed to load dashboard data. Make sure the server is running.
        </div>
      </div>
    )
  }

  if (!stats) {
    return null
  }

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
          title="Total Messages"
          value={formatNumber(stats.summary.totalMessages)}
          icon={<MessageSquare className="h-4 w-4" />}
        />
        <StatsCard
          title="Tool Calls"
          value={formatNumber(stats.summary.totalToolCalls)}
          icon={<Wrench className="h-4 w-4" />}
        />
        <StatsCard
          title="Total Tokens"
          value={formatNumber(stats.summary.totalTokens)}
          icon={<Coins className="h-4 w-4" />}
        />
      </div>

      {/* Stats Grid - Row 2 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Avg Messages/Session"
          value={formatNumber(stats.summary.avgMessagesPerSession)}
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
            ? new Date(stats.insights.mostActiveDay.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : 'N/A'}
          description={stats.insights.mostActiveDay
            ? `${formatNumber(stats.insights.mostActiveDay.messages)} messages`
            : undefined}
          icon={<Calendar className="h-4 w-4" />}
        />
        <StatsCard
          title="Peak Hour"
          value={stats.insights.peakHour
            ? `${stats.insights.peakHour.hour.toString().padStart(2, '0')}:00`
            : 'N/A'}
          description={stats.insights.peakHour
            ? `${formatNumber(stats.insights.peakHour.sessions)} sessions`
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
