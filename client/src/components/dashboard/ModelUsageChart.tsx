import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Stats } from '@/lib/api'
import { formatCompactCount, formatNumber } from '@/lib/utils'
import { modelColor } from '@/components/usage/UsageCharts'

export function ModelUsageChart({ data }: { data: Stats['modelUsage'] }) {
  const largest = Math.max(1, ...data.map(model => model.outputTokens))
  return (
    <Card>
      <CardHeader>
        <CardTitle>Model Usage</CardTitle>
        <div className="flex items-center justify-between gap-2 text-sm">
          <p className="text-muted-foreground">Output tokens · last 30 days</p>
          <Link to="/usage" className="text-primary underline underline-offset-4">View usage</Link>
        </div>
      </CardHeader>
      <CardContent>
        {data.length ? <ul aria-label="Model output tokens" className="space-y-4">
          {data.map(model => <li key={model.modelId} title={`${model.modelId}: ${formatNumber(model.outputTokens)} output tokens (${model.percentage}%)`}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="break-all font-medium">{model.displayName}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{formatCompactCount(model.outputTokens)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div className="h-full rounded-full" style={{ width: `${model.outputTokens / largest * 100}%`, backgroundColor: modelColor(model) }} />
            </div>
          </li>)}
        </ul> : <p className="py-16 text-center text-muted-foreground">No usage in the last 30 days.</p>}
      </CardContent>
    </Card>
  )
}
