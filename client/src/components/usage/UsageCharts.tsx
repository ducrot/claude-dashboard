import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { MetricValues, UsageModelInfo, UsageResponse } from '@/lib/api'
import type { UsageMetric } from '@/hooks/useUsageFilters'
import { formatCompactCount, formatUsd } from '@/lib/utils'

export const metricLabels: Record<UsageMetric, string> = { output: 'Output tokens', requests: 'Requests', total: 'Total tokens (incl. cache)', cost: 'Estimated cost' }
const metricField = { output: 'outputTokens', requests: 'requests', total: 'totalTokens', cost: 'costUsd' } as const
export function metricValue(values: MetricValues, metric: UsageMetric): number | null {
  return values[metricField[metric]]
}
export function formatMetric(value: number | null, metric: UsageMetric): string {
  return value === null ? 'No price' : metric === 'cost' ? formatUsd(value) : formatCompactCount(value)
}
const palette = { Opus: ['#c86a39', '#e08b4b', '#b85233', '#d6a05b', '#b77943'], Sonnet: ['#397fb8', '#539bc1', '#37759a'], Haiku: ['#399078', '#67a48b'], Fable: ['#a763a3', '#c481b1'], Other: ['#748093', '#96a0ad'] }
const versions: Record<UsageModelInfo['family'], string[]> = { Opus: ['claude-opus-4-5', 'claude-opus-4-6', 'claude-opus-4-7', 'claude-opus-4-8', 'claude-opus-5'], Sonnet: ['claude-sonnet-4-5', 'claude-sonnet-4-6', 'claude-sonnet-5'], Haiku: ['claude-3-5-haiku', 'claude-haiku-4-5'], Fable: ['claude-fable-5', 'claude-fable-5-1'], Other: [] }
/** Stable per-string number, so a value outside the catalogs keeps its color across renders. */
export function hashString(value: string): number {
  let hash = 0
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return hash
}
export function modelColor(model: UsageModelInfo): string {
  const normalized = model.modelId.replace(/-\d{8}$/, '')
  const colors = palette[model.family]
  const version = versions[model.family].indexOf(normalized)
  if (version >= 0) return colors[version]
  return colors[hashString(normalized) % colors.length]
}
export function UsageCharts({ data, metric, onMetric }: { data: NonNullable<UsageResponse['data']>; metric: UsageMetric; onMetric: (value: string) => void }) {
  // Numeric keys avoid treating dots in an unknown model id as nested Recharts paths.
  const chartData = useMemo(() => data.series.map(row => ({ bucket: row.bucket, ...Object.fromEntries(data.models.map((model, i) => [`m${i}`, metricValue(row.byModel[model.modelId], metric)])) })), [data, metric])
  const sorted = useMemo(() => [...data.models].sort((a, b) => (metricValue(b, metric) ?? -1) - (metricValue(a, metric) ?? -1)), [data, metric])
  const largest = useMemo(() => Math.max(1, ...sorted.map(model => metricValue(model, metric) ?? 0)), [sorted, metric])
  return <>
    <Card>
      <CardHeader className="gap-3"><CardTitle>Models over time</CardTitle>
        <Tabs value={metric} onValueChange={onMetric}><TabsList aria-label="Chart metric" className="h-auto flex-wrap justify-start">{Object.entries(metricLabels).map(([value, label]) => <TabsTrigger key={value} value={value}>{label}</TabsTrigger>)}</TabsList></Tabs>
      </CardHeader>
      <CardContent>
        {data.models.length ? <div className="h-80 w-full min-w-0"><ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 800, height: 320 }}>
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
            <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} minTickGap={32} />
            <YAxis tickFormatter={v => formatMetric(Number(v), metric)} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} width={65} />
            <ChartTooltip content={({ active, payload, label }) => active && payload?.length ? <div className="max-w-sm rounded-lg border bg-popover p-3 text-sm text-popover-foreground shadow-md">
              <p className="mb-2 font-medium">{label}</p>{payload.map(item => {
                const model = data.models[Number(String(item.dataKey).slice(1))]
                if (!model) return null
                return <div className="mb-1" key={model.modelId}><div className="flex justify-between gap-5"><span style={{ color: modelColor(model) }}>{model.displayName}</span><span>{formatMetric(item.value == null ? null : Number(item.value), metric)}</span></div><p className="break-all font-mono text-xs text-muted-foreground">{model.modelId}</p></div>
              })}
            </div> : null} />
            {data.models.map((model, i) => <Bar key={model.modelId} dataKey={`m${i}`} name={model.displayName} stackId="models" fill={modelColor(model)} maxBarSize={48} isAnimationActive={false} />)}
          </BarChart>
        </ResponsiveContainer></div> : <p className="py-16 text-center text-muted-foreground">No usage in this range and filter selection.</p>}
        <ul aria-label="Model legend" className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs">{data.models.map(model => <li key={model.modelId} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: modelColor(model) }} />{model.displayName}</li>)}</ul>
        {metric === 'cost' && data.totals.cost.unpricedRequests > 0 && <p className="mt-3 text-xs text-muted-foreground">Unpriced contributions are omitted from cost bars. See “No price” in the Models table.</p>}
      </CardContent>
    </Card>
    <Card><CardHeader><CardTitle>Model distribution</CardTitle></CardHeader><CardContent className="space-y-4">
      {sorted.map(model => { const value = metricValue(model, metric); return <div key={model.modelId} className="grid grid-cols-[7rem_1fr_5rem] items-center gap-4 text-sm sm:grid-cols-[9rem_1fr_7rem]">
        <span>{model.displayName}</span><div className="h-3 overflow-hidden rounded-sm bg-muted"><div className="h-full rounded-sm transition-all" style={{ width: `${value === null ? 0 : value / largest * 100}%`, backgroundColor: modelColor(model) }} /></div><span className="text-right font-mono text-xs tabular-nums">{formatMetric(value, metric)}</span>
      </div> })}
      {!sorted.length && <p className="text-sm text-muted-foreground">No models in this selection.</p>}
    </CardContent></Card>
  </>
}
