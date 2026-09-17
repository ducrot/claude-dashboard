import { Info } from 'lucide-react'
import { StatsCard } from '@/components/dashboard'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { UsageResponse } from '@/lib/api'
import { formatCompactCount as count, formatPercent, formatUsd } from '@/lib/utils'

export function UsageKpis({ data, priceTable }: { data: NonNullable<UsageResponse['data']>; priceTable: UsageResponse['priceTable'] }) {
  const t = data.totals
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
    <StatsCard title="API requests" value={count(t.requests)} />
    <StatsCard title="Output tokens" value={count(t.outputTokens)} description={`Includes ${count(t.thinkingTokens)} thinking tokens`} />
    <StatsCard title="Input tokens (incl. cache)" value={count(t.inputTokensIncludingCache)} description={`${count(t.inputTokens)} uncached · ${count(t.cacheReadTokens)} cache read · ${count(t.cacheWrite5mTokens)} 5m / ${count(t.cacheWrite1hTokens)} 1h writes`} />
    <StatsCard title="Sessions" value={count(t.sessions)} />
    <StatsCard title="Models used" value={count(t.models)} />
    <StatsCard title="Sub-agent share" value={formatPercent(t.subagent.requests, t.requests)} description={`${formatPercent(t.subagent.outputTokens, t.outputTokens)} of output tokens`} />
    <StatsCard title="Estimated API cost" value={`≈ ${formatUsd(t.cost.usd)}`} description="API list-price equivalent, not billed" className="sm:col-span-2 border-primary/25" icon={
      <Tooltip><TooltipTrigger asChild><button aria-label="About estimated API cost"><Info className="h-4 w-4" /></button></TooltipTrigger><TooltipContent className="max-w-sm">
        <p>Price table: {priceTable.asOf}</p><p>{t.cost.unpricedModels.length ? `Excludes ${count(t.cost.unpricedRequests)} unpriced requests: ${t.cost.unpricedModels.join(', ')}` : 'All selected requests have a price.'}</p><a className="underline" href={priceTable.source} target="_blank" rel="noreferrer">Pricing source</a>
      </TooltipContent></Tooltip>
    } />
  </div>
}
