import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { UsageTool } from '@/lib/api'
import { formatNumber, formatPercent } from '@/lib/utils'

export function UsageTools({ tools, toolsByMcp, grouping, onGrouping }: {
  tools: UsageTool[]; toolsByMcp: UsageTool[]; grouping: 'tool' | 'server'; onGrouping: (value: string) => void
}) {
  const rows = grouping === 'server' ? toolsByMcp : tools
  const total = tools.reduce((sum, row) => sum + row.count, 0)
  const largest = rows[0]?.count || 1
  const label = (row: UsageTool) => grouping === 'server' && row.mcpServer ? `MCP: ${row.mcpServer}` : row.name
  const key = (row: UsageTool) => JSON.stringify([row.mcpServer, row.name])
  return <Card>
    <CardHeader className="gap-3"><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle>Tool usage</CardTitle>
      <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-primary" checked={grouping === 'server'} onChange={event => onGrouping(event.target.checked ? 'server' : 'tool')} />Group MCP tools by server</label>
    </div><p className="text-xs text-muted-foreground">{formatNumber(total)} tool calls · {formatNumber(rows.length)} entries, top 20 charted</p></CardHeader>
    <CardContent className="space-y-6">
      {rows.length ? <>
        <ol aria-label="Top 20 tools" className="space-y-3">{rows.slice(0, 20).map(row => <li key={key(row)} className="grid grid-cols-[minmax(0,1fr)_3rem] items-center gap-x-4 gap-y-1 text-xs sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_4rem]">
          <span className="truncate" title={label(row)}>{label(row)}</span>
          <div className="col-start-1 row-start-2 h-2 overflow-hidden rounded-full bg-muted sm:col-start-2 sm:row-start-1"><div className="h-full rounded-full bg-primary" style={{ width: `${row.count / largest * 100}%` }} /></div>
          <span className="col-start-2 row-start-1 text-right font-mono tabular-nums sm:col-start-3">{formatNumber(row.count)}</span>
        </li>)}</ol>
        <div className="overflow-x-auto"><table aria-label="Tool usage" className="w-full text-sm">
          <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-3 pr-4 font-medium">Tool</th>{['Count', 'Share', 'Sessions'].map(title => <th key={title} className="px-3 py-3 text-right font-medium">{title}</th>)}</tr></thead>
          <tbody>{rows.map(row => <tr key={key(row)} className="border-b last:border-0"><td className="max-w-xs break-words py-3 pr-4 font-mono text-xs">{label(row)}</td><td className="px-3 py-3 text-right font-mono tabular-nums">{formatNumber(row.count)}</td><td className="px-3 py-3 text-right tabular-nums">{formatPercent(row.count, total)}</td><td className="px-3 py-3 text-right font-mono tabular-nums">{formatNumber(row.sessions)}</td></tr>)}</tbody>
        </table></div>
      </> : <p className="py-12 text-center text-muted-foreground">No tool calls in this range and filter selection.</p>}
    </CardContent>
  </Card>
}
