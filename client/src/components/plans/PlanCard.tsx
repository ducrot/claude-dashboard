import { Link } from 'react-router-dom'
import { FileText, Calendar } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PlanSummary } from '@/lib/api'
import { formatDate, truncate } from '@/lib/utils'

interface PlanCardProps {
  plan: PlanSummary
}

export function PlanCard({ plan }: PlanCardProps) {
  return (
    <Link to={`/plans/${encodeURIComponent(plan.filename)}`}>
      <Card className="transition-colors hover:bg-accent/50">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-muted-foreground" />
            {truncate(plan.title || plan.filename, 60)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatDate(plan.createdAt)}
            </div>
            <div>{(plan.size / 1024).toFixed(1)} KB</div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
