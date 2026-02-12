import { readFile, readdir, stat, access } from 'fs/promises'
import { glob } from 'glob'
import { join, basename, resolve } from 'path'
import { paths } from '../config/paths.js'

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

function extractTitle(content: string, filename: string): string {
  const headingMatch = content.match(/^#\s+(.+)$/m)
  if (headingMatch) return headingMatch[1].trim()
  return filename.replace(/\.md$/, '')
}

function extractExcerpt(content: string, maxLength = 200): string {
  const cleaned = content.replace(/^#+\s+.+$/gm, '').trim()
  if (cleaned.length <= maxLength) return cleaned
  return cleaned.slice(0, maxLength) + '...'
}

async function getOriginalPath(projectDir: string): Promise<string> {
  try {
    const indexPath = join(paths.projects, projectDir, 'sessions-index.json')
    const content = await readFile(indexPath, 'utf-8')
    const data = JSON.parse(content)
    return data.originalPath || projectDir
  } catch {
    return projectDir
  }
}

export async function listMemoryProjects(): Promise<MemoryProject[]> {
  let dirs: string[]
  try {
    dirs = await readdir(paths.projects)
  } catch {
    return []
  }

  const projects: MemoryProject[] = []

  await Promise.all(
    dirs.map(async (dir) => {
      const memoryDir = join(paths.projects, dir, 'memory')

      try {
        await access(memoryDir)
      } catch {
        return
      }

      const files = await glob('*.md', { cwd: memoryDir })
      if (files.length === 0) return

      const originalPath = await getOriginalPath(dir)
      const projectName = basename(originalPath)

      const memoryFiles: MemoryFileSummary[] = []

      await Promise.all(
        files.map(async (filename) => {
          const filePath = join(memoryDir, filename)
          try {
            const [content, stats] = await Promise.all([
              readFile(filePath, 'utf-8'),
              stat(filePath),
            ])

            memoryFiles.push({
              filename,
              title: extractTitle(content, filename),
              projectDir: dir,
              projectPath: originalPath,
              size: stats.size,
              modifiedAt: stats.mtime.toISOString(),
              excerpt: extractExcerpt(content),
            })
          } catch (error) {
            console.error(`Error reading memory file ${filePath}:`, error)
          }
        })
      )

      if (memoryFiles.length === 0) return

      memoryFiles.sort((a, b) => a.filename === 'MEMORY.md' ? -1 : b.filename === 'MEMORY.md' ? 1 : a.filename.localeCompare(b.filename))

      const lastModified = memoryFiles.reduce(
        (latest, f) => (f.modifiedAt > latest ? f.modifiedAt : latest),
        ''
      )
      const totalSize = memoryFiles.reduce((sum, f) => sum + f.size, 0)

      projects.push({
        projectDir: dir,
        projectPath: originalPath,
        projectName,
        files: memoryFiles,
        totalSize,
        lastModified,
      })
    })
  )

  projects.sort((a, b) => b.lastModified.localeCompare(a.lastModified))

  return projects
}

export async function getMemoryFile(
  projectDir: string,
  filename: string
): Promise<MemoryFileDetail | null> {
  const filePath = resolve(join(paths.projects, projectDir, 'memory', filename))
  const projectsBase = resolve(paths.projects)

  // Prevent path traversal
  if (!filePath.startsWith(projectsBase)) {
    return null
  }

  try {
    const [content, stats] = await Promise.all([
      readFile(filePath, 'utf-8'),
      stat(filePath),
    ])

    const originalPath = await getOriginalPath(projectDir)

    return {
      filename,
      title: extractTitle(content, filename),
      projectDir,
      projectPath: originalPath,
      content,
      size: stats.size,
      modifiedAt: stats.mtime.toISOString(),
      excerpt: extractExcerpt(content),
    }
  } catch {
    return null
  }
}
