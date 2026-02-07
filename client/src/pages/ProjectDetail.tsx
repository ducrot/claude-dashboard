import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, FolderKanban, Calendar, MessageSquare, GitBranch } from 'lucide-react'
import { api } from '@/lib/api'
import { formatDate, formatNumber } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function ProjectDetail() {
  const { encodedName } = useParams<{ encodedName: string }>()

  const { data: project, isLoading, error } = useQuery({
    queryKey: ['project', encodedName],
    queryFn: () => api.projects.get(encodedName!),
    enabled: !!encodedName,
  })

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

  const shortName = project.projectPath
    ? project.projectPath.split('/').filter(Boolean).pop() || project.name
    : project.name

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
          <p className="text-sm text-muted-foreground truncate" title={project.projectPath}>
            {project.projectPath}
          </p>
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span>{project.sessionCount} session{project.sessionCount !== 1 ? 's' : ''}</span>
            <span>{formatNumber(project.totalMessages)} messages</span>
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Active since {formatDate(project.firstActivity)}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Sessions */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Sessions</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {project.sessions.map((session) => (
            <Card key={session.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base line-clamp-2">
                  {session.summary ||
                    (session.firstPrompt && session.firstPrompt.length > 80
                      ? session.firstPrompt.slice(0, 80) + '...'
                      : session.firstPrompt) ||
                    `Session ${session.id.slice(0, 8)}...`}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <MessageSquare className="h-3 w-3" />
                    {formatNumber(session.messageCount)}
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {formatDate(session.modified)}
                  </div>
                  {session.gitBranch && (
                    <div className="flex items-center gap-1">
                      <GitBranch className="h-3 w-3" />
                      {session.gitBranch}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
