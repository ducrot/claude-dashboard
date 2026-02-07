import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { api } from '@/lib/api'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ProjectCard } from '@/components/projects'

type SortOption = 'recent' | 'oldest' | 'name' | 'sessions' | 'messages'

export default function Projects() {
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<SortOption>('recent')

  const { data: projects, isLoading, error } = useQuery({
    queryKey: ['projects'],
    queryFn: api.projects.list,
  })

  const filteredAndSorted = useMemo(() => {
    if (!projects) return []

    let filtered = projects.filter(
      (project) =>
        project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        project.projectPath.toLowerCase().includes(searchQuery.toLowerCase())
    )

    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'recent':
          return new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
        case 'oldest':
          return new Date(a.firstActivity).getTime() - new Date(b.firstActivity).getTime()
        case 'name':
          return a.name.localeCompare(b.name)
        case 'sessions':
          return b.sessionCount - a.sessionCount
        case 'messages':
          return b.totalMessages - a.totalMessages
        default:
          return 0
      }
    })

    return filtered
  }, [projects, searchQuery, sortBy])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">Loading projects...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-destructive">Failed to load projects</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
        <p className="text-muted-foreground">
          Browse your Claude Code projects and their sessions
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Most recent</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="name">Name</SelectItem>
            <SelectItem value="sessions">Most sessions</SelectItem>
            <SelectItem value="messages">Most messages</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Results count */}
      <div className="text-sm text-muted-foreground">
        Showing {filteredAndSorted.length} of {projects?.length || 0} projects
      </div>

      {/* Projects Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredAndSorted.map((project) => (
          <ProjectCard key={project.encodedName} project={project} />
        ))}
      </div>

      {filteredAndSorted.length === 0 && (
        <div className="py-12 text-center text-muted-foreground">
          No projects found matching your search
        </div>
      )}
    </div>
  )
}
