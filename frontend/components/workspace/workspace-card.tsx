'use client'

import { useWorkspaceStore } from '@/store/workspace-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { formatUSDC, formatAddress, getTimeRemaining } from '@/lib/utils'
import { Clock, ExternalLink, CheckCircle2, AlertCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import Link from 'next/link'

interface WorkspaceCardProps {
  workspace: any
}

export function WorkspaceCard({ workspace }: WorkspaceCardProps) {
  const [timeLeft, setTimeLeft] = useState(getTimeRemaining(workspace.htlcExpiry))

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(getTimeRemaining(workspace.htlcExpiry))
    }, 1000)

    return () => clearInterval(timer)
  }, [workspace.htlcExpiry])

  const completedMilestones = workspace.milestones.filter(
    (m: any) => m.status === 'APPROVED' || m.status === 'PAID'
  ).length
  const totalMilestones = workspace.milestones.length
  const progress = (completedMilestones / totalMilestones) * 100

  const statusColors = {
    PENDING: 'warning',
    LOCKED: 'default',
    IN_PROGRESS: 'default',
    COMPLETED: 'success',
    REFUNDED: 'destructive',
    DISPUTED: 'destructive',
  } as const

  return (
    <Card className="hover:shadow-lg transition-shadow cursor-pointer">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg">Workspace #{workspace.id.slice(0, 8)}</CardTitle>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Client: {workspace.clientEnsName || formatAddress(workspace.clientAddress)}</span>
              <span>•</span>
              <span>Freelancer: {workspace.freelancerEnsName || formatAddress(workspace.freelancerAddress)}</span>
            </div>
          </div>
          <Badge variant={statusColors[workspace.status as keyof typeof statusColors]}>
            {workspace.status}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Amount */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Total Amount</span>
          <span className="text-xl font-bold">{formatUSDC(workspace.totalAmount)}</span>
        </div>

        {/* Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Milestones Progress</span>
            <span className="font-medium">
              {completedMilestones} / {totalMilestones}
            </span>
          </div>
          <Progress value={progress} />
        </div>

        {/* HTLC Timer */}
        {workspace.status === 'LOCKED' && timeLeft.total > 0 && (
          <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
            <Clock className="h-4 w-4 text-orange-500" />
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">Time Lock Expires In</p>
              <p className="font-mono font-medium">
                {timeLeft.days}d {timeLeft.hours}h {timeLeft.minutes}m {timeLeft.seconds}s
              </p>
            </div>
          </div>
        )}

        {/* Explorer Link */}
        {workspace.suiObjectId && (
          <Link
            href={`https://suiexplorer.com/object/${workspace.suiObjectId}`}
            target="_blank"
            className="flex items-center gap-2 text-sm text-primary hover:underline"
          >
            View on Sui Explorer
            <ExternalLink className="h-3 w-3" />
          </Link>
        )}
      </CardContent>
    </Card>
  )
}
