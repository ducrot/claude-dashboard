import { createReadStream } from 'fs'
import { readdir, readFile } from 'fs/promises'
import { join, basename } from 'path'
import { createInterface } from 'readline'
import { paths } from '../config/paths.js'

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

interface SessionIndex {
  entries?: Array<{ sessionId?: string; projectPath?: string }>
  originalPath?: string
}

let cache: { agents: SubAgent[]; timestamp: number } | null = null
const CACHE_TTL = 30_000 // 30 seconds

export function invalidateSubAgentsCache() {
  cache = null
}

function extractProjectName(projectPath: string): string {
  const parts = projectPath.split('/')
  return parts[parts.length - 1] || projectPath
}

function deriveAgentType(filename: string): SubAgent['agentType'] {
  if (filename.includes('aprompt_suggestion-')) return 'prompt_suggestion'
  if (filename.includes('acompact-')) return 'compact'
  return 'regular'
}

async function buildProjectMap(): Promise<Map<string, { projectPath: string; projectName: string }>> {
  const map = new Map<string, { projectPath: string; projectName: string }>()

  try {
    const projectDirs = await readdir(paths.projects)
    for (const dir of projectDirs) {
      const indexPath = join(paths.projects, dir, 'sessions-index.json')
      try {
        const content = await readFile(indexPath, 'utf-8')
        const data: SessionIndex = JSON.parse(content)
        const projectPath = data.originalPath || dir
        map.set(dir, {
          projectPath,
          projectName: extractProjectName(projectPath),
        })
      } catch {
        // Derive from directory name: -Users-foo-bar → /Users/foo/bar
        const derived = dir.replace(/^-/, '/').replace(/-/g, '/')
        map.set(dir, {
          projectPath: derived,
          projectName: extractProjectName(derived),
        })
      }
    }
  } catch {
    // projects dir may not exist
  }

  return map
}

async function parseAgentFile(filePath: string): Promise<{
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
}> {
  return new Promise((resolve, reject) => {
    const stream = createReadStream(filePath, { encoding: 'utf-8' })
    const rl = createInterface({ input: stream, crlfDelay: Infinity })

    let prompt = ''
    let model = ''
    let messageCount = 0
    let totalInputTokens = 0
    let totalOutputTokens = 0
    const toolNames = new Set<string>()
    let createdAt = ''
    let completedAt = ''
    let gitBranch: string | undefined

    rl.on('line', (line) => {
      try {
        const entry = JSON.parse(line)
        messageCount++

        const timestamp = entry.timestamp
        if (timestamp) {
          if (!createdAt) createdAt = timestamp
          completedAt = timestamp
        }

        if (!gitBranch && entry.gitBranch) {
          gitBranch = entry.gitBranch
        }

        if (entry.type === 'user' && !prompt) {
          const content = entry.message?.content
          if (typeof content === 'string') {
            prompt = content.slice(0, 200)
          } else if (Array.isArray(content)) {
            const textBlock = content.find((b: { type: string }) => b.type === 'text')
            if (textBlock?.text) {
              prompt = textBlock.text.slice(0, 200)
            }
          }
        }

        if (entry.type === 'assistant') {
          if (!model && entry.message?.model) {
            model = entry.message.model
          }

          const usage = entry.message?.usage
          if (usage) {
            totalInputTokens += (usage.input_tokens || 0) +
              (usage.cache_creation_input_tokens || 0) +
              (usage.cache_read_input_tokens || 0)
            totalOutputTokens += usage.output_tokens || 0
          }

          const content = entry.message?.content
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'tool_use' && block.name) {
                toolNames.add(block.name)
              }
            }
          }
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
        prompt,
        model,
        messageCount,
        totalInputTokens,
        totalOutputTokens,
        toolsUsed: Array.from(toolNames),
        createdAt,
        completedAt,
        duration,
        gitBranch,
      })
    })

    rl.on('error', reject)
    stream.on('error', reject)
  })
}

export async function listSubAgents(): Promise<SubAgent[]> {
  if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
    return cache.agents
  }

  const agents: SubAgent[] = []
  const projectMap = await buildProjectMap()

  try {
    const projectDirs = await readdir(paths.projects)

    const parsePromises: Promise<void>[] = []

    for (const projectDir of projectDirs) {
      const projectInfo = projectMap.get(projectDir) || {
        projectPath: projectDir,
        projectName: projectDir,
      }

      let sessionDirs: string[]
      try {
        sessionDirs = await readdir(join(paths.projects, projectDir))
      } catch {
        continue
      }

      for (const sessionId of sessionDirs) {
        const subagentsDir = join(paths.projects, projectDir, sessionId, 'subagents')
        let files: string[]
        try {
          files = await readdir(subagentsDir)
        } catch {
          continue
        }

        const agentFiles = files.filter(f => f.startsWith('agent-') && f.endsWith('.jsonl'))

        for (const file of agentFiles) {
          const filePath = join(subagentsDir, file)
          const agentId = basename(file, '.jsonl').replace('agent-', '')
          const agentType = deriveAgentType(file)

          parsePromises.push(
            parseAgentFile(filePath)
              .then((parsed) => {
                agents.push({
                  agentId,
                  agentType,
                  sessionId,
                  projectDir,
                  projectPath: projectInfo.projectPath,
                  projectName: projectInfo.projectName,
                  ...parsed,
                })
              })
              .catch(() => {
                // Skip files that can't be parsed
              })
          )
        }
      }
    }

    await Promise.all(parsePromises)
  } catch (error) {
    console.error('Error listing subagents:', error)
  }

  // Sort newest first
  agents.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  cache = { agents, timestamp: Date.now() }
  return agents
}
