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
import { MemoryProjectCard } from '@/components/memory'

type SortOption = 'recent' | 'name'

export default function Memory() {
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<SortOption>('recent')

  const { data: projects, isLoading, error } = useQuery({
    queryKey: ['memory'],
    queryFn: api.memory.list,
  })

  const filteredProjects = useMemo(() => {
    if (!projects) return []
    const query = searchQuery.toLowerCase()

    let filtered = query
      ? projects.filter((project) => {
          const primaryFile =
            project.files.find((f) => f.filename === 'MEMORY.md') || project.files[0]
          return (
            project.projectName.toLowerCase().includes(query) ||
            project.projectPath.toLowerCase().includes(query) ||
            primaryFile?.title.toLowerCase().includes(query) ||
            primaryFile?.excerpt.toLowerCase().includes(query)
          )
        })
      : [...projects]

    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'recent':
          return b.lastModified.localeCompare(a.lastModified)
        case 'name':
          return a.projectName.localeCompare(b.projectName)
        default:
          return 0
      }
    })

    return filtered
  }, [projects, searchQuery, sortBy])

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
            <SelectItem value="name">Project name</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Results count */}
      <div className="text-sm text-muted-foreground">
        {filteredProjects.length} project{filteredProjects.length !== 1 ? 's' : ''}
      </div>

      {/* Project cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredProjects.map((project) => (
          <MemoryProjectCard key={project.projectDir} project={project} />
        ))}
      </div>

      {filteredProjects.length === 0 && (
        <div className="py-12 text-center text-muted-foreground">
          No memory files found
        </div>
      )}
    </div>
  )
}
