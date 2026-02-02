import { CheckCircle2, Circle, Clock, ArrowRight, ArrowLeft } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Task } from '@/lib/api'
import { cn, truncate } from '@/lib/utils'

interface TaskCardProps {
  task: Task
}

const statusConfig = {
  pending: {
    icon: Circle,
    variant: 'secondary' as const,
    label: 'Pending',
  },
  in_progress: {
    icon: Clock,
    variant: 'warning' as const,
    label: 'In Progress',
  },
  completed: {
    icon: CheckCircle2,
    variant: 'success' as const,
    label: 'Completed',
  },
}

export function TaskCard({ task }: TaskCardProps) {
  const status = statusConfig[task.status]
  const StatusIcon = status.icon

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <StatusIcon
              className={cn(
                'h-4 w-4',
                task.status === 'completed' && 'text-green-500',
                task.status === 'in_progress' && 'text-yellow-500',
                task.status === 'pending' && 'text-muted-foreground'
              )}
            />
            {truncate(task.subject, 50)}
          </CardTitle>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {task.description && (
          <p className="mb-3 text-sm text-muted-foreground line-clamp-2">
            {task.description}
          </p>
        )}

        {/* Dependencies */}
        {(task.blocks.length > 0 || task.blockedBy.length > 0) && (
          <div className="flex flex-wrap gap-2 text-xs">
            {task.blocks.length > 0 && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <ArrowRight className="h-3 w-3" />
                <span>Blocks {task.blocks.join(', ')}</span>
              </div>
            )}
            {task.blockedBy.length > 0 && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <ArrowLeft className="h-3 w-3" />
                <span>Blocked by {task.blockedBy.join(', ')}</span>
              </div>
            )}
          </div>
        )}

        <div className="mt-2 text-xs text-muted-foreground">
          Task #{task.id}
        </div>
      </CardContent>
    </Card>
  )
}
