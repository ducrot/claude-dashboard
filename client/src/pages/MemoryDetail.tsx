import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { ArrowLeft, Brain, Calendar, FileText, FolderOpen } from 'lucide-react'
import { api, MemoryFileSummary } from '@/lib/api'
import { formatDate, formatDateTime } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

export default function MemoryDetail() {
  const { projectDir, filename } = useParams<{ projectDir: string; filename: string }>()

  const { data: file, isLoading, error } = useQuery({
    queryKey: ['memory', projectDir, filename],
    queryFn: () => api.memory.get(projectDir!, filename!),
    enabled: !!projectDir && !!filename,
  })

  const { data: projects } = useQuery({
    queryKey: ['memory'],
    queryFn: api.memory.list,
  })

  const topicFiles: MemoryFileSummary[] = projects
    ?.find((p) => p.projectDir === projectDir)
    ?.files.filter((f) => f.filename !== filename) ?? []

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

          {topicFiles.length > 0 && (
            <>
              <Separator className="my-6" />
              <div>
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <FileText className="h-4 w-4" />
                  Topic Files
                </h3>
                <div className="space-y-2">
                  {topicFiles.map((tf) => (
                    <Link
                      key={tf.filename}
                      to={`/memory/${encodeURIComponent(tf.projectDir)}/${encodeURIComponent(tf.filename)}`}
                      className="flex items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors hover:bg-accent/50"
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{tf.title || tf.filename}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{formatDate(tf.modifiedAt)}</span>
                        <span>{(tf.size / 1024).toFixed(1)} KB</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
