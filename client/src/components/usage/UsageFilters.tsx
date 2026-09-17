import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import type { UsageResponse } from '@/lib/api'
import type { useUsageFilters } from '@/hooks/useUsageFilters'

/** The server rejects a custom range without both dates, so the fallback keeps one selectable. */
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

function Choice({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (value: string) => void }) {
  return <div className="min-w-36 space-y-1.5"><span className="text-xs font-medium text-muted-foreground">{label}</span>
    <Select value={value || 'all'} onValueChange={onChange}><SelectTrigger aria-label={label}><SelectValue /></SelectTrigger>
      <SelectContent>{options.map(([id, text]) => <SelectItem key={id} value={id}>{text}</SelectItem>)}</SelectContent>
    </Select></div>
}
export function UsageFilters({ filters, response }: { filters: ReturnType<typeof useUsageFilters>; response?: UsageResponse }) {
  const { get, set } = filters
  const options = response?.data?.filterOptions
  const projects: [string, string][] = (options?.projects ?? []).map(p => [p.projectDir, p.projectName])
  if (get('project') && !projects.some(([id]) => id === get('project'))) projects.push([get('project'), get('project')])
  const rangeOptions: [string, string][] = [['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['90d', 'Last 90 days'], ['this-month', 'This month'], ['last-month', 'Last month'], ['year', 'This year'], ['custom', 'Custom range']]
  return <div className="flex flex-wrap items-end gap-4 rounded-xl border bg-card p-4">
    <Choice label="Range" value={get('range')} options={rangeOptions} onChange={value => set('range', value, value === 'custom' ? { from: response?.query.from ?? today(), to: response?.query.to ?? today() } : {})} />
    {get('range') === 'custom' && <>{([['from', 'From'], ['to', 'To']] as const).map(([key, label]) => <label key={key} className="space-y-1.5 text-xs text-muted-foreground">{label}<Input aria-label={label} type="date" value={get(key)} onChange={e => e.target.value && set(key, e.target.value)} className="w-40" /></label>)}</>}
    <div className="space-y-1.5"><p className="text-xs font-medium text-muted-foreground">Group by</p><Tabs value={get('groupBy')} onValueChange={v => set('groupBy', v)}><TabsList aria-label="Group by">{['day', 'week', 'month'].map(v => <TabsTrigger key={v} value={v}>{v[0].toUpperCase() + v.slice(1)}</TabsTrigger>)}</TabsList></Tabs></div>
    <Choice label="Project" value={get('project')} options={ [['all', 'All projects'], ...projects] } onChange={v => set('project', v === 'all' ? '' : v)} />
    <Choice label="Family" value={get('family')} options={ [['all', 'All families'], ['opus', 'Opus'], ['sonnet', 'Sonnet'], ['haiku', 'Haiku'], ['fable', 'Fable']] } onChange={v => set('family', v === 'all' ? '' : v)} />
    <div className="space-y-1.5"><p className="text-xs font-medium text-muted-foreground">Agent scope</p><Tabs value={get('agent')} onValueChange={v => set('agent', v)}><TabsList aria-label="Agent scope">{[['all', 'All'], ['main', 'Main'], ['subagent', 'Sub-agents']].map(([v, label]) => <TabsTrigger key={v} value={v}>{label}</TabsTrigger>)}</TabsList></Tabs></div>
    {get('model') && <button className="mb-1 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm" onClick={() => set('model', '')} aria-label="Clear model filter">{options?.models.find(m => m.modelId === get('model'))?.displayName ?? get('model')} <span aria-hidden>×</span></button>}
  </div>
}
