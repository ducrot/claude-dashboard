import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useUsageFilters } from '@/hooks/useUsageFilters'
import { formatNumber } from '@/lib/utils'
import { BuildingUsageIndex, UsageFilters, UsageKpis, UsageCharts, UsageModelsTable, UsageProjectsTable, UsageTools, UsageEffort } from '@/components/usage'

export default function Usage() {
  const filters = useUsageFilters()
  const { data: response, isLoading, error } = useQuery({
    queryKey: ['usage', filters.serverParams],
    queryFn: () => api.usage.get(filters.serverParams),
    refetchInterval: query => query.state.data?.index.state === 'building' ? 2000 : false,
  })
  return <div className="space-y-6">
    <header><h1 className="text-3xl font-bold tracking-tight">Usage</h1><p className="text-muted-foreground">Model, token, tool and effort statistics from local transcripts</p></header>
    <UsageFilters filters={filters} response={response} />
    {isLoading && <p className="py-10 text-muted-foreground" role="status">Loading usage…</p>}
    {error && <p className="rounded-lg border border-destructive/30 p-4 text-destructive" role="alert">Could not load usage. Check the selected dates and filters, and make sure the server is running.</p>}
    {response?.index.state === 'error' && <p role="alert" className="text-destructive">The usage index could not be built. Check the server log and restart the server.</p>}
    {response?.index.state === 'building' && <BuildingUsageIndex index={response.index} />}
    {response?.data && <>
      <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"><span>{response.query.from} — {response.query.to} · server-local dates</span><span>{formatNumber(response.index.filesIndexed)} transcript files indexed{response.index.skippedFiles > 0 ? ` · ${response.index.skippedFiles} skipped` : ''}</span></div>
      <UsageKpis data={response.data} priceTable={response.priceTable} />
      <UsageCharts data={response.data} metric={filters.metric} onMetric={v => filters.set('metric', v)} />
      <UsageModelsTable models={response.data.models} metric={filters.metric} activeModel={filters.get('model')} onModel={v => filters.set('model', v)} />
      <UsageProjectsTable projects={response.data.projects} models={response.data.models} metric={filters.metric} serverParams={filters.serverParams} />
      <UsageTools tools={response.data.tools} toolsByMcp={response.data.toolsByMcp} grouping={filters.mcp} onGrouping={v => filters.set('mcp', v)} />
      <UsageEffort effort={response.data.effort} models={response.data.models} metric={filters.metric} />
    </>}
  </div>
}
