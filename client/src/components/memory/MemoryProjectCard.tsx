import { Link } from 'react-router-dom'
import { Brain, Calendar, FileText, FolderOpen } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { MemoryProject } from '@/lib/api'
import { formatDate } from '@/lib/utils'

interface MemoryProjectCardProps {
  project: MemoryProject
}

export function MemoryProjectCard({ project }: MemoryProjectCardProps) {
  const primaryFile = project.files.find((f) => f.filename === 'MEMORY.md') || project.files[0]
  const topicFiles = project.files.filter((f) => f.filename !== 'MEMORY.md')

  return (
    <Link
      to={`/memory/${encodeURIComponent(primaryFile.projectDir)}/${encodeURIComponent(primaryFile.filename)}`}
    >
      <Card className="h-full transition-colors hover:bg-accent/50">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{project.projectName}</span>
          </CardTitle>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <FolderOpen className="h-3 w-3 shrink-0" />
            <span className="truncate">{project.projectPath}</span>
          </div>
        </CardHeader>
        <CardContent>
          <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">
            {primaryFile.excerpt}
          </p>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatDate(primaryFile.modifiedAt)}
            </div>
            <div>{(primaryFile.size / 1024).toFixed(1)} KB</div>
            {topicFiles.length > 0 && (
              <Badge variant="secondary" className="flex items-center gap-1 text-xs font-normal">
                <FileText className="h-3 w-3" />
                +{topicFiles.length} topic file{topicFiles.length !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
