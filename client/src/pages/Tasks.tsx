import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, FolderOpen } from 'lucide-react'
import { api, Task } from '@/lib/api'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TaskCard } from '@/components/tasks'
import { cn } from '@/lib/utils'

type StatusFilter = 'all' | 'pending' | 'in_progress' | 'completed'

interface SessionGroup {
  sessionId: string
  sessionSummary?: string
  projectName?: string
  tasks: Task[]
  statusSummary: {
    pending: number
    in_progress: number
    completed: number
  }
}

export default function Tasks() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [collapsedSessions, setCollapsedSessions] = useState<Set<string>>(new Set())

  const { data: tasks, isLoading, error } = useQuery({
    queryKey: ['tasks'],
    queryFn: api.tasks.list,
  })

  const filteredTasks = useMemo(() => {
    if (!tasks) return []

    if (statusFilter === 'all') return tasks

    return tasks.filter((task) => task.status === statusFilter)
  }, [tasks, statusFilter])

  const sessionGroups = useMemo(() => {
    const groups = new Map<string, Task[]>()

    for (const task of filteredTasks) {
      const existing = groups.get(task.sessionId) || []
      existing.push(task)
      groups.set(task.sessionId, existing)
    }

    const result: SessionGroup[] = []
    for (const [sessionId, sessionTasks] of groups) {
      // Get session context from the first task (all tasks in same session share the same metadata)
      const firstTask = sessionTasks[0]
      result.push({
        sessionId,
        sessionSummary: firstTask?.sessionSummary,
        projectName: firstTask?.projectName,
        tasks: sessionTasks.sort((a, b) => parseInt(a.id) - parseInt(b.id)),
        statusSummary: {
          pending: sessionTasks.filter((t) => t.status === 'pending').length,
          in_progress: sessionTasks.filter((t) => t.status === 'in_progress').length,
          completed: sessionTasks.filter((t) => t.status === 'completed').length,
        },
      })
    }

    // Sort sessions by most recent task creation date
    return result.sort((a, b) => {
      const aLatest = Math.max(...a.tasks.map((t) => new Date(t.createdAt).getTime()))
      const bLatest = Math.max(...b.tasks.map((t) => new Date(t.createdAt).getTime()))
      return bLatest - aLatest
    })
  }, [filteredTasks])

  const statusCounts = useMemo(() => {
    if (!tasks) return { all: 0, pending: 0, in_progress: 0, completed: 0 }

    return {
      all: tasks.length,
      pending: tasks.filter((t) => t.status === 'pending').length,
      in_progress: tasks.filter((t) => t.status === 'in_progress').length,
      completed: tasks.filter((t) => t.status === 'completed').length,
    }
  }, [tasks])

  const toggleSession = (sessionId: string) => {
    setCollapsedSessions((prev) => {
      const next = new Set(prev)
      if (next.has(sessionId)) {
        next.delete(sessionId)
      } else {
        next.add(sessionId)
      }
      return next
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">Loading tasks...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-destructive">Failed to load tasks</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Tasks</h1>
        <p className="text-muted-foreground">
          View and filter tasks across all sessions
        </p>
      </div>

      {/* Status Filter */}
      <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
        <TabsList>
          <TabsTrigger value="all">
            All ({statusCounts.all})
          </TabsTrigger>
          <TabsTrigger value="pending">
            Pending ({statusCounts.pending})
          </TabsTrigger>
          <TabsTrigger value="in_progress">
            In Progress ({statusCounts.in_progress})
          </TabsTrigger>
          <TabsTrigger value="completed">
            Completed ({statusCounts.completed})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Tasks Grouped by Session */}
      <div className="space-y-4">
        {sessionGroups.map((group) => {
          const isCollapsed = collapsedSessions.has(group.sessionId)

          return (
            <div key={group.sessionId} className="rounded-lg border bg-card">
              {/* Session Header */}
              <button
                onClick={() => toggleSession(group.sessionId)}
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
                    <span
                      className="font-medium text-sm"
                      title={`Session: ${group.sessionId}`}
                    >
                      {group.sessionSummary || 'Unnamed Session'}
                    </span>
                    {group.projectName && (
                      <span className="text-xs text-muted-foreground">
                        {group.projectName}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {group.statusSummary.completed > 0 && (
                    <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-green-600 dark:text-green-400">
                      {group.statusSummary.completed} done
                    </span>
                  )}
                  {group.statusSummary.in_progress > 0 && (
                    <span className="rounded-full bg-yellow-500/10 px-2 py-0.5 text-yellow-600 dark:text-yellow-400">
                      {group.statusSummary.in_progress} active
                    </span>
                  )}
                  {group.statusSummary.pending > 0 && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                      {group.statusSummary.pending} pending
                    </span>
                  )}
                  <span className="ml-2 text-muted-foreground">
                    {group.tasks.length} task{group.tasks.length !== 1 ? 's' : ''}
                  </span>
                </div>
              </button>

              {/* Session Tasks */}
              <div
                className={cn(
                  'grid gap-4 p-4 pt-0 sm:grid-cols-2 lg:grid-cols-3',
                  isCollapsed && 'hidden'
                )}
              >
                {group.tasks.map((task) => (
                  <TaskCard key={`${task.sessionId}-${task.id}`} task={task} />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {sessionGroups.length === 0 && (
        <div className="py-12 text-center text-muted-foreground">
          No tasks found
        </div>
      )}
    </div>
  )
}
