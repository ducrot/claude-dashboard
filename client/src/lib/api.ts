const API_BASE = '/api'

async function fetchApi<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`)
  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`)
  }
  return response.json()
}

export interface Plan {
  filename: string
  title: string
  content: string
  createdAt: string
  size: number
}

export interface PlanSummary {
  filename: string
  title: string
  createdAt: string
  size: number
}

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
  firstPrompt?: string
  projectPath?: string
  projectName?: string
}

export interface Todo {
  sessionId: string
  filename: string
  items: TodoItem[]
  createdAt: string
  sessionSummary?: string
  projectName?: string
}

export interface TodoItem {
  id: string
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  priority?: string
}

export interface Stats {
  summary: {
    totalSessions: number
    totalMessages: number
    totalToolCalls: number
    totalTokens: number
    avgMessagesPerSession: number
    avgToolCallsPerSession: number
  }
  dailyActivity: Array<{
    date: string
    messages: number
    toolCalls: number
    sessions: number
  }>
  modelUsage: Array<{
    model: string
    tokens: number
    percentage: number
  }>
  hourlyActivity: Array<{
    hour: number
    count: number
  }>
  insights: {
    mostActiveDay: { date: string; messages: number } | null
    peakHour: { hour: number; sessions: number } | null
  }
}

export interface Session {
  id: string
  project: string
  createdAt: string
  messageCount: number
}

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

export interface MemoryFileSummary {
  filename: string
  title: string
  projectDir: string
  projectPath: string
  size: number
  modifiedAt: string
  excerpt: string
}

export interface MemoryFileDetail extends MemoryFileSummary {
  content: string
}

export interface MemoryProject {
  projectDir: string
  projectPath: string
  projectName: string
  files: MemoryFileSummary[]
  totalSize: number
  lastModified: string
}

export interface SubAgent {
  agentId: string
  agentType: 'regular' | 'prompt_suggestion' | 'compact'
  sessionId: string
  projectDir: string
  projectPath: string
  projectName: string
  prompt: string
  model: string
  messageCount: number
  totalInputTokens: number
  totalOutputTokens: number
  toolsUsed: string[]
  createdAt: string
  completedAt: string
  duration: number
  gitBranch?: string
}

export interface SubAgentContentBlock {
  type: 'text' | 'tool_use' | 'tool_result'
  text?: string
  name?: string
  input?: unknown
  tool_use_id?: string
  content?: string
}

export interface SubAgentMessage {
  role: 'user' | 'assistant'
  content: SubAgentContentBlock[]
  timestamp: string
  model?: string
  inputTokens?: number
  outputTokens?: number
}

export interface SubAgentDetail extends SubAgent {
  messages: SubAgentMessage[]
}

export interface SessionMessage {
  role: 'user' | 'assistant'
  content: SubAgentContentBlock[]
  timestamp: string
  model?: string
  inputTokens?: number
  outputTokens?: number
}

export interface SessionDetail {
  id: string
  projectDir: string
  projectPath: string
  projectName: string
  summary: string
  firstPrompt?: string
  createdAt: string
  modified: string
  gitBranch?: string
  model: string
  messageCount: number
  totalInputTokens: number
  totalOutputTokens: number
  toolsUsed: string[]
  duration: number
  messages: SessionMessage[]
}

export interface SearchResult {
  type: 'plan' | 'task' | 'todo' | 'memory'
  id: string
  title: string
  snippet: string
  path?: string
}

export const api = {
  plans: {
    list: () => fetchApi<PlanSummary[]>('/plans'),
    get: (filename: string) => fetchApi<Plan>(`/plans/${encodeURIComponent(filename)}`),
  },
  tasks: {
    list: () => fetchApi<Task[]>('/tasks'),
  },
  todos: {
    list: () => fetchApi<Todo[]>('/todos'),
  },
  stats: {
    get: () => fetchApi<Stats>('/stats'),
    summary: () => fetchApi<Stats['summary']>('/stats/summary'),
  },
  sessions: {
    list: () => fetchApi<Session[]>('/sessions'),
    get: (projectDir: string, sessionId: string) =>
      fetchApi<SessionDetail>(`/sessions/${encodeURIComponent(projectDir)}/${encodeURIComponent(sessionId)}`),
  },
  projects: {
    list: () => fetchApi<ProjectSummary[]>('/projects'),
    get: (encodedName: string) => fetchApi<ProjectDetail>(`/projects/${encodeURIComponent(encodedName)}`),
  },
  subagents: {
    list: () => fetchApi<SubAgent[]>('/subagents'),
    get: (projectDir: string, sessionId: string, agentId: string) =>
      fetchApi<SubAgentDetail>(`/subagents/${encodeURIComponent(projectDir)}/${encodeURIComponent(sessionId)}/${encodeURIComponent(agentId)}`),
  },
  memory: {
    list: () => fetchApi<MemoryProject[]>('/memory'),
    get: (projectDir: string, filename: string) =>
      fetchApi<MemoryFileDetail>(`/memory/${encodeURIComponent(projectDir)}/${encodeURIComponent(filename)}`),
  },
  search: (query: string) => fetchApi<SearchResult[]>(`/search?q=${encodeURIComponent(query)}`),
}
