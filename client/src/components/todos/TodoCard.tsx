import { CheckCircle2, Circle, Clock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Todo, TodoItem } from '@/lib/api'
import { cn, formatDate, truncate } from '@/lib/utils'

interface TodoCardProps {
  todo: Todo
}

function TodoItemRow({ item }: { item: TodoItem }) {
  const isCompleted = item.status === 'completed'
  const isInProgress = item.status === 'in_progress'

  return (
    <div className="flex items-start gap-2 py-1">
      {isCompleted ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 text-green-500" />
      ) : isInProgress ? (
        <Clock className="mt-0.5 h-4 w-4 text-yellow-500" />
      ) : (
        <Circle className="mt-0.5 h-4 w-4 text-muted-foreground" />
      )}
      <span
        className={cn(
          'text-sm',
          isCompleted && 'text-muted-foreground line-through'
        )}
      >
        {truncate(item.content, 80)}
      </span>
    </div>
  )
}

export function TodoCard({ todo }: TodoCardProps) {
  const completedCount = todo.items.filter((i) => i.status === 'completed').length
  const totalCount = todo.items.length
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">
            Session: {todo.sessionId.slice(0, 8)}...
          </CardTitle>
          <Badge variant={progressPercent === 100 ? 'success' : 'secondary'}>
            {completedCount}/{totalCount}
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground">
          {formatDate(todo.createdAt)}
        </div>
      </CardHeader>
      <CardContent>
        {/* Progress Bar */}
        <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Todo Items */}
        <div className="space-y-1">
          {todo.items.slice(0, 5).map((item) => (
            <TodoItemRow key={item.id} item={item} />
          ))}
          {todo.items.length > 5 && (
            <div className="pt-1 text-xs text-muted-foreground">
              +{todo.items.length - 5} more items
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
