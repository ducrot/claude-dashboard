import { readFile, readdir, stat } from 'fs/promises'
import { join } from 'path'
import { paths } from '../config/paths.js'

export interface Session {
  id: string
  project: string
  projectPath: string
  summary: string
  firstPrompt?: string
  createdAt: string
  modified: string
  messageCount: number
  gitBranch?: string
}

interface SessionIndexEntry {
  sessionId?: string
  fullPath?: string
  firstPrompt?: string
  summary?: string
  messageCount?: number
  created?: string
  modified?: string
  gitBranch?: string
  projectPath?: string
}

interface SessionIndex {
  entries?: SessionIndexEntry[]
  originalPath?: string
}

const UUID_JSONL_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jsonl$/

export async function listSessions(): Promise<Session[]> {
  const sessions: Session[] = []

  try {
    const projectDirs = await readdir(paths.projects)

    for (const project of projectDirs) {
      const projectDir = join(paths.projects, project)
      const indexPath = join(projectDir, 'sessions-index.json')
      const indexedIds = new Set<string>()
      let originalPath = ''

      try {
        const content = await readFile(indexPath, 'utf-8')
        const data: SessionIndex = JSON.parse(content)
        originalPath = data.originalPath || ''

        if (data.entries) {
          for (const entry of data.entries) {
            const id = entry.sessionId || ''
            indexedIds.add(id)
            sessions.push({
              id,
              project,
              projectPath: entry.projectPath || originalPath,
              summary: entry.summary || '',
              firstPrompt: entry.firstPrompt || undefined,
              createdAt: entry.created || new Date().toISOString(),
              modified: entry.modified || entry.created || new Date().toISOString(),
              messageCount: entry.messageCount || 0,
              gitBranch: entry.gitBranch,
            })
          }
        }
      } catch {
        // No session index - still scan for .jsonl files below
      }

      // Scan for orphan .jsonl session files not in the index
      try {
        const files = await readdir(projectDir)
        for (const file of files) {
          if (!UUID_JSONL_RE.test(file)) continue
          const sessionId = file.replace('.jsonl', '')
          if (indexedIds.has(sessionId)) continue

          const fileStat = await stat(join(projectDir, file))
          sessions.push({
            id: sessionId,
            project,
            projectPath: originalPath,
            summary: '',
            createdAt: fileStat.birthtime.toISOString(),
            modified: fileStat.mtime.toISOString(),
            messageCount: 0,
          })
        }
      } catch {
        // Skip if we can't read the directory
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
