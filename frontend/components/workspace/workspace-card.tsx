'use client'

import { useWorkspaceStore } from '@/store/workspace-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { formatUSDC, formatAddress, getTimeRemaining } from '@/lib/utils'
import { Clock, ExternalLink, CheckCircle2, AlertCircle, User, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import Link from 'next/link'

interface WorkspaceCardProps {
  workspace: any
  role?: 'client' | 'freelancer'
}

export function WorkspaceCard({ workspace, role }: WorkspaceCardProps) {
  const [timeLeft, setTimeLeft] = useState(getTimeRemaining(workspace.htlcExpiry))

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(getTimeRemaining(workspace.htlcExpiry))
    }, 1000)

    return () => clearInterval(timer)
  }, [workspace.htlcExpiry])

  const completedMilestones = workspace.milestones?.filter(
    (m: any) => m.status === 'APPROVED' || m.status === 'PAID' || m.status === 'approved' || m.status === 'released'
  ).length || 0
  const totalMilestones = workspace.milestones?.length || 1
  const progress = (completedMilestones / totalMilestones) * 100

  // Status to badge variant and color mapping
  const getStatusBadge = (status: string) => {
    const normalizedStatus = status?.toLowerCase() || 'pending'
    switch (normalizedStatus) {
      case 'active':
      case 'in_progress':
      case 'locked':
      case 'funded':
        return { variant: 'default' as const, className: 'bg-blue-500 text-white hover:bg-blue-600' }
      case 'completed':
        return { variant: 'success' as const, className: 'bg-green-500 text-white hover:bg-green-600' }
      case 'disputed':
        return { variant: 'destructive' as const, className: '' }
      case 'refunded':
      case 'cancelled':
        return { variant: 'secondary' as const, className: 'bg-gray-500 text-white' }
      case 'pending':
      default:
        return { variant: 'warning' as const, className: 'bg-yellow-500 text-white hover:bg-yellow-600' }
    }
  }

  const statusBadge = getStatusBadge(workspace.status)
  const statusDisplay = workspace.status?.toUpperCase() || 'PENDING'

  return (
    <Link href={`/workspace/${workspace.id || 'unknown'}`}>
      <Card className="hover:shadow-lg transition-shadow cursor-pointer">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">Workspace #{workspace.id?.slice(0, 8) || 'New'}</CardTitle>
                {role && (
                  <Badge variant="outline" className="text-xs">
                    {role === 'client' ? <User className="h-3 w-3 mr-1" /> : <Users className="h-3 w-3 mr-1" />}
                    {role === 'client' ? 'Client' : 'Freelancer'}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Client: {workspace.clientEnsName || formatAddress(workspace.clientAddress)}</span>
                <span>•</span>
                <span>Freelancer: {workspace.freelancerEnsName || formatAddress(workspace.freelancerAddress)}</span>
              </div>
            </div>
            <Badge variant={statusBadge.variant} className={statusBadge.className}>
              {statusDisplay}
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

        {/* Explorer Badge */}
        {workspace.suiObjectId && (
          <Badge variant="outline" className="text-xs">
            Sui: {workspace.suiObjectId.slice(0, 8)}...
          </Badge>
        )}
      </CardContent>
    </Card>
    </Link>
  )
}
