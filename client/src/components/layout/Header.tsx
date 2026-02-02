import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Moon, Sun, Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useTheme } from '@/hooks/useTheme'
import { api, SearchResult } from '@/lib/api'
import { cn } from '@/lib/utils'

interface HeaderProps {
  onMenuClick?: () => void
}

export function Header({ onMenuClick }: HeaderProps) {
  const { resolvedTheme, setTheme } = useTheme()
  const navigate = useNavigate()
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)

  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([])
      return
    }

    setIsSearching(true)
    try {
      const results = await api.search(query)
      setSearchResults(results)
    } catch (error) {
      console.error('Search error:', error)
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      handleSearch(searchQuery)
    }, 300)

    return () => clearTimeout(timer)
  }, [searchQuery, handleSearch])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleResultClick = (result: SearchResult) => {
    setSearchOpen(false)
    setSearchQuery('')

    if (result.type === 'plan') {
      navigate(`/plans/${encodeURIComponent(result.id)}`)
    } else if (result.type === 'task') {
      navigate('/tasks')
    } else if (result.type === 'todo') {
      navigate('/todos')
    }
  }

  const getResultIcon = (type: SearchResult['type']) => {
    switch (type) {
      case 'plan':
        return '📝'
      case 'task':
        return '📋'
      case 'todo':
        return '✅'
    }
  }

  return (
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 border-b bg-background px-4 shadow-xs sm:gap-x-6 sm:px-6 lg:px-8">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onMenuClick}
      >
        <Menu className="h-5 w-5" />
      </Button>

      <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
        <div className="relative flex flex-1 items-center">
          <Button
            variant="outline"
            className="relative h-9 w-full justify-start text-sm text-muted-foreground sm:pr-12 md:w-64"
            onClick={() => setSearchOpen(true)}
          >
            <Search className="mr-2 h-4 w-4" />
            Search...
            <kbd className="pointer-events-none absolute right-1.5 top-1.5 hidden h-6 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
              <span className="text-xs">⌘</span>K
            </kbd>
          </Button>
        </div>

        <div className="flex items-center gap-x-4 lg:gap-x-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          >
            {resolvedTheme === 'dark' ? (
              <Sun className="h-5 w-5" />
            ) : (
              <Moon className="h-5 w-5" />
            )}
          </Button>
        </div>
      </div>

      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>Search</DialogTitle>
          </DialogHeader>
          <div className="mt-2">
            <Input
              placeholder="Search plans, tasks, todos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
          </div>
          <div className="mt-4 max-h-[300px] overflow-y-auto">
            {isSearching && (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Searching...
              </div>
            )}
            {!isSearching && searchQuery && searchResults.length === 0 && (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No results found
              </div>
            )}
            {!isSearching && searchResults.length > 0 && (
              <ul className="space-y-1">
                {searchResults.map((result, index) => (
                  <li key={`${result.type}-${result.id}-${index}`}>
                    <button
                      className={cn(
                        'w-full rounded-md px-3 py-2 text-left hover:bg-accent',
                        'focus:bg-accent focus:outline-hidden'
                      )}
                      onClick={() => handleResultClick(result)}
                    >
                      <div className="flex items-center gap-2">
                        <span>{getResultIcon(result.type)}</span>
                        <span className="font-medium">{result.title}</span>
                        <span className="ml-auto text-xs text-muted-foreground capitalize">
                          {result.type}
                        </span>
                      </div>
                      {result.snippet && (
                        <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                          {result.snippet}
                        </p>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </header>
  )
}
