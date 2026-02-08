import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TodoCard } from '@/components/todos'

type ProgressFilter = 'all' | 'in_progress' | 'completed'

export default function Todos() {
  const [progressFilter, setProgressFilter] = useState<ProgressFilter>('all')
  const [projectFilter, setProjectFilter] = useState<string>('all')

  const { data: todos, isLoading, error } = useQuery({
    queryKey: ['todos'],
    queryFn: api.todos.list,
  })

  const projectNames = useMemo(() => {
    if (!todos) return []
    const names = new Set<string>()
    for (const todo of todos) {
      if (todo.projectName) names.add(todo.projectName)
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b))
  }, [todos])

  const filteredTodos = useMemo(() => {
    if (!todos) return []

    let filtered = [...todos]

    // Apply project filter
    if (projectFilter !== 'all') {
      if (projectFilter === '__unassigned__') {
        filtered = filtered.filter((todo) => !todo.projectName)
      } else {
        filtered = filtered.filter((todo) => todo.projectName === projectFilter)
      }
    }

    // Sort by newest first
    filtered.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )

    if (progressFilter === 'all') return filtered

    return filtered.filter((todo) => {
      const completedCount = todo.items.filter((i) => i.status === 'completed').length
      const isComplete = completedCount === todo.items.length

      if (progressFilter === 'completed') return isComplete
      return !isComplete
    })
  }, [todos, progressFilter, projectFilter])

  const progressCounts = useMemo(() => {
    if (!todos) return { all: 0, in_progress: 0, completed: 0 }

    let projectTodos = todos
    if (projectFilter !== 'all') {
      if (projectFilter === '__unassigned__') {
        projectTodos = projectTodos.filter((t) => !t.projectName)
      } else {
        projectTodos = projectTodos.filter((t) => t.projectName === projectFilter)
      }
    }

    const completed = projectTodos.filter((todo) => {
      const completedCount = todo.items.filter((i) => i.status === 'completed').length
      return completedCount === todo.items.length
    }).length

    return {
      all: projectTodos.length,
      in_progress: projectTodos.length - completed,
      completed,
    }
  }, [todos, projectFilter])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">Loading todos...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-destructive">Failed to load todos</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Todos</h1>
        <p className="text-muted-foreground">
          Track todo items across all sessions
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={progressFilter} onValueChange={(v) => setProgressFilter(v as ProgressFilter)}>
          <TabsList>
            <TabsTrigger value="all">
              All ({progressCounts.all})
            </TabsTrigger>
            <TabsTrigger value="in_progress">
              In Progress ({progressCounts.in_progress})
            </TabsTrigger>
            <TabsTrigger value="completed">
              Completed ({progressCounts.completed})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All Projects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projects</SelectItem>
            {projectNames.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
            {todos?.some((t) => !t.projectName) && (
              <SelectItem value="__unassigned__">Unassigned</SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>

      {/* Todos Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredTodos.map((todo) => (
          <TodoCard key={todo.filename} todo={todo} />
        ))}
      </div>

      {filteredTodos.length === 0 && (
        <div className="py-12 text-center text-muted-foreground">
          No todos found
        </div>
      )}
    </div>
  )
}
