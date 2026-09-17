import { useSearchParams } from 'react-router-dom'

export const METRICS = ['output', 'requests', 'total', 'cost'] as const
export type UsageMetric = typeof METRICS[number]
const defaults: Record<string, string> = { range: '30d', groupBy: 'day', agent: 'all', metric: 'output' }
const serverKeys = ['range', 'from', 'to', 'groupBy', 'project', 'family', 'model', 'agent'] as const
export function useUsageFilters() {
  const [params, setParams] = useSearchParams()
  const get = (key: string) => params.get(key) ?? defaults[key] ?? ''
  const serverParams: Record<string, string> = {}
  for (const key of serverKeys) {
    const value = get(key)
    if ((key === 'from' || key === 'to') && get('range') !== 'custom') continue
    if (value) serverParams[key] = value
  }
  const rawMetric = get('metric') as UsageMetric
  const metric = METRICS.includes(rawMetric) ? rawMetric : 'output'
  const set = (key: string, value: string, extra: Record<string, string> = {}) => {
    setParams(previous => {
      const next = new URLSearchParams(previous)
      for (const [field, v] of Object.entries({ ...extra, [key]: value })) {
        if (!v || defaults[field] === v) next.delete(field)
        else next.set(field, v)
      }
      if (key === 'family') next.delete('model')
      if (key === 'range' && value !== 'custom') { next.delete('from'); next.delete('to') }
      return next
    })
  }
  return { get, set, serverParams, metric }
}
