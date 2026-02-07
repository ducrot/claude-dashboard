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

export interface SearchResult {
  type: 'plan' | 'task' | 'todo'
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
  },
  projects: {
    list: () => fetchApi<ProjectSummary[]>('/projects'),
    get: (encodedName: string) => fetchApi<ProjectDetail>(`/projects/${encodeURIComponent(encodedName)}`),
  },
  search: (query: string) => fetchApi<SearchResult[]>(`/search?q=${encodeURIComponent(query)}`),
}
