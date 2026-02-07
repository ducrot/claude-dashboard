import { Link } from 'react-router-dom'
import { FolderKanban, MessageSquare, Calendar } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ProjectSummary } from '@/lib/api'
import { formatDate, formatNumber } from '@/lib/utils'

interface ProjectCardProps {
  project: ProjectSummary
}

export function ProjectCard({ project }: ProjectCardProps) {
  const shortName = project.projectPath
    ? project.projectPath.split('/').filter(Boolean).pop() || project.name
    : project.name

  return (
    <Link to={`/projects/${encodeURIComponent(project.encodedName)}`}>
      <Card className="transition-colors hover:bg-accent/50">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <FolderKanban className="h-4 w-4 text-muted-foreground" />
              {shortName}
            </CardTitle>
            <Badge variant="secondary">
              {project.sessionCount} session{project.sessionCount !== 1 ? 's' : ''}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="mb-2 text-xs text-muted-foreground truncate" title={project.projectPath}>
            {project.projectPath}
          </p>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <MessageSquare className="h-3 w-3" />
              {formatNumber(project.totalMessages)} messages
            </div>
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatDate(project.lastActivity)}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
