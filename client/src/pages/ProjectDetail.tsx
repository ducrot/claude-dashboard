import { useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  ExternalLink,
  FolderKanban,
  Calendar,
  MessageSquare,
  GitBranch,
  ChevronDown,
  ChevronRight,
  ListTodo,
  CheckSquare,
  Brain,
  Bot,
} from 'lucide-react'
import { api, type ProjectSession } from '@/lib/api'
import { formatDate, formatNumber } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { TaskCard } from '@/components/tasks'
import { TodoCard } from '@/components/todos'
import { MemoryProjectCard } from '@/components/memory'
import { SubAgentCard } from '@/components/subagents'

type SessionView = 'timeline' | 'branch'

interface DayGroup {
  date: string
  displayDate: string
  sessions: ProjectSession[]
}

interface BranchGroup {
  branch: string
  sessions: ProjectSession[]
}

function SessionTimelineItem({
  session,
  projectDir,
  isExpanded,
  onToggle,
}: {
  session: ProjectSession
  projectDir: string
  isExpanded: boolean
  onToggle: () => void
}) {
  const title =
    session.summary ||
    (session.firstPrompt && session.firstPrompt.length > 80
      ? session.firstPrompt.slice(0, 80) + '...'
      : session.firstPrompt) ||
    `Session ${session.id.slice(0, 8)}...`

  return (
    <div className="rounded-lg border bg-card">
      <button
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-3 p-3 text-left hover:bg-muted/50 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <span className="text-sm font-medium truncate">{title}</span>
          </div>
          {isExpanded && session.firstPrompt && (
            <p className="mt-1 ml-6 text-xs text-muted-foreground whitespace-pre-wrap">
              {session.firstPrompt}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0 pt-0.5">
          <span className="flex items-center gap-1">
            <MessageSquare className="h-3 w-3" />
            {formatNumber(session.messageCount)}
          </span>
          {session.gitBranch && (
            <span className="flex items-center gap-1">
              <GitBranch className="h-3 w-3" />
              <span className="font-mono max-w-[120px] truncate">
                {session.gitBranch}
              </span>
            </span>
          )}
          <span>{formatDate(session.modified)}</span>
          <Link
            to={`/sessions/${encodeURIComponent(projectDir)}/${encodeURIComponent(session.id)}`}
            onClick={(e) => e.stopPropagation()}
            className="hover:text-foreground transition-colors"
            title="View full transcript"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </button>
    </div>
  )
}

export default function ProjectDetail() {
  const { encodedName } = useParams<{ encodedName: string }>()
  const [sessionView, setSessionView] = useState<SessionView>('timeline')
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(
    new Set()
  )
  const [collapsedBranches, setCollapsedBranches] = useState<Set<string>>(
    new Set()
  )

  const {
    data: project,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['project', encodedName],
    queryFn: () => api.projects.get(encodedName!),
    enabled: !!encodedName,
  })

  const { data: allTasks } = useQuery({
    queryKey: ['tasks'],
    queryFn: api.tasks.list,
    enabled: !!project,
  })

  const { data: allTodos } = useQuery({
    queryKey: ['todos'],
    queryFn: api.todos.list,
    enabled: !!project,
  })

  const { data: allMemory } = useQuery({
    queryKey: ['memory'],
    queryFn: api.memory.list,
    enabled: !!project,
  })

  const { data: allSubAgents } = useQuery({
    queryKey: ['subagents'],
    queryFn: api.subagents.list,
    enabled: !!project,
  })

  const shortName = project
    ? project.projectPath
        ?.split('/')
        .filter(Boolean)
        .pop() || project.name
    : ''

  // Filter data to this project — match on decoded path, encoded name, or short name
  const matchesProject = (path?: string, name?: string) =>
    path === project?.projectPath ||
    path === project?.encodedName ||
    name === project?.encodedName ||
    name === shortName

  const projectTasks = useMemo(() => {
    if (!allTasks || !project) return []
    return allTasks.filter((t) => matchesProject(t.projectPath, t.projectName))
  }, [allTasks, project, shortName])

  const projectTodos = useMemo(() => {
    if (!allTodos || !project) return []
    return allTodos.filter((t) => matchesProject(undefined, t.projectName))
  }, [allTodos, project, shortName])

  const projectMemory = useMemo(() => {
    if (!allMemory || !project) return null
    return (
      allMemory.find((m) =>
        m.projectPath === project.projectPath ||
        m.projectDir === project.encodedName
      ) || null
    )
  }, [allMemory, project])

  const projectSubAgents = useMemo(() => {
    if (!allSubAgents || !project) return []
    return allSubAgents.filter((a) => matchesProject(a.projectPath, a.projectName))
  }, [allSubAgents, project, shortName])

  // Group sessions by day
  const sessionsByDay = useMemo<DayGroup[]>(() => {
    if (!project) return []
    const groups = new Map<string, ProjectSession[]>()
    for (const session of project.sessions) {
      const dateKey = new Date(session.modified).toISOString().split('T')[0]
      const existing = groups.get(dateKey) || []
      existing.push(session)
      groups.set(dateKey, existing)
    }
    return Array.from(groups.entries())
      .map(([date, sessions]) => ({
        date,
        displayDate: formatDate(date),
        sessions: sessions.sort(
          (a, b) =>
            new Date(b.modified).getTime() - new Date(a.modified).getTime()
        ),
      }))
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [project])

  // Group sessions by git branch
  const sessionsByBranch = useMemo<BranchGroup[]>(() => {
    if (!project) return []
    const groups = new Map<string, ProjectSession[]>()
    for (const session of project.sessions) {
      const branch = session.gitBranch || '(no branch)'
      const existing = groups.get(branch) || []
      existing.push(session)
      groups.set(branch, existing)
    }
    return Array.from(groups.entries())
      .map(([branch, sessions]) => ({
        branch,
        sessions: sessions.sort(
          (a, b) =>
            new Date(b.modified).getTime() - new Date(a.modified).getTime()
        ),
      }))
      .sort((a, b) => {
        const aLatest = Math.max(
          ...a.sessions.map((s) => new Date(s.modified).getTime())
        )
        const bLatest = Math.max(
          ...b.sessions.map((s) => new Date(s.modified).getTime())
        )
        return bLatest - aLatest
      })
  }, [project])

  const toggleSession = (sessionId: string) => {
    setExpandedSessions((prev) => {
      const next = new Set(prev)
      if (next.has(sessionId)) {
        next.delete(sessionId)
      } else {
        next.add(sessionId)
      }
      return next
    })
  }

  const toggleBranch = (branch: string) => {
    setCollapsedBranches((prev) => {
      const next = new Set(prev)
      if (next.has(branch)) {
        next.delete(branch)
      } else {
        next.add(branch)
      }
      return next
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">Loading project...</div>
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="space-y-4">
        <Link to="/projects">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Projects
          </Button>
        </Link>
        <div className="flex items-center justify-center py-12">
          <div className="text-destructive">Failed to load project</div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Link to="/projects">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Projects
        </Button>
      </Link>

      {/* Project Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderKanban className="h-5 w-5" />
            {shortName}
          </CardTitle>
          <p
            className="text-sm text-muted-foreground truncate"
            title={project.projectPath}
          >
            {project.projectPath}
          </p>
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span>
              {project.sessionCount} session
              {project.sessionCount !== 1 ? 's' : ''}
            </span>
            <span>{formatNumber(project.totalMessages)} messages</span>
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Active since {formatDate(project.firstActivity)}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Tabbed Content */}
      <Tabs defaultValue="sessions" className="w-full">
        <TabsList>
          <TabsTrigger value="sessions">
            Sessions ({project.sessionCount})
          </TabsTrigger>
          <TabsTrigger value="tasks">
            <ListTodo className="mr-1.5 h-3.5 w-3.5" />
            Tasks ({projectTasks.length})
          </TabsTrigger>
          <TabsTrigger value="todos">
            <CheckSquare className="mr-1.5 h-3.5 w-3.5" />
            Todos ({projectTodos.length})
          </TabsTrigger>
          <TabsTrigger value="memory">
            <Brain className="mr-1.5 h-3.5 w-3.5" />
            Memory{projectMemory ? '' : ' (0)'}
          </TabsTrigger>
          <TabsTrigger value="subagents">
            <Bot className="mr-1.5 h-3.5 w-3.5" />
            Sub-agents ({projectSubAgents.length})
          </TabsTrigger>
        </TabsList>

        {/* Sessions Tab */}
        <TabsContent value="sessions" className="mt-4">
          {/* View toggle */}
          <div className="flex items-center justify-end mb-4">
            <Tabs
              value={sessionView}
              onValueChange={(v) => setSessionView(v as SessionView)}
            >
              <TabsList className="h-8">
                <TabsTrigger value="timeline" className="text-xs px-3 h-6">
                  Timeline
                </TabsTrigger>
                <TabsTrigger value="branch" className="text-xs px-3 h-6">
                  By Branch
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {sessionView === 'timeline' ? (
            <div className="space-y-6">
              {sessionsByDay.map((dayGroup) => (
                <div key={dayGroup.date}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      {dayGroup.displayDate}
                    </div>
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs text-muted-foreground">
                      {dayGroup.sessions.length} session
                      {dayGroup.sessions.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="space-y-2 ml-6 border-l-2 border-border pl-4">
                    {dayGroup.sessions.map((session) => (
                      <SessionTimelineItem
                        key={session.id}
                        session={session}
                        projectDir={encodedName!}
                        isExpanded={expandedSessions.has(session.id)}
                        onToggle={() => toggleSession(session.id)}
                      />
                    ))}
                  </div>
                </div>
              ))}
              {sessionsByDay.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-8">
                  No sessions found
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {sessionsByBranch.map((group) => {
                const isCollapsed = collapsedBranches.has(group.branch)
                return (
                  <div
                    key={group.branch}
                    className="rounded-lg border bg-card"
                  >
                    <button
                      onClick={() => toggleBranch(group.branch)}
                      className="flex w-full items-center justify-between p-3 text-left hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        {isCollapsed ? (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                        <GitBranch className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium font-mono">
                          {group.branch}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {group.sessions.length} session
                        {group.sessions.length !== 1 ? 's' : ''}
                      </span>
                    </button>
                    {!isCollapsed && (
                      <div className="space-y-2 pb-3 ml-5 border-l-2 border-border pl-4">
                        {group.sessions.map((session) => (
                          <SessionTimelineItem
                            key={session.id}
                            session={session}
                            projectDir={encodedName!}
                            isExpanded={expandedSessions.has(session.id)}
                            onToggle={() => toggleSession(session.id)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
              {sessionsByBranch.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-8">
                  No sessions found
                </p>
              )}
            </div>
          )}
        </TabsContent>

        {/* Tasks Tab */}
        <TabsContent value="tasks" className="mt-4">
          {projectTasks.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projectTasks.map((task) => (
                <TaskCard key={`${task.sessionId}-${task.id}`} task={task} />
              ))}
            </div>
          ) : (
            <p className="text-center text-sm text-muted-foreground py-8">
              No tasks found for this project
            </p>
          )}
        </TabsContent>

        {/* Todos Tab */}
        <TabsContent value="todos" className="mt-4">
          {projectTodos.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projectTodos.map((todo) => (
                <TodoCard key={todo.sessionId} todo={todo} />
              ))}
            </div>
          ) : (
            <p className="text-center text-sm text-muted-foreground py-8">
              No todos found for this project
            </p>
          )}
        </TabsContent>

        {/* Memory Tab */}
        <TabsContent value="memory" className="mt-4">
          {projectMemory && projectMemory.files.length > 0 ? (
            <div className="max-w-md">
              <MemoryProjectCard project={projectMemory} />
            </div>
          ) : (
            <p className="text-center text-sm text-muted-foreground py-8">
              No memory files found for this project
            </p>
          )}
        </TabsContent>

        {/* Sub-agents Tab */}
        <TabsContent value="subagents" className="mt-4">
          {projectSubAgents.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projectSubAgents.map((agent) => (
                <SubAgentCard key={agent.agentId} agent={agent} />
              ))}
            </div>
          ) : (
            <p className="text-center text-sm text-muted-foreground py-8">
              No sub-agents found for this project
            </p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
