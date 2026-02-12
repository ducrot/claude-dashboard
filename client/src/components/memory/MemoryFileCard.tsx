import { Link } from 'react-router-dom'
import { Brain, Calendar } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MemoryFileSummary } from '@/lib/api'
import { formatDate, truncate } from '@/lib/utils'

interface MemoryFileCardProps {
  file: MemoryFileSummary
}

export function MemoryFileCard({ file }: MemoryFileCardProps) {
  return (
    <Link to={`/memory/${encodeURIComponent(file.projectDir)}/${encodeURIComponent(file.filename)}`}>
      <Card className="transition-colors hover:bg-accent/50">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="h-4 w-4 text-muted-foreground" />
            {truncate(file.title || file.filename, 60)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-2 line-clamp-2 text-sm text-muted-foreground">
            {file.excerpt}
          </p>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatDate(file.modifiedAt)}
            </div>
            <div>{(file.size / 1024).toFixed(1)} KB</div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
