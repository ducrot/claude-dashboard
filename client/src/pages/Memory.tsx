import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, ChevronDown, ChevronRight, FolderOpen } from 'lucide-react'
import { api } from '@/lib/api'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MemoryFileCard } from '@/components/memory'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils'

type SortOption = 'recent' | 'name' | 'files'

export default function Memory() {
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<SortOption>('recent')
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set())

  const { data: projects, isLoading, error } = useQuery({
    queryKey: ['memory'],
    queryFn: api.memory.list,
  })

  const filteredProjects = useMemo(() => {
    if (!projects) return []
    const query = searchQuery.toLowerCase()

    let filtered = projects
      .map((project) => ({
        ...project,
        files: query
          ? project.files.filter(
              (f) =>
                f.title.toLowerCase().includes(query) ||
                f.filename.toLowerCase().includes(query) ||
                f.excerpt.toLowerCase().includes(query) ||
                project.projectName.toLowerCase().includes(query) ||
                project.projectPath.toLowerCase().includes(query)
            )
          : project.files,
      }))
      .filter((project) => project.files.length > 0)

    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'recent':
          return b.lastModified.localeCompare(a.lastModified)
        case 'name':
          return a.projectName.localeCompare(b.projectName)
        case 'files':
          return b.files.length - a.files.length
        default:
          return 0
      }
    })

    return filtered
  }, [projects, searchQuery, sortBy])

  const totalFiles = filteredProjects.reduce((sum, p) => sum + p.files.length, 0)

  const toggleProject = (projectDir: string) => {
    setCollapsedProjects((prev) => {
      const next = new Set(prev)
      if (next.has(projectDir)) {
        next.delete(projectDir)
      } else {
        next.add(projectDir)
      }
      return next
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">Loading memory files...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-destructive">Failed to load memory files</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Memory</h1>
        <p className="text-muted-foreground">
          Browse auto memory files across your projects
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search memory files..."
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
            <SelectItem value="name">Project name</SelectItem>
            <SelectItem value="files">File count</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Results count */}
      <div className="text-sm text-muted-foreground">
        {totalFiles} file{totalFiles !== 1 ? 's' : ''} across {filteredProjects.length} project{filteredProjects.length !== 1 ? 's' : ''}
      </div>

      {/* Projects with memory files */}
      <div className="space-y-4">
        {filteredProjects.map((project) => {
          const isCollapsed = collapsedProjects.has(project.projectDir)

          return (
            <div key={project.projectDir} className="rounded-lg border bg-card">
              {/* Project Header */}
              <button
                onClick={() => toggleProject(project.projectDir)}
                className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  {isCollapsed ? (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                  <FolderOpen className="h-4 w-4 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">
                      {project.projectName}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {project.projectPath}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    {project.files.length} file{project.files.length !== 1 ? 's' : ''}
                  </span>
                  <span>{(project.totalSize / 1024).toFixed(1)} KB</span>
                  <span>{formatDate(project.lastModified)}</span>
                </div>
              </button>

              {/* Memory Files */}
              <div
                className={cn(
                  'grid gap-4 p-4 pt-0 sm:grid-cols-2 lg:grid-cols-3',
                  isCollapsed && 'hidden'
                )}
              >
                {project.files.map((file) => (
                  <MemoryFileCard key={file.filename} file={file} />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {filteredProjects.length === 0 && (
        <div className="py-12 text-center text-muted-foreground">
          No memory files found
        </div>
      )}
    </div>
  )
}
