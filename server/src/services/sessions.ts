import { readFile, readdir, stat } from 'fs/promises'
import { createReadStream } from 'fs'
import { createInterface } from 'readline'
import { join } from 'path'
import { paths } from '../config/paths.js'
import { parseMessageContent, type ContentBlock } from './message-parser.js'

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

/** Strip system/command XML tags and return the remaining human-readable text */
function stripSystemTags(text: string): string {
  return text
    .replace(/<command-name>[\s\S]*?<\/command-name>/g, '')
    .replace(/<command-message>[\s\S]*?<\/command-message>/g, '')
    .replace(/<command-args>[\s\S]*?<\/command-args>/g, '')
    .replace(/<local-command-caveat>[\s\S]*?<\/local-command-caveat>/g, '')
    .replace(/<local-command-stdout>[\s\S]*?<\/local-command-stdout>/g, '')
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
    .trim()
}

interface ParsedJsonl {
  messageCount: number
  firstPrompt?: string
  gitBranch?: string
}

async function parseJsonlBasics(filePath: string): Promise<ParsedJsonl> {
  const result: ParsedJsonl = { messageCount: 0 }
  const rl = createInterface({
    input: createReadStream(filePath, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  })
  for await (const line of rl) {
    if (!line.trim()) continue
    try {
      const data = JSON.parse(line)
      const type = data.type
      if (type === 'user' || type === 'assistant') {
        result.messageCount++
      }
      if (!result.gitBranch && data.gitBranch) {
        result.gitBranch = data.gitBranch
      }
      if (type === 'user' && !result.firstPrompt && !data.isMeta) {
        const content = data.message?.content
        const texts: string[] = []
        if (typeof content === 'string') {
          texts.push(content)
        } else if (Array.isArray(content)) {
          for (const block of content) {
            if (block?.type === 'text' && block.text) texts.push(block.text)
          }
        }
        const joined = texts.join('\n').trim()
        const cleaned = stripSystemTags(joined)
        if (cleaned) {
          result.firstPrompt = cleaned.slice(0, 200)
        }
      }
    } catch {
      // Skip malformed lines
    }
  }
  return result
}

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
            const rawPrompt = entry.firstPrompt || ''
            const cleanedPrompt = stripSystemTags(rawPrompt) || undefined
            sessions.push({
              id,
              project,
              projectPath: entry.projectPath || originalPath,
              summary: entry.summary || '',
              firstPrompt: cleanedPrompt,
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

          const filePath = join(projectDir, file)
          const [fileStat, parsed] = await Promise.all([
            stat(filePath),
            parseJsonlBasics(filePath),
          ])
          sessions.push({
            id: sessionId,
            project,
            projectPath: originalPath,
            summary: '',
            firstPrompt: parsed.firstPrompt,
            createdAt: fileStat.birthtime.toISOString(),
            modified: fileStat.mtime.toISOString(),
            messageCount: parsed.messageCount,
            gitBranch: parsed.gitBranch,
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

export interface SessionMessage {
  role: 'user' | 'assistant'
  content: ContentBlock[]
  timestamp: string
  model?: string
  inputTokens?: number
  outputTokens?: number
}

export interface SessionDetailResult {
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

export async function getSessionDetail(
  projectDir: string,
  sessionId: string
): Promise<SessionDetailResult> {
  const filePath = join(paths.projects, projectDir, `${sessionId}.jsonl`)

  // Look up project info from the index
  let projectPath = ''
  let projectName = ''
  let summary = ''
  try {
    const indexPath = join(paths.projects, projectDir, 'sessions-index.json')
    const content = await readFile(indexPath, 'utf-8')
    const data: SessionIndex = JSON.parse(content)
    projectPath = data.originalPath || projectDir.replace(/^-/, '/').replace(/-/g, '/')
    projectName = projectPath.split('/').filter(Boolean).pop() || projectDir
    if (data.entries) {
      const entry = data.entries.find(e => e.sessionId === sessionId)
      if (entry) {
        summary = entry.summary || ''
      }
    }
  } catch {
    const derived = projectDir.replace(/^-/, '/').replace(/-/g, '/')
    projectPath = derived
    projectName = derived.split('/').filter(Boolean).pop() || projectDir
  }

  const messages: SessionMessage[] = []
  let firstPrompt: string | undefined
  let model = ''
  let totalInputTokens = 0
  let totalOutputTokens = 0
  const toolNames = new Set<string>()
  let createdAt = ''
  let completedAt = ''
  let gitBranch: string | undefined

  return new Promise((resolve, reject) => {
    const stream = createReadStream(filePath, { encoding: 'utf-8' })
    const rl = createInterface({ input: stream, crlfDelay: Infinity })

    rl.on('line', (line) => {
      if (!line.trim()) return
      try {
        const entry = JSON.parse(line)
        const timestamp = entry.timestamp || ''

        if (timestamp) {
          if (!createdAt) createdAt = timestamp
          completedAt = timestamp
        }

        if (!gitBranch && entry.gitBranch) {
          gitBranch = entry.gitBranch
        }

        // Skip non-message types
        if (entry.type !== 'user' && entry.type !== 'assistant') return

        if (entry.type === 'user') {
          const contentBlocks = parseMessageContent(entry.message || {})
          // Strip system tags from text blocks for user messages
          const cleanedBlocks = contentBlocks.map(block => {
            if (block.type === 'text' && block.text) {
              return { ...block, text: stripSystemTags(block.text) }
            }
            return block
          }).filter(block => !(block.type === 'text' && !block.text))

          if (!firstPrompt && !entry.isMeta) {
            const textBlock = cleanedBlocks.find(b => b.type === 'text')
            if (textBlock?.text) firstPrompt = textBlock.text.slice(0, 200)
          }

          if (cleanedBlocks.length > 0) {
            messages.push({
              role: 'user',
              content: cleanedBlocks,
              timestamp,
            })
          }
        }

        if (entry.type === 'assistant') {
          const msg = entry.message || {}
          if (!model && msg.model) model = msg.model

          const usage = msg.usage
          let inputTok = 0
          let outputTok = 0
          if (usage) {
            inputTok = (usage.input_tokens || 0) +
              (usage.cache_creation_input_tokens || 0) +
              (usage.cache_read_input_tokens || 0)
            outputTok = usage.output_tokens || 0
            totalInputTokens += inputTok
            totalOutputTokens += outputTok
          }

          const contentBlocks = parseMessageContent(msg)
          for (const block of contentBlocks) {
            if (block.type === 'tool_use' && block.name) {
              toolNames.add(block.name)
            }
          }

          messages.push({
            role: 'assistant',
            content: contentBlocks,
            timestamp,
            model: msg.model,
            inputTokens: inputTok,
            outputTokens: outputTok,
          })
        }
      } catch {
        // Skip malformed lines
      }
    })

    rl.on('close', () => {
      const duration = createdAt && completedAt
        ? new Date(completedAt).getTime() - new Date(createdAt).getTime()
        : 0

      resolve({
        id: sessionId,
        projectDir,
        projectPath,
        projectName,
        summary,
        firstPrompt,
        createdAt,
        modified: completedAt || createdAt,
        gitBranch,
        model,
        messageCount: messages.length,
        totalInputTokens,
        totalOutputTokens,
        toolsUsed: Array.from(toolNames),
        duration,
        messages,
      })
    })

    rl.on('error', reject)
    stream.on('error', reject)
  })
}
