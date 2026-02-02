import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TodoCard } from '@/components/todos'

type ProgressFilter = 'all' | 'in_progress' | 'completed'

export default function Todos() {
  const [progressFilter, setProgressFilter] = useState<ProgressFilter>('all')

  const { data: todos, isLoading, error } = useQuery({
    queryKey: ['todos'],
    queryFn: api.todos.list,
  })

  const filteredTodos = useMemo(() => {
    if (!todos) return []

    let filtered = [...todos]

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
  }, [todos, progressFilter])

  const progressCounts = useMemo(() => {
    if (!todos) return { all: 0, in_progress: 0, completed: 0 }

    const completed = todos.filter((todo) => {
      const completedCount = todo.items.filter((i) => i.status === 'completed').length
      return completedCount === todo.items.length
    }).length

    return {
      all: todos.length,
      in_progress: todos.length - completed,
      completed,
    }
  }, [todos])

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

      {/* Progress Filter */}
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
