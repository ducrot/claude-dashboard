import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { UsageModel } from '@/lib/api'
import type { UsageMetric } from '@/hooks/useUsageFilters'
import { formatCompactCount, formatDate, formatPercent, formatUsd } from '@/lib/utils'
import { metricLabels, metricValue, modelColor } from './UsageCharts'

export function UsageModelsTable({ models, metric, activeModel, onModel }: { models: UsageModel[]; metric: UsageMetric; activeModel: string; onModel: (id: string) => void }) {
  const denominator = models.reduce((sum, model) => sum + (metricValue(model, metric) ?? 0), 0)
  return <Card><CardHeader><CardTitle>Models</CardTitle><p className="text-xs text-muted-foreground">Select a model to filter the page. Select it again to clear.</p></CardHeader><CardContent>
    <div className="overflow-x-auto"><table className="w-full whitespace-nowrap text-sm">
      <thead><tr className="border-b text-left text-xs text-muted-foreground">{['Model', 'First use', 'Last use', 'Requests', 'Input', 'Output', 'Cache read', 'Cache write', `Share · ${metricLabels[metric]}`, 'Sessions', 'Estimated cost'].map(label => <th key={label} className="px-3 py-3 font-medium first:pl-0">{label}</th>)}</tr></thead>
      <tbody>{models.map(model => { const value = metricValue(model, metric); const select = () => onModel(activeModel === model.modelId ? '' : model.modelId); return <tr key={model.modelId} onClick={select} className={`cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/50 ${activeModel === model.modelId ? 'bg-primary/5' : ''}`}>
        <td className="py-4 pr-3"><Tooltip><TooltipTrigger asChild><button aria-pressed={activeModel === model.modelId} onClick={event => { event.stopPropagation(); select() }} className="flex items-center gap-2 font-medium"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: modelColor(model) }} />{model.displayName}</button></TooltipTrigger><TooltipContent>{model.modelId}</TooltipContent></Tooltip></td>
        <td className="px-3 py-4 text-xs">{formatDate(model.firstUsedAt)}</td><td className="px-3 py-4 text-xs">{formatDate(model.lastUsedAt)}</td>
        {[model.requests, model.inputTokens, model.outputTokens, model.cacheReadTokens].map((n, i) => <td key={i} className="px-3 py-4 font-mono text-xs tabular-nums">{formatCompactCount(n)}</td>)}
        <td className="px-3 py-4 font-mono text-xs"><span title="5-minute cache writes">{formatCompactCount(model.cacheWrite5mTokens)} 5m</span><br /><span title="1-hour cache writes" className="text-muted-foreground">{formatCompactCount(model.cacheWrite1hTokens)} 1h</span></td>
        <td className="px-3 py-4 tabular-nums">{value === null ? 'No price' : formatPercent(value, denominator)}</td>
        <td className="px-3 py-4 font-mono text-xs">{formatCompactCount(model.sessions)}</td>
        <td className="px-3 py-4 font-mono text-xs">{model.costUsd === null ? 'No price' : `≈ ${formatUsd(model.costUsd)}`}</td>
      </tr> })}</tbody>
    </table></div>
    {!models.length && <p className="py-6 text-sm text-muted-foreground">No models match these filters.</p>}
  </CardContent></Card>
}
