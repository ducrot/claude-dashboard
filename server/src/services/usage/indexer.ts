import { createHash, randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { EventEmitter } from 'node:events'
import { open, readdir, readFile, mkdir, writeFile, rename, rm } from 'node:fs/promises'
import { isAbsolute, join, relative, sep, dirname } from 'node:path'
import { setImmediate, setTimeout as delay } from 'node:timers/promises'
import { paths } from '../../config/paths.js'
import { classifyPath, COUNT_FIELDS, mergePartials, parsePartialLine, type PartialRecord, type TranscriptUsage } from './transcript.js'
import { decodeCache, encodeCache } from './cache.js'
import { localDate } from './ranges.js'

export interface IndexStatus {
  bytesRead: number; fullRereads: number
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

export interface FileState {
  size: number; mtimeMs: number; ino: number; offset: number; headHash: string; tailHash: string
}
/** Window size of each anchor; the tail reserves one byte for the newline it appends. */
const ANCHOR = 4096
/** Shortest gap between two cache writes while the index is being updated. */
const PERSIST_INTERVAL_MS = 30_000
const EMPTY = Buffer.alloc(0)
const NEWLINE = Buffer.from('\n')
const sha1 = (bytes: Buffer) => createHash('sha1').update(bytes).digest('hex')

export class UsageIndexer extends EventEmitter {
  readonly cacheFile: string
  private cacheTimer?: ReturnType<typeof setTimeout>
  private cacheWrite: Promise<void> = Promise.resolve()
  private lastPersisted = 0
  private shutdownWork?: Promise<void>
  readonly projectsDir: string
  readonly clock: () => Date
  readonly files = new Map<string, Map<string, PartialRecord>>()
  readonly responseFiles = new Map<string, Set<string>>()
  readonly rows = new Map<string, RowBucket>()
  readonly toolRows = new Map<string, ToolRow>()
  readonly projectOptions = new Map<string, ProjectOption>()
  private readonly contributions = new Map<string, Contribution>()
  readonly fileStates = new Map<string, FileState>()
  private readonly pending = new Map<string, number>()
  private readonly debounceMs: number
  private readonly throttleMs: number
  private draining = false
  private processing = false
  private lastEmitted = -Infinity
  private updateTimer?: ReturnType<typeof setTimeout>
  private idle: Promise<void> = Promise.resolve()
  private started = false
  private progress: Omit<IndexStatus, 'pendingFiles'> = { bytesRead: 0, fullRereads: 0, state: 'building', filesTotal: 0, filesIndexed: 0, lastUpdatedAt: null, startedAt: null, skippedFiles: 0 }

  constructor(options: { projectsDir?: string; cacheFile?: string; clock?: () => Date; debounceMs?: number; throttleMs?: number } = {}) {
    super()
    this.cacheFile = options.cacheFile ?? paths.usageCacheFile
    this.debounceMs = options.debounceMs ?? 1000
    this.throttleMs = options.throttleMs ?? 5000
    this.projectsDir = options.projectsDir ?? paths.projects
    this.clock = options.clock ?? (() => new Date())
  }
  start(): void {
    if (this.started) return
    this.started = true
    this.progress.startedAt = this.clock().toISOString()
    this.idle = this.build().catch(error => { this.progress.state = 'error'; console.error('Usage index build failed:', error) })
  }
  async whenIdle(): Promise<void> {
    let work
    do { work = this.idle; await work } while (work !== this.idle)
  }

  notifyChanged(path: string): void {
    if (this.closing) return
    const raw = isAbsolute(path) ? relative(this.projectsDir, path) : path
    if (raw === '..' || raw.startsWith(`..${sep}`) || isAbsolute(raw)) return
    // Indexed keys always use "/", while relative() uses the platform separator.
    const file = raw.split(sep).join('/')
    this.pending.set(file, Date.now() + this.debounceMs)
    if (this.draining) return
    this.draining = true
    this.idle = this.idle.then(() => this.drain()).catch(error => {
      this.progress.state = 'error'
      console.error('Usage index update failed:', error)
    }).finally(() => { this.draining = false })
  }

  private async drain(): Promise<void> {
    while (this.pending.size) {
      const due = Math.min(...this.pending.values())
      if (due > Date.now()) { await delay(due - Date.now()); continue }
      let changed = false
      for (const [file, at] of this.pending) {
        if (at > Date.now()) continue
        // Delete before awaiting so a notification during the read queues another pass.
        this.pending.delete(file)
        this.processing = true
        try { changed = await this.processSafely(file) || changed }
        finally { this.processing = false }
        await setImmediate()
      }
      this.schedulePersist()
      if (changed) {
        await this.refreshOptions()
        this.emitUpdated()
      }
    }
  }

  /** Project options and the update stamp always move together once an index pass changed something. */
  private async refreshOptions(): Promise<void> {
    await this.buildProjectOptions()
    this.progress.lastUpdatedAt = this.clock().toISOString()
  }

  private async markReady(): Promise<void> {
    await this.refreshOptions()
    this.progress.filesIndexed = this.progress.filesTotal
    this.progress.state = 'ready'
  }

  private emitUpdated(): void {
    if (this.updateTimer) return
    const remaining = this.throttleMs - (Date.now() - this.lastEmitted)
    if (remaining > 0) {
      this.updateTimer = setTimeout(() => {
        this.updateTimer = undefined
        this.emitUpdated()
      }, remaining)
      this.updateTimer.unref()
      return
    }
    this.lastEmitted = Date.now()
    this.emit('updated')
  }
  /** Rows outlive the options map when a build fails before it is filled, so derive a usable label instead of returning undefined. */
  projectOption(projectDir: string): ProjectOption {
    return this.projectOptions.get(projectDir) ?? toProjectOption(projectDir, decodeProjectDir(projectDir))
  }
  status(): IndexStatus {
    return { ...this.progress, pendingFiles: this.progress.filesTotal - this.progress.filesIndexed + this.pending.size + (this.processing ? 1 : 0) }
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

  private replacePartials(file: string, partials?: Map<string, PartialRecord>): void {
    const affected = new Set(this.files.get(file)?.keys())
    for (const id of affected) {
      const sources = this.responseFiles.get(id)!
      sources.delete(file)
      if (!sources.size) this.responseFiles.delete(id)
    }
    this.files.delete(file)
    if (partials) {
      this.files.set(file, partials)
      for (const id of partials.keys()) {
        let sources = this.responseFiles.get(id)
        if (!sources) this.responseFiles.set(id, sources = new Set())
        sources.add(file)
        affected.add(id)
      }
    }
    for (const id of affected) this.recompute(id)
  }

  private async processSafely(file: string): Promise<boolean> {
    try { return await this.processFile(file) }
    catch (error) {
      this.progress.skippedFiles++
      console.warn(`Skipping unreadable usage transcript ${file}:`, error)
      return false
    }
  }

  /** A vanished path drops its own state and every file indexed below it, so a removed directory takes its transcripts with it. */
  private removeIndexed(file: string): boolean {
    let changed = false
    for (const indexed of this.fileStates.keys()) {
      if (indexed === file || indexed.startsWith(file ? `${file}/` : '')) {
        this.replacePartials(indexed)
        this.fileStates.delete(indexed)
        changed = true
      }
    }
    return changed
  }

  private async processFile(file: string): Promise<boolean> {
    let handle
    try { handle = await open(join(this.projectsDir, file), 'r') }
    catch (error) {
      if (!['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error
      return this.removeIndexed(file)
    }
    try {
      const stat = await handle.stat()
      const { size, mtimeMs, ino } = stat
      if (!stat.isFile() || !file.endsWith('.jsonl')) return false
      const prior = this.fileStates.get(file)
      const readAnchor = async (start: number, end: number) => {
        const buffer = Buffer.alloc(end - start)
        let read = 0
        while (read < buffer.length) {
          const { bytesRead } = await handle.read(buffer, read, buffer.length - read, start + read)
          if (!bytesRead) break
          read += bytesRead
        }
        return buffer.subarray(0, read)
      }
      // Only growth on the same inode behind two intact anchors can resume; every other rule falls through to a full re-read.
      let full = true, head = EMPTY, tail = EMPTY, start = 0
      if (prior && ino === prior.ino && size >= prior.size) {
        if (size === prior.size && mtimeMs === prior.mtimeMs) return false
        if (size > prior.size) {
          const priorHead = await readAnchor(0, Math.min(prior.offset, ANCHOR))
          const priorTail = await readAnchor(Math.max(0, prior.offset - ANCHOR), prior.offset)
          if (sha1(priorHead) === prior.headHash && sha1(priorTail) === prior.tailHash) {
            full = false; head = priorHead; tail = priorTail; start = prior.offset
          }
        }
      }
      if (full && prior) this.progress.fullRereads++
      const partials = full ? new Map<string, PartialRecord>() : new Map(this.files.get(file))
      let offset = start
      let chunkStart = start
      let pending: Buffer[] = []
      // The descriptor and explicit end bind this pass to the pre-read stat, even during append/rename.
      if (start < size) for await (const chunk of handle.createReadStream({ start, end: size - 1, autoClose: false }) as AsyncIterable<Buffer>) {
        this.progress.bytesRead += chunk.length
        let from = 0
        let end: number
        while ((end = chunk.indexOf(10, from)) !== -1) {
          const line = pending.length ? Buffer.concat([...pending, chunk.subarray(from, end)]) : chunk.subarray(from, end)
          // Anchors describe consumed bytes, not a second read that might see a concurrent rewrite.
          if (head.length < ANCHOR) head = Buffer.concat([head, line.subarray(0, ANCHOR - head.length), NEWLINE]).subarray(0, ANCHOR)
          tail = Buffer.concat([tail, line.subarray(Math.max(0, line.length - (ANCHOR - 1))), NEWLINE]).subarray(-ANCHOR)
          const parsed = parsePartialLine(line.toString('utf8'), file, offset)
          if (parsed) {
            const previous = partials.get(parsed.id)
            partials.set(parsed.id, previous ? mergePartials(previous, parsed) : parsed)
          }
          pending = []
          offset = chunkStart + end + 1
          from = end + 1
        }
        if (from < chunk.length) pending.push(chunk.subarray(from))
        chunkStart += chunk.length
      }
      const headHash = sha1(head)
      const tailHash = sha1(tail)
      const changed = !prior || !isDeepStrictEqual(this.files.get(file), partials)
      this.fileStates.set(file, { size, mtimeMs, ino, offset, headHash, tailHash })
      if (changed) this.replacePartials(file, partials)
      return changed
    } finally { await handle.close() }
  }

  private get closing(): boolean { return this.shutdownWork !== undefined }
  private persistDelay(): number { return Math.max(0, PERSIST_INTERVAL_MS - (Date.now() - this.lastPersisted)) }

  /** Serialized atomic writes prevent an older snapshot from replacing a newer one. */
  async persist(throttled = false): Promise<void> {
    this.cacheWrite = this.cacheWrite.then(async () => {
      // Waiting for the queue can leave a throttled write inside the interval after all; re-arm instead.
      if (throttled && this.persistDelay() > 0) {
        this.schedulePersist()
        return
      }
      const temporary = `${this.cacheFile}.${process.pid}.${randomUUID()}.tmp`
      try {
        // Encoding inside the guard keeps a failure from poisoning the queue; the last valid cache stays.
        const text = encodeCache(this.projectsDir, this.fileStates, this.files)
        await mkdir(dirname(this.cacheFile), { recursive: true })
        await writeFile(temporary, text)
        await rename(temporary, this.cacheFile)
        this.lastPersisted = Date.now()
      } catch (error) {
        console.warn('Unable to persist usage cache:', error)
        await rm(temporary, { force: true }).catch(() => {})
      }
    })
    await this.cacheWrite
  }

  private schedulePersist(): void {
    if (this.cacheTimer || this.closing) return
    this.cacheTimer = setTimeout(() => {
      this.cacheTimer = undefined
      void this.whenIdle().then(() => this.persist(true)).catch(error => console.warn('Unable to persist usage cache:', error))
    }, this.persistDelay())
    this.cacheTimer.unref()
  }

  shutdown(): Promise<void> {
    if (this.shutdownWork) return this.shutdownWork
    clearTimeout(this.cacheTimer)
    clearTimeout(this.updateTimer)
    return this.shutdownWork = this.whenIdle().then(() => this.persist())
  }

  private async build(): Promise<void> {
    let cached
    try { cached = decodeCache(await readFile(this.cacheFile, 'utf8'), this.projectsDir) }
    catch { /* A derived cache is optional: missing, incompatible and corrupt files rebuild. */ }
    const files = (await this.discover()).sort()
    this.progress.filesTotal = files.length
    if (cached) {
      for (const file of files) {
        const state = cached.states.get(file)
        if (!state) continue
        this.fileStates.set(file, state)
        this.replacePartials(file, cached.files.get(file))
      }
      await this.markReady()
      console.log(`Usage index cache loaded (${this.fileStates.size} files); reconciling in background`)
      this.emit('ready')
      await setImmediate()
      let changed = false
      for (const file of files) {
        changed = await this.processSafely(file) || changed
        await setImmediate()
      }
      if (changed) {
        await this.refreshOptions()
        this.emitUpdated()
      }
    } else {
      console.log(`Building usage index (${files.length} files)`)
      for (const file of files) {
        await this.processSafely(file)
        this.progress.filesIndexed++
        await setImmediate()
      }
      await this.markReady()
      this.emit('ready')
    }
    await this.persist()
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
    const options = new Map<string, ProjectOption>()
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
      options.set(projectDir, toProjectOption(projectDir, projectPath))
    }
    // Swapped without awaiting, so a request never observes a half-filled map.
    this.projectOptions.clear()
    for (const [projectDir, option] of options) this.projectOptions.set(projectDir, option)
  }
}
