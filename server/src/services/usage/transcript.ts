export interface TranscriptUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWrite5mTokens: number
  cacheWrite1hTokens: number
  thinkingTokens: number
}

/** Message shape that receives a response's merged totals once its transcript is fully read. */
export interface TranscriptUsageTarget {
  inputTokens?: number
  outputTokens?: number
}

const USAGE_FIELDS = [
  'inputTokens', 'outputTokens', 'cacheReadTokens',
  'cacheWrite5mTokens', 'cacheWrite1hTokens', 'thinkingTokens',
] as const

function tokens(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
}

export function inputTokensIncludingCache(usage: TranscriptUsage): number {
  return usage.inputTokens + usage.cacheReadTokens + usage.cacheWrite5mTokens + usage.cacheWrite1hTokens
}

/** Only assistant responses carrying an id are record sources. */
export function parseTranscriptUsageEntry(entry: any): { id: string; usage: TranscriptUsage } | undefined {
  if (entry?.type !== 'assistant' || typeof entry.message?.id !== 'string' || !entry.message.id.length) return
  const usage = entry.message.usage
  const cacheWrite1hTokens = tokens(usage?.cache_creation?.ephemeral_1h_input_tokens)
  return {
    id: entry.message.id,
    usage: {
      inputTokens: tokens(usage?.input_tokens),
      outputTokens: tokens(usage?.output_tokens),
      cacheReadTokens: tokens(usage?.cache_read_input_tokens),
      cacheWrite1hTokens,
      cacheWrite5mTokens: Math.max(
        tokens(usage?.cache_creation?.ephemeral_5m_input_tokens),
        tokens(usage?.cache_creation_input_tokens) - cacheWrite1hTokens,
      ),
      thinkingTokens: tokens(usage?.output_tokens_details?.thinking_tokens),
    },
  }
}

/** For callers holding a raw line; malformed and unrelated lines are ignored. */
export function parseTranscriptUsageLine(line: string): { id: string; usage: TranscriptUsage } | undefined {
  if (!line.includes('"assistant"')) return
  try {
    return parseTranscriptUsageEntry(JSON.parse(line))
  } catch {
    // Transcripts can contain incomplete or malformed lines.
  }
}

/** One accumulator per transcript: response IDs never deduplicate across files. */
export class TranscriptUsageAccumulator {
  readonly records = new Map<string, TranscriptUsage>()
  private readonly firstTargets = new Map<string, TranscriptUsageTarget>()

  /** Merges one decoded entry. The first `target` seen per response receives its totals from `applyTotals`. */
  add(entry: unknown, target?: TranscriptUsageTarget): void {
    const parsed = parseTranscriptUsageEntry(entry)
    if (parsed) this.addParsed(parsed, target)
  }

  private addParsed(parsed: { id: string; usage: TranscriptUsage }, target?: TranscriptUsageTarget): void {
    const previous = this.records.get(parsed.id)
    if (previous) {
      for (const field of USAGE_FIELDS) {
        previous[field] = Math.max(previous[field], parsed.usage[field])
      }
    } else {
      this.records.set(parsed.id, parsed.usage)
    }
    if (target && !this.firstTargets.has(parsed.id)) {
      this.firstTargets.set(parsed.id, target)
    }
  }

  addLine(line: string, target?: TranscriptUsageTarget): void {
    const parsed = parseTranscriptUsageLine(line)
    if (parsed) this.addParsed(parsed, target)
  }

  /** Totals are only final once the whole transcript has been read. */
  applyTotals(): void {
    for (const [id, merged] of this.records) {
      const target = this.firstTargets.get(id)
      if (!target) continue
      target.inputTokens = inputTokensIncludingCache(merged)
      target.outputTokens = merged.outputTokens
    }
  }

  totals(): { totalInputTokens: number; totalOutputTokens: number } {
    let totalInputTokens = 0
    let totalOutputTokens = 0
    for (const usage of this.records.values()) {
      totalInputTokens += inputTokensIncludingCache(usage)
      totalOutputTokens += usage.outputTokens
    }
    return { totalInputTokens, totalOutputTokens }
  }
}

export const SCALAR_FIELDS = ['model', 'speed', 'sessionId', 'agentId', 'cwd', 'gitBranch', 'version', 'entrypoint'] as const
export type ScalarField = typeof SCALAR_FIELDS[number]
export interface ScalarCandidate { value: string; at: number; offset: number; file: string }
export interface PartialRecord extends TranscriptUsage {
  id: string
  ts: number | null
  webSearchRequests: number
  webFetchRequests: number
  scalars: Partial<Record<ScalarField, ScalarCandidate>>
  isSidechain: boolean
}
export const COUNT_FIELDS = [...USAGE_FIELDS, 'webSearchRequests', 'webFetchRequests'] as const

export function compareCandidate(a: ScalarCandidate, b: ScalarCandidate): number {
  return (a.at === b.at ? 0 : a.at < b.at ? -1 : 1) || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0) || a.offset - b.offset
}

export function parsePartialLine(line: string, file: string, offset: number): PartialRecord | undefined {
  if (!line.includes('"assistant"')) return
  try {
    const entry = JSON.parse(line)
    const parsed = parseTranscriptUsageEntry(entry)
    if (!parsed) return
    const time = typeof entry.timestamp === 'string' ? Date.parse(entry.timestamp) : NaN
    const at = Number.isFinite(time) ? time : Infinity
    const scalars: PartialRecord['scalars'] = {}
    for (const field of SCALAR_FIELDS) {
      const value = field === 'model' ? entry.message.model : field === 'speed' ? entry.message.usage?.speed : entry[field]
      if (typeof value === 'string' && value.length && !(field === 'model' && value === '<synthetic>')) {
        scalars[field] = { value, at, offset, file }
      }
    }
    return { id: parsed.id, ...parsed.usage, ts: Number.isFinite(at) ? at : null, scalars,
      webSearchRequests: tokens(entry.message.usage?.server_tool_use?.web_search_requests),
      webFetchRequests: tokens(entry.message.usage?.server_tool_use?.web_fetch_requests), isSidechain: entry.isSidechain === true }
  } catch { /* Ignore malformed transcript lines. */ }
}

/** Preserves each candidate's original file through intermediate merges. */
export function mergePartials(a: PartialRecord, b: PartialRecord): PartialRecord {
  const result = { ...a, scalars: { ...a.scalars }, isSidechain: a.isSidechain || b.isSidechain }
  for (const field of COUNT_FIELDS) result[field] = Math.max(a[field], b[field])
  const ts = Math.min(a.ts ?? Infinity, b.ts ?? Infinity)
  result.ts = Number.isFinite(ts) ? ts : null
  for (const field of SCALAR_FIELDS) {
    const candidate = b.scalars[field]
    if (candidate && (!result.scalars[field] || compareCandidate(candidate, result.scalars[field]!) < 0)) result.scalars[field] = candidate
  }
  return result
}

export function classifyPath(file: string, partial: PartialRecord) {
  const segments = file.split('/')
  const basename = segments.at(-1) ?? ''
  const sessionId = segments.map(s => s.replace(/\.jsonl$/, '')).find(s => /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(s)) ?? ''
  return { projectDir: segments[0], sessionId: partial.scalars.sessionId?.value ?? sessionId,
    agentType: segments.includes('subagents') || basename.startsWith('agent-') || partial.isSidechain ? 'subagent' as const : 'main' as const }
}
