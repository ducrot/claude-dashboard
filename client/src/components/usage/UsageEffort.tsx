import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { UsageModelInfo, UsageResponse } from '@/lib/api'
import type { UsageMetric } from '@/hooks/useUsageFilters'
import { formatMetric, hashString, metricLabels, metricValue, modelColor } from './UsageCharts'

const known = ['low', 'medium', 'high', 'xhigh', 'max']
const colors = ['#399078', '#397fb8', '#c89436', '#c86a39', '#a763a3']
function effortColor(level: string): string {
  if (level === 'unknown') return '#88919e'
  const index = known.indexOf(level)
  if (index >= 0) return colors[index]
  return `hsl(${hashString(level) % 360} 45% 48%)`
}
export function UsageEffort({ effort, models, metric }: {
  effort: NonNullable<UsageResponse['data']>['effort']; models: UsageModelInfo[]; metric: UsageMetric
}) {
  const present = new Set(effort.byModel.flatMap(row => Object.keys(row.byEffort)))
  const levels = [...known.filter(level => present.has(level)), ...[...present].filter(level => !known.includes(level) && level !== 'unknown').sort(), ...(present.has('unknown') ? ['unknown'] : [])]
  // Safe numeric keys preserve raw levels containing dots or object prototype names.
  const chartData = effort.series.map(row => ({ bucket: row.bucket, ...Object.fromEntries(levels.map((level, i) => [`e${i}`, row.byEffort[level] ? metricValue(row.byEffort[level], metric) : 0])) }))
  const unpriced = metric === 'cost' && effort.byModel.some(row => Object.values(row.byEffort).some(value => value.costUsd === null))
  return <Card>
    <CardHeader><CardTitle>Effort levels</CardTitle><p className="text-xs text-muted-foreground">{metricLabels[metric]} · effort recorded on each response</p></CardHeader>
    <CardContent className="space-y-6">
      {levels.length ? <>
        <div role="img" aria-label={`Effort over time: ${metricLabels[metric]}`} className="h-72 w-full min-w-0"><ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 800, height: 288 }}>
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
            <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} minTickGap={32} />
            <YAxis width={65} tickFormatter={value => formatMetric(Number(value), metric)} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
            <ChartTooltip content={({ active, payload, label }) => active && payload?.length ? <div className="rounded-lg border bg-popover p-3 text-sm text-popover-foreground shadow-md"><p className="mb-2 font-medium">{label}</p>{payload.map(item => <div key={String(item.dataKey)} className="flex justify-between gap-5"><span>{item.name}</span><span>{formatMetric(item.value == null ? null : Number(item.value), metric)}</span></div>)}</div> : null} />
            {levels.map((level, i) => <Bar key={level} dataKey={`e${i}`} name={level} stackId="effort" fill={effortColor(level)} maxBarSize={48} isAnimationActive={false} />)}
          </BarChart>
        </ResponsiveContainer></div>
        <ul aria-label="Effort legend" className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs">{levels.map(level => <li key={level} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: effortColor(level) }} />{level}</li>)}</ul>
        <div className="space-y-4"><h3 className="text-sm font-medium">Effort by model · share of {metricLabels[metric].toLowerCase()}</h3>
          {models.map(model => {
            const row = effort.byModel.find(value => value.modelId === model.modelId)
            if (!row) return null
            const values = levels.map(level => row.byEffort[level] ? metricValue(row.byEffort[level], metric) : 0)
            const total = values.reduce<number>((sum, value) => sum + (value ?? 0), 0)
            const noPrice = values.some(value => value === null)
            return <div key={model.modelId} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3 text-xs"><Tooltip><TooltipTrigger asChild><span tabIndex={0} className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: modelColor(model) }} />{model.displayName}</span></TooltipTrigger><TooltipContent>{model.modelId}</TooltipContent></Tooltip><span className="text-muted-foreground">{noPrice ? 'No price' : formatMetric(total, metric)}</span></div>
              {noPrice || !total ? <p className="text-xs text-muted-foreground">{noPrice ? 'Effort shares unavailable without a price.' : 'No usage for this metric.'}</p> : <div aria-label={`${model.displayName} effort shares`} className="flex h-6 overflow-hidden rounded bg-muted">{levels.map((level, i) => {
                const share = (values[i] ?? 0) / total * 100
                return share > 0 ? <Tooltip key={level}><TooltipTrigger asChild><div tabIndex={0} aria-label={`${level}: ${share.toFixed(1)}%`} className="h-full" style={{ width: `${share}%`, backgroundColor: effortColor(level) }} /></TooltipTrigger><TooltipContent>{level}: {share.toFixed(1)}% · {formatMetric(values[i], metric)}</TooltipContent></Tooltip> : null
              })}</div>}
            </div>
          })}
        </div>
        {unpriced && <p className="text-xs text-muted-foreground">No price is available for some effort totals. Unpriced totals are omitted from the cost chart.</p>}
      </> : <p className="py-12 text-center text-muted-foreground">No effort data in this range and filter selection.</p>}
    </CardContent>
  </Card>
}
