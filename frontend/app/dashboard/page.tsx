'use client'

import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { useWorkspaceStore } from '@/store/workspace-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { WorkspaceCard } from '@/components/workspace/workspace-card'
import { TransactionHistory } from '@/components/transaction/transaction-history'
import { Button } from '@/components/ui/button'
import { Plus, Briefcase, DollarSign, CheckCircle, Clock } from 'lucide-react'
import Link from 'next/link'

export default function DashboardPage() {
  const workspaces = useWorkspaceStore((state) => state.workspaces)
  const transactions = useWorkspaceStore((state) => state.transactions)

  const stats = [
    {
      title: 'Total Workspaces',
      value: workspaces.length,
      icon: Briefcase,
      color: 'text-blue-500',
    },
    {
      title: 'Active Escrows',
      value: workspaces.filter(w => w.status === 'IN_PROGRESS').length,
      icon: Clock,
      color: 'text-orange-500',
    },
    {
      title: 'Completed',
      value: workspaces.filter(w => w.status === 'COMPLETED').length,
      icon: CheckCircle,
      color: 'text-green-500',
    },
    {
      title: 'Total Volume',
      value: `$${workspaces.reduce((acc, w) => acc + parseFloat(w.totalAmount), 0).toFixed(2)}`,
      icon: DollarSign,
      color: 'text-purple-500',
    },
  ]

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Dashboard</h1>
            <p className="text-muted-foreground">Manage your cross-chain escrow workspaces</p>
          </div>
          <Link href="/create">
            <Button size="lg" className="bg-black text-white hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90 font-bold">
              <Plus className="mr-2 h-5 w-5" />
              Create Workspace
            </Button>
          </Link>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat, index) => (
            <Card key={index}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.title}
                </CardTitle>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Workspaces */}
        <div>
          <h2 className="text-2xl font-bold mb-4">Recent Workspaces</h2>
          {workspaces.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <Briefcase className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No workspaces yet</h3>
                <p className="text-muted-foreground mb-6">
                  Create your first cross-chain escrow workspace
                </p>
                <Link href="/create">
                  <Button className="bg-black text-white hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90 font-bold">
                    <Plus className="mr-2 h-5 w-5" />
                    Create Workspace
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {workspaces.slice(0, 6).map((workspace) => (
                <WorkspaceCard key={workspace.id} workspace={workspace} />
              ))}
            </div>
          )}
        </div>

        {/* Transaction History */}
        <TransactionHistory />
      </div>
    </DashboardLayout>
  )
}
