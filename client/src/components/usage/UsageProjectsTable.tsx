import { Fragment, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { api, type UsageModelInfo, type UsageProject } from '@/lib/api'
import type { UsageMetric } from '@/hooks/useUsageFilters'
import { formatCompactCount, formatDate, formatUsd } from '@/lib/utils'
import { formatMetric, metricLabels, metricValue, modelColor } from './UsageCharts'

function ProjectSessions({ projectDir, serverParams }: { projectDir: string; serverParams: Record<string, string> }) {
  const params = { ...serverParams, project: projectDir }
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['usage', 'sessions', params],
    queryFn: () => api.usage.sessions(params),
    refetchInterval: query => query.state.data?.index.state === 'building' ? 2000 : false,
  })
  if (isLoading || data?.index.state === 'building') return <p role="status" className="p-4 text-muted-foreground">Loading sessions…</p>
  if (error || data?.index.state === 'error') return <p role="alert" className="p-4 text-destructive">Could not load sessions. <button className="underline" onClick={() => refetch()}>Try again</button></p>
  if (!data?.sessions.length) return <p className="p-4 text-muted-foreground">No sessions match these filters.</p>
  return <div className="p-4">
    <p className="mb-3 text-xs text-muted-foreground">Top {data.sessions.length} sessions by output tokens · includes sub-agent usage</p>
    <table aria-label="Project sessions" className="w-full whitespace-nowrap text-xs">
      <thead><tr className="border-b text-left text-muted-foreground">{['Session', 'First use', 'Last use', 'Models', 'Requests', 'Sub-agent requests', 'Output tokens', 'Total tokens', 'Estimated cost'].map(label => <th key={label} className="px-3 py-2 font-medium first:pl-0">{label}</th>)}</tr></thead>
      <tbody>{data.sessions.map(session => <tr key={session.sessionId} className="border-b last:border-0">
        <td className="py-3 pr-3 font-mono">{session.hasMainTranscript
          ? <Link className="text-primary hover:underline" to={`/sessions/${encodeURIComponent(projectDir)}/${encodeURIComponent(session.sessionId)}`}>{session.sessionId}</Link>
          : session.sessionId || 'Unknown session'}</td>
        <td className="px-3 py-3">{formatDate(session.firstAt)}</td><td className="px-3 py-3">{formatDate(session.lastAt)}</td>
        <td className="px-3 py-3">{session.models.join(', ')}</td>
        {[session.requests, session.subagentRequests, session.outputTokens, session.totalTokens].map((value, i) => <td key={i} className="px-3 py-3 font-mono tabular-nums">{formatCompactCount(value)}</td>)}
        <td className="px-3 py-3 font-mono tabular-nums">{session.costUsd === null ? 'No price' : `≈ ${formatUsd(session.costUsd)}`}</td>
      </tr>)}</tbody>
    </table>
  </div>
}

export function UsageProjectsTable({ projects, models, metric, serverParams }: {
  projects: UsageProject[]; models: UsageModelInfo[]; metric: UsageMetric; serverParams: Record<string, string>
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const sorted = useMemo(() => [...projects].sort((a, b) => (metricValue(b, metric) ?? -1) - (metricValue(a, metric) ?? -1) || a.projectDir.localeCompare(b.projectDir)), [projects, metric])
  const toggle = (projectDir: string) => setExpanded(previous => {
    const next = new Set(previous)
    if (next.has(projectDir)) next.delete(projectDir)
    else next.add(projectDir)
    return next
  })
  return <Card><CardHeader><CardTitle>Projects × Models</CardTitle><p className="text-xs text-muted-foreground">{metricLabels[metric]} · expand a project to see its sessions.</p></CardHeader><CardContent>
    <div className="overflow-x-auto"><table aria-label="Projects by model" className="w-full whitespace-nowrap text-sm">
      <thead><tr className="border-b text-left text-xs text-muted-foreground">
        <th className="py-3 pr-3 font-medium">Project</th>
        {models.map(model => <th key={model.modelId} className="px-3 py-3 text-right font-medium"><Tooltip><TooltipTrigger asChild><span tabIndex={0} className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: modelColor(model) }} />{model.displayName}</span></TooltipTrigger><TooltipContent>{model.modelId}</TooltipContent></Tooltip></th>)}
        <th className="px-3 py-3 text-right font-medium">Total</th>
      </tr></thead>
      <tbody>{sorted.map(project => { const open = expanded.has(project.projectDir); return <Fragment key={project.projectDir}>
        <tr className="border-b transition-colors hover:bg-muted/50">
          <td className="py-3 pr-3"><div className="flex items-center gap-2">
            <button aria-expanded={open} aria-label={`Sessions for ${project.projectName}`} onClick={() => toggle(project.projectDir)} className="rounded p-1 hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"><ChevronRight className={`h-4 w-4 transition-transform ${open ? 'rotate-90' : ''}`} /></button>
            <div><div className="font-medium">{project.hasSessions
              ? <Link className="text-primary hover:underline" to={`/projects/${encodeURIComponent(project.projectDir)}`}>{project.projectName}</Link>
              : project.projectName}</div><div className="max-w-72 truncate text-xs text-muted-foreground" title={project.projectPath}>{project.projectPath}</div></div>
          </div></td>
          {models.map(model => <td key={model.modelId} className="px-3 py-3 text-right font-mono text-xs tabular-nums">{formatMetric(Object.prototype.hasOwnProperty.call(project.byModel, model.modelId) ? metricValue(project.byModel[model.modelId], metric) : 0, metric)}</td>)}
          <td className="px-3 py-3 text-right font-mono text-xs font-semibold tabular-nums">{formatMetric(metricValue(project, metric), metric)}</td>
        </tr>
        {open && <tr className="border-b bg-muted/30"><td colSpan={models.length + 2}><ProjectSessions projectDir={project.projectDir} serverParams={serverParams} /></td></tr>}
      </Fragment> })}</tbody>
    </table></div>
    {!projects.length && <p className="py-6 text-sm text-muted-foreground">No projects match these filters.</p>}
  </CardContent></Card>
}
