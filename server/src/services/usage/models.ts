import type { TranscriptUsage } from './transcript.js'

export const PRICE_TABLE_AS_OF = '2026-09-17'
export const PRICE_TABLE_SOURCE = 'https://platform.claude.com/docs/en/about-claude/pricing'
export type ModelFamily = 'Opus' | 'Sonnet' | 'Haiku' | 'Fable' | 'Other'
type Prices = readonly [number, number, number, number, number]
const opus: Prices = [5, 6.25, 10, 0.5, 25]
const sonnet: Prices = [3, 3.75, 6, 0.3, 15]
const fast: Prices = [10, 12.5, 20, 1, 50]
const catalog: Record<string, { displayName: string; family: ModelFamily; prices: Prices; fast?: Prices }> = {
  'claude-fable-5-1': { displayName: 'Fable 5.1', family: 'Fable', prices: [10, 12.5, 20, 0.25, 50] },
  'claude-fable-5': { displayName: 'Fable 5', family: 'Fable', prices: fast },
  'claude-opus-5': { displayName: 'Opus 5', family: 'Opus', prices: opus, fast },
  'claude-opus-4-8': { displayName: 'Opus 4.8', family: 'Opus', prices: opus, fast },
  'claude-opus-4-7': { displayName: 'Opus 4.7', family: 'Opus', prices: opus },
  'claude-opus-4-6': { displayName: 'Opus 4.6', family: 'Opus', prices: opus },
  'claude-opus-4-5': { displayName: 'Opus 4.5', family: 'Opus', prices: opus },
  'claude-sonnet-5': { displayName: 'Sonnet 5', family: 'Sonnet', prices: [2, 2.5, 4, 0.2, 10] },
  'claude-sonnet-4-6': { displayName: 'Sonnet 4.6', family: 'Sonnet', prices: sonnet },
  'claude-sonnet-4-5': { displayName: 'Sonnet 4.5', family: 'Sonnet', prices: sonnet },
  'claude-haiku-4-5': { displayName: 'Haiku 4.5', family: 'Haiku', prices: [1, 1.25, 2, 0.1, 5] },
  'claude-3-5-haiku': { displayName: 'Haiku 3.5', family: 'Haiku', prices: [0.8, 1, 1.6, 0.08, 4] },
}
/** Price tuple positions, in order. */
const PRICED_FIELDS = ['inputTokens', 'cacheWrite5mTokens', 'cacheWrite1hTokens', 'cacheReadTokens', 'outputTokens'] as const
const WEB_SEARCH_USD_PER_REQUEST = 0.01
const normalize = (id: string) => id.replace(/-\d{8}$/, '')
/** Guards against raw model ids reaching Object.prototype members. */
const entry = (normalized: string) => Object.hasOwn(catalog, normalized) ? catalog[normalized] : undefined
export function modelInfo(modelId: string): { modelId: string; displayName: string; family: ModelFamily } {
  const normalized = normalize(modelId)
  const known = entry(normalized)
  if (known) return { modelId, displayName: known.displayName, family: known.family }
  const modern = /^claude-([a-z]+)-(\d+)(?:-(\d+))?$/.exec(normalized)
  const legacy = /^claude-(\d+)-(\d+)-([a-z]+)$/.exec(normalized)
  const familyName = modern?.[1] ?? legacy?.[3]
  if (!familyName) return { modelId, displayName: modelId, family: 'Other' }
  const name = familyName[0].toUpperCase() + familyName.slice(1)
  const version = modern ? [modern[2], modern[3]].filter(Boolean).join('.') : `${legacy![1]}.${legacy![2]}`
  return { modelId, displayName: `${name} ${version}`, family: ['Opus', 'Sonnet', 'Haiku', 'Fable'].includes(name) ? name as ModelFamily : 'Other' }
}
export function estimateCost(modelId: string, speed: string, usage: TranscriptUsage & { webSearchRequests: number }): number | null {
  const model = entry(normalize(modelId))
  const price = speed === 'fast' ? model?.fast : model?.prices
  if (!price) return null
  let tokenCost = 0
  for (const [index, field] of PRICED_FIELDS.entries()) tokenCost += usage[field] * price[index]
  return tokenCost / 1e6 + usage.webSearchRequests * WEB_SEARCH_USD_PER_REQUEST
}
