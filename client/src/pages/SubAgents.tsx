import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, FolderOpen, Bot, Cpu, Eye, EyeOff } from 'lucide-react'
import { api, SubAgent } from '@/lib/api'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { SubAgentCard } from '@/components/subagents'
import { cn, formatNumber } from '@/lib/utils'

type SortOption = 'recent' | 'oldest' | 'most_tokens' | 'longest'

interface ProjectGroup {
  projectName: string
  projectPath: string
  agents: SubAgent[]
  totalTokens: number
}

function formatModelShort(model: string): string {
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

function formatTokensCompact(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`
  return String(count)
}

export default function SubAgents() {
  const [projectFilter, setProjectFilter] = useState('all')
  const [modelFilter, setModelFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortOption>('recent')
  const [showInternal, setShowInternal] = useState(false)
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set())

  const { data: agents, isLoading, error } = useQuery({
    queryKey: ['subagents'],
    queryFn: api.subagents.list,
  })

  const modelNames = useMemo(() => {
    if (!agents) return []
    const models = new Set<string>()
    for (const a of agents) {
      if (a.model) models.add(a.model)
    }
    return Array.from(models).sort()
  }, [agents])

  const projectNames = useMemo(() => {
    if (!agents) return []
    const names = new Set<string>()
    for (const a of agents) {
      if (a.projectName) names.add(a.projectName)
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b))
  }, [agents])

  const filteredAgents = useMemo(() => {
    if (!agents) return []

    let result = agents

    if (!showInternal) {
      result = result.filter(a => a.agentType === 'regular')
    }

    if (projectFilter !== 'all') {
      result = result.filter(a => a.projectName === projectFilter)
    }

    if (modelFilter !== 'all') {
      result = result.filter(a => a.model === modelFilter)
    }

    if (search) {
      const q = search.toLowerCase()
      result = result.filter(a => a.prompt.toLowerCase().includes(q))
    }

    // Sort
    switch (sort) {
      case 'recent':
        result = [...result].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        break
      case 'oldest':
        result = [...result].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        break
      case 'most_tokens':
        result = [...result].sort((a, b) => (b.totalInputTokens + b.totalOutputTokens) - (a.totalInputTokens + a.totalOutputTokens))
        break
      case 'longest':
        result = [...result].sort((a, b) => b.duration - a.duration)
        break
    }

    return result
  }, [agents, showInternal, projectFilter, modelFilter, search, sort])

  const projectGroups = useMemo(() => {
    const groups = new Map<string, SubAgent[]>()

    for (const agent of filteredAgents) {
      const key = agent.projectName || 'Unknown'
      const existing = groups.get(key) || []
      existing.push(agent)
      groups.set(key, existing)
    }

    const result: ProjectGroup[] = []
    for (const [projectName, projectAgents] of groups) {
      const totalTokens = projectAgents.reduce(
        (sum, a) => sum + a.totalInputTokens + a.totalOutputTokens,
        0
      )
      result.push({
        projectName,
        projectPath: projectAgents[0]?.projectPath || '',
        agents: projectAgents,
        totalTokens,
      })
    }

    // Sort project groups by most recent agent
    return result.sort((a, b) => {
      const aLatest = Math.max(...a.agents.map(a => new Date(a.createdAt).getTime()))
      const bLatest = Math.max(...b.agents.map(a => new Date(a.createdAt).getTime()))
      return bLatest - aLatest
    })
  }, [filteredAgents])

  const summaryStats = useMemo(() => {
    const totalTokens = filteredAgents.reduce(
      (sum, a) => sum + a.totalInputTokens + a.totalOutputTokens,
      0
    )
    const projects = new Set(filteredAgents.map(a => a.projectName))
    return {
      agentCount: filteredAgents.length,
      totalTokens,
      projectCount: projects.size,
    }
  }, [filteredAgents])

  const toggleProject = (name: string) => {
    setCollapsedProjects(prev => {
      const next = new Set(prev)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
      }
      return next
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">Loading sub-agents...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-destructive">Failed to load sub-agents</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Sub-agents</h1>
        <p className="text-muted-foreground">
          Browse sub-agent transcripts across all projects
        </p>
      </div>

      {/* Summary stats */}
      <div className="flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-1.5 rounded-md border px-3 py-1.5">
          <Bot className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{formatNumber(summaryStats.agentCount)}</span>
          <span className="text-muted-foreground">agents</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-md border px-3 py-1.5">
          <Cpu className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{formatTokensCompact(summaryStats.totalTokens)}</span>
          <span className="text-muted-foreground">tokens</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-md border px-3 py-1.5">
          <FolderOpen className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{summaryStats.projectCount}</span>
          <span className="text-muted-foreground">projects</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <Input
          placeholder="Search by prompt..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-[220px]"
        />

        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Projects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projects</SelectItem>
            {projectNames.map(name => (
              <SelectItem key={name} value={name}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={modelFilter} onValueChange={setModelFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Models" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Models</SelectItem>
            {modelNames.map(model => (
              <SelectItem key={model} value={model}>
                {formatModelShort(model)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={v => setSort(v as SortOption)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Most Recent</SelectItem>
            <SelectItem value="oldest">Oldest First</SelectItem>
            <SelectItem value="most_tokens">Most Tokens</SelectItem>
            <SelectItem value="longest">Longest Duration</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant={showInternal ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowInternal(!showInternal)}
          className="gap-1.5"
        >
          {showInternal ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {showInternal ? 'Hide internal' : 'Show internal'}
        </Button>
      </div>

      {/* Groups */}
      <div className="space-y-4">
        {projectGroups.map(group => {
          const isCollapsed = collapsedProjects.has(group.projectName)

          return (
            <div key={group.projectName} className="rounded-lg border bg-card">
              <button
                onClick={() => toggleProject(group.projectName)}
                className="flex w-full items-center justify-between p-4 text-left hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {isCollapsed ? (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                  <FolderOpen className="h-4 w-4 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span className="font-medium text-sm">{group.projectName}</span>
                    {group.projectPath && group.projectPath !== group.projectName && (
                      <span className="text-xs text-muted-foreground">{group.projectPath}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{group.agents.length} agent{group.agents.length !== 1 ? 's' : ''}</span>
                  <span>{formatTokensCompact(group.totalTokens)} tokens</span>
                </div>
              </button>

              <div
                className={cn(
                  'grid gap-4 p-4 pt-0 sm:grid-cols-2 lg:grid-cols-3',
                  isCollapsed && 'hidden'
                )}
              >
                {group.agents.map(agent => (
                  <SubAgentCard key={agent.agentId} agent={agent} />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {projectGroups.length === 0 && (
        <div className="py-12 text-center text-muted-foreground">
          No sub-agents found
        </div>
      )}
    </div>
  )
}
