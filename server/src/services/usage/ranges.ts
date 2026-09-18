export type GroupBy = 'day' | 'week' | 'month'
export interface UsageQuery {
  range: string; from: string; to: string; groupBy: GroupBy
  project: string | null; family: string | null; model: string | null; agent: 'all' | 'main' | 'subagent'
}
export function localDate(date: Date): string {
  return `${date.getFullYear().toString().padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
export function parseDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Dates must use YYYY-MM-DD')
  const date = new Date(`${value}T12:00:00`)
  if (!Number.isFinite(date.getTime()) || localDate(date) !== value) throw new Error('Invalid calendar date')
  return date
}
export function resolveQuery(input: Record<string, unknown>, now: Date): UsageQuery {
  for (const key of ['range', 'from', 'to', 'groupBy', 'project', 'family', 'model', 'agent']) {
    if (input[key] !== undefined && (typeof input[key] !== 'string' || input[key] === '')) throw new Error(`Invalid ${key}`)
  }
  const range = (input.range ?? '30d') as string
  const groupBy = (input.groupBy ?? 'day') as GroupBy
  const agent = (input.agent ?? 'all') as UsageQuery['agent']
  const family = (input.family ?? null) as string | null
  if (!['day', 'week', 'month'].includes(groupBy)) throw new Error('Invalid groupBy')
  if (!['all', 'main', 'subagent'].includes(agent)) throw new Error('Invalid agent')
  if (family && !['opus', 'sonnet', 'haiku', 'fable'].includes(family)) throw new Error('Invalid family')
  let from = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12)
  let to = new Date(from)
  if (['7d', '30d', '90d'].includes(range)) from.setDate(from.getDate() - Number(range.slice(0, -1)) + 1)
  else if (range === 'this-month') from.setDate(1)
  else if (range === 'last-month') { from = new Date(now.getFullYear(), now.getMonth() - 1, 1, 12); to = new Date(now.getFullYear(), now.getMonth(), 0, 12) }
  else if (range === 'year') from = new Date(now.getFullYear(), 0, 1, 12)
  else if (range === 'custom') { from = parseDate(String(input.from ?? '')); to = parseDate(String(input.to ?? '')) }
  else throw new Error('Invalid range')
  if (from > to) throw new Error('from must be on or before to')
  return { range, from: localDate(from), to: localDate(to), groupBy, agent, family, project: (input.project as string | undefined) ?? null, model: (input.model as string | undefined) ?? null }
}
export function parseLimit(input: unknown, fallback: number, max: number): number {
  if (input === undefined) return fallback
  if (typeof input !== 'string' || !/^\d+$/.test(input)) throw new Error('Invalid limit')
  const limit = Number(input)
  if (limit < 1 || limit > max) throw new Error(`limit must be between 1 and ${max}`)
  return limit
}
export function bucketKey(day: string, groupBy: GroupBy): string {
  if (groupBy === 'month') return day.slice(0, 7)
  if (groupBy === 'day') return day
  const date = parseDate(day)
  date.setDate(date.getDate() - (date.getDay() + 6) % 7)
  return localDate(date)
}
export function buckets(query: UsageQuery): string[] {
  const result: string[] = []
  const date = parseDate(query.from)
  const end = parseDate(query.to)
  while (date <= end) {
    const bucket = bucketKey(localDate(date), query.groupBy)
    if (result.at(-1) !== bucket) result.push(bucket)
    if (query.groupBy === 'month') { date.setDate(1); date.setMonth(date.getMonth() + 1) }
    else date.setDate(date.getDate() + (query.groupBy === 'week' ? 7 - (date.getDay() + 6) % 7 : 1))
  }
  return result
}
