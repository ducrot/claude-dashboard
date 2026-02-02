import { readFile, readdir, stat } from 'fs/promises'
import { join } from 'path'
import { paths } from '../config/paths.js'
import { getSessionsMap } from './sessions.js'

export interface Task {
  id: string
  sessionId: string
  subject: string
  description: string
  status: 'pending' | 'in_progress' | 'completed'
  blocks: string[]
  blockedBy: string[]
  createdAt: string
  sessionSummary?: string
  projectPath?: string
  projectName?: string
}

interface RawTask {
  id: string
  subject: string
  description?: string
  status: 'pending' | 'in_progress' | 'completed'
  blocks?: string[]
  blockedBy?: string[]
}

function extractProjectName(projectPath?: string): string | undefined {
  if (!projectPath) return undefined
  const parts = projectPath.split('/')
  return parts[parts.length - 1] || undefined
}

export async function listTasks(): Promise<Task[]> {
  const tasks: Task[] = []

  try {
    const [sessionDirs, sessionsMap] = await Promise.all([
      readdir(paths.tasks),
      getSessionsMap(),
    ])

    for (const sessionId of sessionDirs) {
      const sessionPath = join(paths.tasks, sessionId)
      const session = sessionsMap.get(sessionId)

      try {
        const files = await readdir(sessionPath)
        // Only process numbered JSON files (1.json, 2.json, etc.), skip .lock and .highwatermark
        const taskFiles = files.filter(f => /^\d+\.json$/.test(f))

        for (const taskFile of taskFiles) {
          const taskPath = join(sessionPath, taskFile)
          try {
            const content = await readFile(taskPath, 'utf-8')
            const stats = await stat(taskPath)
            // Each file contains a single task object, not an array
            const rawTask: RawTask = JSON.parse(content)

            tasks.push({
              id: rawTask.id,
              sessionId,
              subject: rawTask.subject,
              description: rawTask.description || '',
              status: rawTask.status,
              blocks: rawTask.blocks || [],
              blockedBy: rawTask.blockedBy || [],
              createdAt: stats.birthtime.toISOString(),
              sessionSummary: session?.summary,
              projectPath: session?.projectPath,
              projectName: extractProjectName(session?.projectPath),
            })
          } catch {
            // Skip invalid task files
            continue
          }
        }
      } catch {
        // Skip sessions without tasks directory or with access issues
        continue
      }
    }
  } catch (error) {
    console.error('Error listing tasks:', error)
  }

  return tasks
}
