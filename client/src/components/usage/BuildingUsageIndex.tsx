import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { UsageIndexStatus } from '@/lib/api'
import { formatNumber } from '@/lib/utils'

export function BuildingUsageIndex({ index }: { index: UsageIndexStatus }) {
  return <Card role="status">
    <CardHeader><CardTitle>Building usage index…</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      <p className="text-sm text-muted-foreground">{formatNumber(index.filesIndexed)} / {formatNumber(index.filesTotal)} files</p>
      <progress aria-label="Usage indexing progress" className="h-2 w-full accent-primary" max={Math.max(1, index.filesTotal)} value={index.filesIndexed} />
    </CardContent>
  </Card>
}
