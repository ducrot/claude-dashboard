import { readFile, stat } from 'fs/promises'
import { glob } from 'glob'
import { join, basename } from 'path'
import { paths } from '../config/paths.js'

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
}

interface RawTodoItem {
  id?: string
  subject?: string
  content?: string
  description?: string
  status?: string
  priority?: string
}

export async function listTodos(): Promise<Todo[]> {
  const files = await glob('*.json', { cwd: paths.todos })

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

        // Extract session ID from filename (UUID.json)
        const sessionId = basename(filename, '.json')

        return {
          sessionId,
          filename,
          items,
          createdAt: stats.birthtime.toISOString(),
        }
      } catch (error) {
        console.error(`Error reading todo ${filename}:`, error)
        return null
      }
    })
  )

  return todos.filter((t): t is Todo => t !== null && t.items.length > 0)
}
