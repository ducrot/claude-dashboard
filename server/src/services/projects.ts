import { listSessions, Session } from './sessions.js'

export interface ProjectSummary {
  name: string
  encodedName: string
  projectPath: string
  sessionCount: number
  totalMessages: number
  lastActivity: string
  firstActivity: string
}

export interface ProjectSession {
  id: string
  summary: string
  firstPrompt?: string
  createdAt: string
  modified: string
  messageCount: number
  gitBranch?: string
}

export interface ProjectDetail extends ProjectSummary {
  sessions: ProjectSession[]
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const sessions = await listSessions()
  const projectMap = new Map<string, Session[]>()

  for (const session of sessions) {
    const existing = projectMap.get(session.project) || []
    existing.push(session)
    projectMap.set(session.project, existing)
  }

  const projects: ProjectSummary[] = []

  for (const [encodedName, projectSessions] of projectMap) {
    const totalMessages = projectSessions.reduce((sum, s) => sum + s.messageCount, 0)
    const modifiedDates = projectSessions.map(s => new Date(s.modified || s.createdAt).getTime())
    const createdDates = projectSessions.map(s => new Date(s.createdAt).getTime())

    projects.push({
      name: projectSessions[0]?.projectPath || encodedName,
      encodedName,
      projectPath: projectSessions[0]?.projectPath || encodedName,
      sessionCount: projectSessions.length,
      totalMessages,
      lastActivity: new Date(Math.max(...modifiedDates)).toISOString(),
      firstActivity: new Date(Math.min(...createdDates)).toISOString(),
    })
  }

  return projects.sort(
    (a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
  )
}

export async function getProject(encodedName: string): Promise<ProjectDetail | null> {
  const sessions = await listSessions()
  const projectSessions = sessions.filter(s => s.project === encodedName)

  if (projectSessions.length === 0) return null

  const totalMessages = projectSessions.reduce((sum, s) => sum + s.messageCount, 0)
  const modifiedDates = projectSessions.map(s => new Date(s.modified || s.createdAt).getTime())
  const createdDates = projectSessions.map(s => new Date(s.createdAt).getTime())

  return {
    name: projectSessions[0]?.projectPath || encodedName,
    encodedName,
    projectPath: projectSessions[0]?.projectPath || encodedName,
    sessionCount: projectSessions.length,
    totalMessages,
    lastActivity: new Date(Math.max(...modifiedDates)).toISOString(),
    firstActivity: new Date(Math.min(...createdDates)).toISOString(),
    sessions: projectSessions
      .sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime())
      .map(s => ({
        id: s.id,
        summary: s.summary,
        firstPrompt: s.firstPrompt,
        createdAt: s.createdAt,
        modified: s.modified,
        messageCount: s.messageCount,
        gitBranch: s.gitBranch,
      })),
  }
}
