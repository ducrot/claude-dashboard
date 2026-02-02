import { readFile, stat } from 'fs/promises'
import { glob } from 'glob'
import matter from 'gray-matter'
import { join, basename } from 'path'
import { paths } from '../config/paths.js'

export interface PlanSummary {
  filename: string
  title: string
  createdAt: string
  size: number
}

export interface Plan extends PlanSummary {
  content: string
}

function extractTitle(content: string, filename: string): string {
  // Try to find first heading
  const headingMatch = content.match(/^#\s+(.+)$/m)
  if (headingMatch) {
    return headingMatch[1].trim()
  }

  // Fall back to filename without extension
  return filename.replace(/\.md$/, '')
}

export async function listPlans(): Promise<PlanSummary[]> {
  const files = await glob('*.md', { cwd: paths.plans })

  const plans = await Promise.all(
    files.map(async (filename) => {
      const filePath = join(paths.plans, filename)
      try {
        const [content, stats] = await Promise.all([
          readFile(filePath, 'utf-8'),
          stat(filePath),
        ])

        const { data: frontmatter, content: mainContent } = matter(content)

        return {
          filename,
          title: frontmatter.title || extractTitle(mainContent, filename),
          createdAt: stats.birthtime.toISOString(),
          size: stats.size,
        }
      } catch (error) {
        console.error(`Error reading plan ${filename}:`, error)
        return null
      }
    })
  )

  return plans.filter((p): p is PlanSummary => p !== null)
}

export async function getPlan(filename: string): Promise<Plan | null> {
  const filePath = join(paths.plans, filename)

  try {
    const [content, stats] = await Promise.all([
      readFile(filePath, 'utf-8'),
      stat(filePath),
    ])

    const { data: frontmatter, content: mainContent } = matter(content)

    return {
      filename,
      title: frontmatter.title || extractTitle(mainContent, filename),
      content: mainContent,
      createdAt: stats.birthtime.toISOString(),
      size: stats.size,
    }
  } catch (error) {
    console.error(`Error reading plan ${filename}:`, error)
    return null
  }
}
