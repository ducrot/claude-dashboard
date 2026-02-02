import { readFile, readdir } from 'fs/promises'
import { join } from 'path'
import { paths } from '../config/paths.js'

export interface Session {
  id: string
  project: string
  projectPath: string
  summary: string
  createdAt: string
  modified: string
  messageCount: number
  gitBranch?: string
}

interface SessionIndexEntry {
  sessionId?: string
  fullPath?: string
  summary?: string
  messageCount?: number
  created?: string
  modified?: string
  gitBranch?: string
  projectPath?: string
}

interface SessionIndex {
  entries?: SessionIndexEntry[]
}

export async function listSessions(): Promise<Session[]> {
  const sessions: Session[] = []

  try {
    const projectDirs = await readdir(paths.projects)

    for (const project of projectDirs) {
      const indexPath = join(paths.projects, project, 'sessions-index.json')

      try {
        const content = await readFile(indexPath, 'utf-8')
        const data: SessionIndex = JSON.parse(content)

        if (data.entries) {
          for (const entry of data.entries) {
            sessions.push({
              id: entry.sessionId || '',
              project,
              projectPath: entry.projectPath || '',
              summary: entry.summary || '',
              createdAt: entry.created || new Date().toISOString(),
              modified: entry.modified || entry.created || new Date().toISOString(),
              messageCount: entry.messageCount || 0,
              gitBranch: entry.gitBranch,
            })
          }
        }
      } catch {
        // Skip projects without session index
        continue
      }
    }
  } catch (error) {
    console.error('Error listing sessions:', error)
  }

  // Sort by creation date, newest first
  return sessions.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
}

export async function getSessionsMap(): Promise<Map<string, Session>> {
  const sessions = await listSessions()
  return new Map(sessions.map(s => [s.id, s]))
}
