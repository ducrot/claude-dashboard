import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import {
  ArrowLeft,
  Bot,
  Calendar,
  ChevronDown,
  ChevronRight,
  Clock,
  Cpu,
  GitBranch,
  MessageSquare,
  User,
  Wrench,
} from 'lucide-react'
import { api, SubAgentContentBlock } from '@/lib/api'
import { formatDateTime } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

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

function ToolUseBlock({ block }: { block: SubAgentContentBlock }) {
  const [open, setOpen] = useState(false)
  const inputStr = typeof block.input === 'string'
    ? block.input
    : JSON.stringify(block.input, null, 2)

  return (
    <div className="rounded-md border bg-muted/30 text-sm">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
        <Wrench className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="font-mono text-xs font-medium">{block.name}</span>
      </button>
      {open && inputStr && (
        <div className="border-t px-3 py-2">
          <pre className="overflow-x-auto text-xs text-muted-foreground whitespace-pre-wrap break-all">{inputStr}</pre>
        </div>
      )}
    </div>
  )
}

function ToolResultBlock({ block }: { block: SubAgentContentBlock }) {
  const [open, setOpen] = useState(false)
  const content = block.content || ''
  const preview = content.length > 120 ? content.slice(0, 120) + '...' : content

  return (
    <div className="rounded-md border border-dashed bg-muted/20 text-sm">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
        <span className="text-xs text-muted-foreground">
          {open ? 'Tool result' : preview || 'Tool result (empty)'}
        </span>
      </button>
      {open && content && (
        <div className="border-t px-3 py-2">
          <pre className="overflow-x-auto text-xs text-muted-foreground whitespace-pre-wrap break-all">{content}</pre>
        </div>
      )}
    </div>
  )
}

export default function SubAgentDetail() {
  const { projectDir, sessionId, agentId } = useParams<{
    projectDir: string
    sessionId: string
    agentId: string
  }>()

  const { data: agent, isLoading, error } = useQuery({
    queryKey: ['subagent', projectDir, sessionId, agentId],
    queryFn: () => api.subagents.get(projectDir!, sessionId!, agentId!),
    enabled: !!projectDir && !!sessionId && !!agentId,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">Loading sub-agent...</div>
      </div>
    )
  }

  if (error || !agent) {
    return (
      <div className="space-y-4">
        <Link to="/subagents">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Sub-agents
          </Button>
        </Link>
        <div className="flex items-center justify-center py-12">
          <div className="text-destructive">Failed to load sub-agent</div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/subagents">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </Link>
      </div>

      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="h-5 w-5" />
              <span className="line-clamp-2">{agent.prompt || 'No prompt'}</span>
            </CardTitle>
            {agent.model && (
              <Badge variant="secondary" className="shrink-0">
                {formatModelName(agent.model)}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Cpu className="h-3.5 w-3.5" />
              {formatTokens(agent.totalInputTokens)} in / {formatTokens(agent.totalOutputTokens)} out
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {formatDuration(agent.duration)}
            </span>
            <span className="flex items-center gap-1">
              <MessageSquare className="h-3.5 w-3.5" />
              {agent.messageCount} messages
            </span>
            {agent.toolsUsed.length > 0 && (
              <span className="flex items-center gap-1" title={agent.toolsUsed.join(', ')}>
                <Wrench className="h-3.5 w-3.5" />
                {agent.toolsUsed.length} tool{agent.toolsUsed.length !== 1 ? 's' : ''}
              </span>
            )}
            {agent.gitBranch && (
              <span className="flex items-center gap-1">
                <GitBranch className="h-3.5 w-3.5" />
                {agent.gitBranch}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {formatDateTime(agent.createdAt)}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            {agent.projectName} &middot; {agent.sessionId}
          </div>
        </CardHeader>
      </Card>

      {/* Messages */}
      <ScrollArea className="h-[calc(100vh-340px)]">
        <div className="space-y-4 pr-4">
          {agent.messages.map((message, i) => (
            <div
              key={i}
              className={cn(
                'rounded-lg border p-4',
                message.role === 'user' ? 'bg-muted/50' : 'bg-card'
              )}
            >
              <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                {message.role === 'user' ? (
                  <User className="h-3.5 w-3.5" />
                ) : (
                  <Bot className="h-3.5 w-3.5" />
                )}
                <span className="font-medium capitalize">{message.role}</span>
                {message.timestamp && (
                  <span>{formatDateTime(message.timestamp)}</span>
                )}
                {message.model && (
                  <Badge variant="outline" className="text-[10px] py-0">
                    {formatModelName(message.model)}
                  </Badge>
                )}
                {(message.inputTokens || message.outputTokens) ? (
                  <span className="text-[10px]">
                    {formatTokens(message.inputTokens || 0)} in / {formatTokens(message.outputTokens || 0)} out
                  </span>
                ) : null}
              </div>

              <div className="space-y-3">
                {message.content.map((block, j) => {
                  if (block.type === 'text' && block.text) {
                    return (
                      <article key={j} className="prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            code({ className, children, ...props }) {
                              const match = /language-(\w+)/.exec(className || '')
                              const isInline = !match
                              return isInline ? (
                                <code className={className} {...props}>
                                  {children}
                                </code>
                              ) : (
                                <SyntaxHighlighter
                                  style={oneDark}
                                  language={match[1]}
                                  PreTag="div"
                                >
                                  {String(children).replace(/\n$/, '')}
                                </SyntaxHighlighter>
                              )
                            },
                          }}
                        >
                          {block.text}
                        </ReactMarkdown>
                      </article>
                    )
                  }
                  if (block.type === 'tool_use') {
                    return <ToolUseBlock key={j} block={block} />
                  }
                  if (block.type === 'tool_result') {
                    return <ToolResultBlock key={j} block={block} />
                  }
                  return null
                })}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
