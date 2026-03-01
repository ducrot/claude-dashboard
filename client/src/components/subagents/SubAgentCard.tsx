import { Link } from 'react-router-dom'
import { Clock, Cpu, Wrench, GitBranch, MessageSquare } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { SubAgent } from '@/lib/api'
import { formatDateTime } from '@/lib/utils'

interface SubAgentCardProps {
  agent: SubAgent
}

function formatModelName(model: string): string {
  if (model.includes('haiku-4-5')) return 'Haiku 4.5'
  if (model.includes('sonnet-4-5')) return 'Sonnet 4.5'
  if (model.includes('opus-4-6')) return 'Opus 4.6'
  if (model.includes('opus-4-5')) return 'Opus 4.5'
  if (model.includes('opus-4-0')) return 'Opus 4'
  if (model.includes('sonnet-4-0')) return 'Sonnet 4'
  if (model.includes('haiku')) return 'Haiku'
  if (model.includes('sonnet')) return 'Sonnet'
  if (model.includes('opus')) return 'Opus'
  return model.split('-').slice(0, 2).join(' ')
}

function formatDuration(ms: number): string {
  if (ms < 1000) return '<1s'
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes === 0) return `${seconds}s`
  return `${minutes}m ${seconds}s`
}

function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`
  return String(count)
}

export function SubAgentCard({ agent }: SubAgentCardProps) {
  const detailUrl = `/subagents/${encodeURIComponent(agent.projectDir)}/${encodeURIComponent(agent.sessionId)}/${encodeURIComponent(agent.agentId)}`

  return (
    <Link to={detailUrl} className="block">
      <Card className="transition-colors hover:bg-muted/50">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-sm font-medium leading-snug line-clamp-2">
              {agent.prompt || 'No prompt'}
            </CardTitle>
            {agent.model && (
              <Badge variant="secondary" className="shrink-0 text-[10px]">
                {formatModelName(agent.model)}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1" title="Input / Output tokens">
              <Cpu className="h-3 w-3" />
              {formatTokens(agent.totalInputTokens)} in / {formatTokens(agent.totalOutputTokens)} out
            </span>

            <span className="flex items-center gap-1" title="Duration">
              <Clock className="h-3 w-3" />
              {formatDuration(agent.duration)}
            </span>

            <span className="flex items-center gap-1" title="Messages">
              <MessageSquare className="h-3 w-3" />
              {agent.messageCount}
            </span>

            {agent.toolsUsed.length > 0 && (
              <span className="flex items-center gap-1" title={agent.toolsUsed.join(', ')}>
                <Wrench className="h-3 w-3" />
                {agent.toolsUsed.length} tool{agent.toolsUsed.length !== 1 ? 's' : ''}
              </span>
            )}

            {agent.gitBranch && (
              <span className="flex items-center gap-1" title="Git branch">
                <GitBranch className="h-3 w-3" />
                {agent.gitBranch}
              </span>
            )}
          </div>

          <div className="mt-2 text-[11px] text-muted-foreground">
            {formatDateTime(agent.createdAt)}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
