import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { ArrowLeft, Brain, Calendar, FolderOpen } from 'lucide-react'
import { api } from '@/lib/api'
import { formatDateTime } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'

export default function MemoryDetail() {
  const { projectDir, filename } = useParams<{ projectDir: string; filename: string }>()

  const { data: file, isLoading, error } = useQuery({
    queryKey: ['memory', projectDir, filename],
    queryFn: () => api.memory.get(projectDir!, filename!),
    enabled: !!projectDir && !!filename,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">Loading memory file...</div>
      </div>
    )
  }

  if (error || !file) {
    return (
      <div className="space-y-4">
        <Link to="/memory">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Memory
          </Button>
        </Link>
        <div className="flex items-center justify-center py-12">
          <div className="text-destructive">Failed to load memory file</div>
        </div>
      </div>
    )
  }

  const projectName = file.projectPath.split('/').pop() || file.projectDir

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/memory">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            {file.title}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <FolderOpen className="h-3 w-3" />
              {projectName}
            </div>
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatDateTime(file.modifiedAt)}
            </div>
            <div>{(file.size / 1024).toFixed(1)} KB</div>
            <div className="text-xs">{file.filename}</div>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[calc(100vh-280px)]">
            <article className="prose prose-sm dark:prose-invert max-w-3xl">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({ className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || '')
                    const isInline = !match
                    return isInline ? (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    ) : (
                      <SyntaxHighlighter
                        style={oneDark}
                        language={match[1]}
                        PreTag="div"
                      >
                        {String(children).replace(/\n$/, '')}
                      </SyntaxHighlighter>
                    )
                  },
                }}
              >
                {file.content}
              </ReactMarkdown>
            </article>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}
