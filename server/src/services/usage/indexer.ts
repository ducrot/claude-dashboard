import { createReadStream } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setImmediate } from 'node:timers/promises'
import { paths } from '../../config/paths.js'
import { classifyPath, COUNT_FIELDS, mergePartials, parsePartialLine, type PartialRecord, type TranscriptUsage } from './transcript.js'
import { localDate } from './ranges.js'

export interface IndexStatus {
  state: 'building' | 'ready' | 'error'
  filesTotal: number; filesIndexed: number; pendingFiles: number
  lastUpdatedAt: string | null; startedAt: string | null; skippedFiles: number
}
export interface UsageRow extends TranscriptUsage {
  date: string; model: string; projectDir: string; sessionId: string; agentType: 'main' | 'subagent'; speed: string; effort: string
  requests: number; webSearchRequests: number; webFetchRequests: number; firstAt: number; lastAt: number
}
export interface ToolRow extends Pick<UsageRow, 'date' | 'model' | 'projectDir' | 'sessionId' | 'agentType'> { name: string; count: number }
interface Contribution { key: string; row: UsageRow; tools: Map<string, ToolRow> }
/** A bucket row with the response times behind it, so a removal can restore firstAt/lastAt. */
export interface RowBucket { row: UsageRow; times: Map<string, number> }
export interface ProjectOption { projectDir: string; projectPath: string; projectName: string }
/** Earliest response time wins; equal times fall back to the smaller relative path. */
const isEarlier = (ts: number, file: string, priorTs: number, priorFile: string) => ts < priorTs || (ts === priorTs && file < priorFile)
/** Directory names encode the working directory with dashes; used when no transcript or index says otherwise. */
const decodeProjectDir = (projectDir: string) => projectDir.replace(/^-/, '/').replace(/-/g, '/')
const toProjectOption = (projectDir: string, projectPath: string): ProjectOption =>
  ({ projectDir, projectPath, projectName: projectPath.split('/').filter(Boolean).at(-1) ?? projectDir })

export class UsageIndexer {
  readonly projectsDir: string
  readonly clock: () => Date
  readonly files = new Map<string, Map<string, PartialRecord>>()
  readonly responseFiles = new Map<string, Set<string>>()
  readonly rows = new Map<string, RowBucket>()
  readonly toolRows = new Map<string, ToolRow>()
  readonly projectOptions = new Map<string, ProjectOption>()
  private readonly contributions = new Map<string, Contribution>()
  private idle: Promise<void> = Promise.resolve()
  private started = false
  private progress: Omit<IndexStatus, 'pendingFiles'> = { state: 'building', filesTotal: 0, filesIndexed: 0, lastUpdatedAt: null, startedAt: null, skippedFiles: 0 }

  constructor(options: { projectsDir?: string; clock?: () => Date } = {}) {
    this.projectsDir = options.projectsDir ?? paths.projects
    this.clock = options.clock ?? (() => new Date())
  }
  start(): void {
    if (this.started) return
    this.started = true
    this.progress.startedAt = this.clock().toISOString()
    this.idle = this.build().catch(error => { this.progress.state = 'error'; console.error('Usage index build failed:', error) })
  }
  whenIdle(): Promise<void> { return this.idle }
  /** Rows outlive the options map when a build fails before it is filled, so derive a usable label instead of returning undefined. */
  projectOption(projectDir: string): ProjectOption {
    return this.projectOptions.get(projectDir) ?? toProjectOption(projectDir, decodeProjectDir(projectDir))
  }
  status(): IndexStatus {
    const { state, filesTotal, filesIndexed, lastUpdatedAt, startedAt, skippedFiles } = this.progress
    return { state, filesTotal, filesIndexed, pendingFiles: filesTotal - filesIndexed, lastUpdatedAt, startedAt, skippedFiles }
  }

  private async discover(directory = '', result: string[] = []): Promise<string[]> {
    let entries
    try { entries = await readdir(join(this.projectsDir, directory), { withFileTypes: true }) }
    catch (error) { if (!directory && (error as NodeJS.ErrnoException).code === 'ENOENT') return result; throw error }
    for (const entry of entries) {
      const relative = directory ? `${directory}/${entry.name}` : entry.name
      if (entry.isDirectory()) await this.discover(relative, result)
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) result.push(relative)
    }
    return result
  }

  private async readPartials(file: string): Promise<Map<string, PartialRecord>> {
    const partials = new Map<string, PartialRecord>()
    const addLine = (line: Buffer, at: number) => {
      const parsed = parsePartialLine(line.toString('utf8'), file, at)
      if (!parsed) return
      const previous = partials.get(parsed.id)
      partials.set(parsed.id, previous ? mergePartials(previous, parsed) : parsed)
    }
    // Chunks of an unterminated line are held and joined once, not re-joined per chunk.
    let pending: Buffer[] = []
    let lineStart = 0
    let chunkStart = 0
    for await (const chunk of createReadStream(join(this.projectsDir, file)) as AsyncIterable<Buffer>) {
      let start = 0
      let end: number
      while ((end = chunk.indexOf(10, start)) !== -1) {
        if (pending.length) {
          pending.push(chunk.subarray(start, end))
          addLine(Buffer.concat(pending), lineStart)
          pending = []
        } else addLine(chunk.subarray(start, end), chunkStart + start)
        start = end + 1
      }
      if (start < chunk.length) {
        if (!pending.length) lineStart = chunkStart + start
        pending.push(chunk.subarray(start))
      }
      chunkStart += chunk.length
    }
    // A trailing fragment is not a committed JSONL line; future incremental reads resume here.
    return partials
  }

  private async build(): Promise<void> {
    const files = (await this.discover()).sort()
    this.progress.filesTotal = files.length
    for (const file of files) {
      try {
        const partials = await this.readPartials(file)
        this.files.set(file, partials)
        for (const id of partials.keys()) {
          let sources = this.responseFiles.get(id)
          if (!sources) this.responseFiles.set(id, sources = new Set())
          sources.add(file)
          this.recompute(id)
        }
      } catch (error) {
        this.progress.skippedFiles++
        console.warn(`Skipping unreadable usage transcript ${file}:`, error)
      }
      this.progress.filesIndexed++
      await setImmediate()
    }
    await this.buildProjectOptions()
    this.progress.lastUpdatedAt = this.clock().toISOString()
    this.progress.state = 'ready'
  }

  /** Removing the old contribution before adding its replacement also supports later file updates. */
  private recompute(id: string): void {
    const previous = this.contributions.get(id)
    if (previous) {
      const { row, times } = this.rows.get(previous.key)!
      times.delete(id)
      row.requests--
      for (const field of COUNT_FIELDS) row[field] -= previous.row[field]
      if (!row.requests) this.rows.delete(previous.key)
      else if (previous.row.firstAt === row.firstAt || previous.row.firstAt === row.lastAt) {
        row.firstAt = Infinity; row.lastAt = -Infinity
        for (const time of times.values()) { row.firstAt = Math.min(row.firstAt, time); row.lastAt = Math.max(row.lastAt, time) }
      }
      for (const [key, tool] of previous.tools) this.addToolCount(key, tool, -tool.count)
      this.contributions.delete(id)
    }
    let effective: PartialRecord | undefined
    let attribution: { file: string; partial: PartialRecord } | undefined
    for (const file of this.responseFiles.get(id) ?? []) {
      const partial = this.files.get(file)!.get(id)!
      effective = effective ? mergePartials(effective, partial) : partial
      if (!attribution || isEarlier(partial.ts ?? Infinity, file, attribution.partial.ts ?? Infinity, attribution.file)) attribution = { file, partial }
    }
    if (!effective?.scalars.model || effective.ts === null || !attribution) return
    const tuple = classifyPath(attribution.file, attribution.partial)
    const row: UsageRow = {
      ...tuple, date: localDate(new Date(effective.ts)), model: effective.scalars.model.value,
      effort: effective.scalars.effort?.value ?? 'unknown', speed: effective.scalars.speed?.value ?? '', requests: 1, firstAt: effective.ts, lastAt: effective.ts,
      inputTokens: effective.inputTokens, outputTokens: effective.outputTokens, cacheReadTokens: effective.cacheReadTokens,
      cacheWrite5mTokens: effective.cacheWrite5mTokens, cacheWrite1hTokens: effective.cacheWrite1hTokens,
      thinkingTokens: effective.thinkingTokens, webSearchRequests: effective.webSearchRequests, webFetchRequests: effective.webFetchRequests,
    }
    const key = JSON.stringify([row.date, row.model, row.projectDir, row.sessionId, row.agentType, row.effort, row.speed])
    const tools = new Map<string, ToolRow>()
    for (const { name } of effective.tools.values()) {
      const toolKey = JSON.stringify([row.date, row.model, row.projectDir, row.sessionId, row.agentType, name])
      const tool = tools.get(toolKey)
      if (tool) tool.count++
      else tools.set(toolKey, { ...tuple, date: row.date, model: row.model, name, count: 1 })
    }
    for (const [toolKey, tool] of tools) this.addToolCount(toolKey, tool, tool.count)
    this.contributions.set(id, { key, row, tools })
    const bucket = this.rows.get(key)
    if (!bucket) this.rows.set(key, { row: { ...row }, times: new Map([[id, effective.ts]]) })
    else {
      bucket.row.requests++
      for (const field of COUNT_FIELDS) bucket.row[field] += row[field]
      bucket.row.firstAt = Math.min(bucket.row.firstAt, row.firstAt)
      bucket.row.lastAt = Math.max(bucket.row.lastAt, row.lastAt)
      bucket.times.set(id, effective.ts)
    }
  }

  /** Tool rows share the usage rows' add/subtract path; a bucket that reaches zero disappears. */
  private addToolCount(key: string, tool: ToolRow, delta: number): void {
    const bucket = this.toolRows.get(key)
    if (!bucket) this.toolRows.set(key, { ...tool, count: delta })
    else if (!(bucket.count += delta)) this.toolRows.delete(key)
  }

  private async buildProjectOptions(): Promise<void> {
    const projects = new Set([...this.rows.values()].map(bucket => bucket.row.projectDir))
    const earliest = new Map<string, { ts: number; file: string; cwd?: string }>()
    for (const [file, partials] of this.files) {
      const project = file.split('/')[0]
      if (!projects.has(project)) continue
      for (const partial of partials.values()) {
        if (!partial.scalars.model || partial.ts === null) continue
        const prior = earliest.get(project)
        if (!prior || isEarlier(partial.ts, file, prior.ts, prior.file)) {
          earliest.set(project, { ts: partial.ts, file, cwd: partial.scalars.cwd?.value })
        }
      }
    }
    for (const projectDir of projects) {
      let originalPath: string | undefined
      try {
        const index = JSON.parse(await readFile(join(this.projectsDir, projectDir, 'sessions-index.json'), 'utf8'))
        if (typeof index.originalPath === 'string' && index.originalPath) originalPath = index.originalPath
      } catch { /* Optional metadata; transcripts remain authoritative. */ }
      const projectPath = originalPath ?? earliest.get(projectDir)?.cwd ?? decodeProjectDir(projectDir)
      this.projectOptions.set(projectDir, toProjectOption(projectDir, projectPath))
    }
  }
}
