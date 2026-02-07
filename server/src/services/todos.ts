import { readFile, stat } from 'fs/promises'
import { glob } from 'glob'
import { join, basename } from 'path'
import { paths } from '../config/paths.js'
import { getSessionsMap } from './sessions.js'

export interface TodoItem {
  id: string
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  priority?: string
}

export interface Todo {
  sessionId: string
  filename: string
  items: TodoItem[]
  createdAt: string
  sessionSummary?: string
  projectName?: string
}

interface RawTodoItem {
  id?: string
  subject?: string
  content?: string
  description?: string
  status?: string
  priority?: string
}

function extractSessionId(filename: string): string {
  const name = basename(filename, '.json')
  const agentIndex = name.indexOf('-agent-')
  return agentIndex !== -1 ? name.slice(0, agentIndex) : name
}

function extractProjectName(projectPath?: string): string | undefined {
  if (!projectPath) return undefined
  const parts = projectPath.split('/')
  return parts[parts.length - 1] || undefined
}

export async function listTodos(): Promise<Todo[]> {
  const [files, sessionsMap] = await Promise.all([
    glob('*.json', { cwd: paths.todos }),
    getSessionsMap(),
  ])

  const todos = await Promise.all(
    files.map(async (filename) => {
      const filePath = join(paths.todos, filename)
      try {
        const [content, stats] = await Promise.all([
          readFile(filePath, 'utf-8'),
          stat(filePath),
        ])

        const rawItems: RawTodoItem[] = JSON.parse(content)

        const items: TodoItem[] = rawItems.map((item, index) => ({
          id: item.id || `todo-${index}`,
          content: item.subject || item.content || item.description || '',
          status: (item.status as TodoItem['status']) || 'pending',
          priority: item.priority,
        }))

        const sessionId = extractSessionId(filename)
        const session = sessionsMap.get(sessionId)

        const todo: Todo = {
          sessionId,
          filename,
          items,
          createdAt: stats.birthtime.toISOString(),
        }
        if (session?.summary) todo.sessionSummary = session.summary
        const projectName = extractProjectName(session?.projectPath)
        if (projectName) todo.projectName = projectName
        return todo
      } catch (error) {
        console.error(`Error reading todo ${filename}:`, error)
        return null
      }
    })
  )

  return todos.filter((t): t is Todo => t !== null && t.items.length > 0)
}
