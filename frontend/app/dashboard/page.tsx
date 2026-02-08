'use client'

import { useAccount } from 'wagmi'
import { useCurrentAccount } from '@mysten/dapp-kit'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { useWorkspaceStore } from '@/store/workspace-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { WorkspaceCard } from '@/components/workspace/workspace-card'
import { TransactionHistory } from '@/components/transaction/transaction-history'
import { Button } from '@/components/ui/button'
import { Plus, Briefcase, DollarSign, CheckCircle, Clock, Loader2, LogIn, User, Users } from 'lucide-react'
import Link from 'next/link'
import { useAuth } from '@/providers'
import { useUserEscrowsByRole } from '@/lib/hooks/useEscrows'

export default function DashboardPage() {
  const { address: evmAddress, isConnected: isEvmConnected } = useAccount()
  const suiAccount = useCurrentAccount()
  const { isAuthenticated, isAuthenticating, isInitialized, authenticate, error: authError, walletType } = useAuth()
  
  // Determine role based on wallet type
  const isClient = walletType === 'evm'
  const isFreelancer = walletType === 'sui'
  
  // Get the connected wallet address
  const connectedAddress = evmAddress || suiAccount?.address
  const isConnected = isEvmConnected || !!suiAccount?.address
  
  // Local store for transactions only
  const transactions = useWorkspaceStore((state) => state.transactions)
  
  // Fetch escrows from API by role
  const { asClient, asFreelancer, loading: escrowsLoading, refetch } = useUserEscrowsByRole(
    isAuthenticated && connectedAddress ? connectedAddress : ''
  )

  // Debug logging
  console.log('Dashboard Debug:', {
    connectedAddress,
    isAuthenticated,
    walletType,
    isClient,
    isFreelancer,
    asClient: asClient.length,
    asFreelancer: asFreelancer.length,
    escrowsLoading
  })

  // Convert escrow data to workspace format
  const mapEscrowToWorkspace = (escrow: any) => ({
    id: escrow.id,
    clientAddress: escrow.clientAddress,
    clientEnsName: escrow.clientEnsName || undefined,
    freelancerAddress: escrow.freelancerAddress,
    freelancerEnsName: escrow.freelancerEnsName || undefined,
    totalAmount: escrow.totalAmount,
    currency: escrow.currency,
    status: escrow.status as any,
    milestones: escrow.milestones?.map((m: any) => ({
      id: m.id,
      title: m.title,
      description: m.description || '',
      amount: m.amount,
      status: m.status as any,
      dueDate: m.dueDate ? new Date(m.dueDate).getTime() : undefined,
      submittedAt: m.submittedAt ? new Date(m.submittedAt).getTime() : undefined,
      approvedAt: m.approvedAt ? new Date(m.approvedAt).getTime() : undefined,
    })) || [],
    secretHash: '',
    htlcExpiry: 0,
    createdAt: new Date(escrow.createdAt).getTime(),
    updatedAt: new Date(escrow.updatedAt).getTime(),
    txHash: escrow.evmTxHash || undefined,
    suiObjectId: escrow.suiObjectId || undefined,
  })

  const clientWorkspaces = asClient.map(mapEscrowToWorkspace)
  const freelancerWorkspaces = asFreelancer.map(mapEscrowToWorkspace)
  
  // Use the relevant workspaces based on role
  const myWorkspaces = isClient ? clientWorkspaces : freelancerWorkspaces

  // Calculate freelancer earnings (released milestones)
  const releasedEarnings = freelancerWorkspaces.reduce((acc, w) => {
    const released = w.milestones?.filter((m: any) => m.status === 'released') || []
    return acc + released.reduce((sum: number, m: any) => sum + parseFloat(m.amount || '0'), 0)
  }, 0)
  
  const pendingEarnings = freelancerWorkspaces.reduce((acc, w) => {
    const pending = w.milestones?.filter((m: any) => m.status !== 'released' && m.status !== 'refunded') || []
    return acc + pending.reduce((sum: number, m: any) => sum + parseFloat(m.amount || '0'), 0)
  }, 0)

  const stats = isClient ? [
    {
      title: 'Total Workspaces',
      value: clientWorkspaces.length,
      icon: Briefcase,
      color: 'text-blue-500',
    },
    {
      title: 'Active Escrows',
      value: clientWorkspaces.filter(w => w.status === 'active' || w.status === 'FUNDED').length,
      icon: Clock,
      color: 'text-orange-500',
    },
    {
      title: 'Completed',
      value: clientWorkspaces.filter(w => w.status === 'completed' || w.status === 'COMPLETED').length,
      icon: CheckCircle,
      color: 'text-green-500',
    },
    {
      title: 'Total Funded',
      value: `$${clientWorkspaces.reduce((acc, w) => acc + parseFloat(w.totalAmount || '0'), 0).toFixed(2)}`,
      icon: DollarSign,
      color: 'text-purple-500',
    },
  ] : [
    {
      title: 'Active Jobs',
      value: freelancerWorkspaces.filter(w => w.status === 'active' || w.status === 'FUNDED').length,
      icon: Briefcase,
      color: 'text-blue-500',
    },
    {
      title: 'Pending Milestones',
      value: freelancerWorkspaces.reduce((acc, w) => acc + (w.milestones?.filter((m: any) => m.status === 'pending' || m.status === 'submitted' || m.status === 'approved').length || 0), 0),
      icon: Clock,
      color: 'text-orange-500',
    },
    {
      title: 'Earned (Released)',
      value: `$${releasedEarnings.toFixed(2)}`,
      icon: CheckCircle,
      color: 'text-green-500',
    },
    {
      title: 'Pending',
      value: `$${pendingEarnings.toFixed(2)}`,
      icon: DollarSign,
      color: 'text-yellow-500',
    },
  ]

  // Show loading while auth is initializing (but not if already authenticated from localStorage)
  if (!isInitialized && !isAuthenticated) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </DashboardLayout>
    )
  }

  // Auth prompt for unauthenticated users (only show after initialization)
  if (isInitialized && isConnected && !isAuthenticated) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6">
          <div className="text-center space-y-4">
            <LogIn className="h-16 w-16 mx-auto text-muted-foreground" />
            <h2 className="text-2xl font-bold">Sign In Required</h2>
            <p className="text-muted-foreground max-w-md">
              Sign in with your wallet to access your escrow dashboard and manage your workspaces.
            </p>
            <p className="text-sm text-muted-foreground">
              Connected: {evmAddress ? 'EVM Wallet' : suiAccount?.address ? 'Sui Wallet' : 'None'}
            </p>
          </div>
          <Button 
            size="lg" 
            onClick={authenticate}
            disabled={isAuthenticating}
            className="bg-black text-white hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90 font-bold"
          >
            {isAuthenticating ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Signing...
              </>
            ) : (
              <>
                <LogIn className="mr-2 h-5 w-5" />
                Sign In with Wallet
              </>
            )}
          </Button>
          {authError && (
            <p className="text-red-500 text-sm mt-2">{authError}</p>
          )}
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Dashboard</h1>
            <p className="text-muted-foreground">
              {walletType === 'sui' ? 'Sui Wallet' : 'EVM Wallet'} • Manage your cross-chain escrow workspaces
            </p>
          </div>
          {walletType === 'evm' && (
            <Link href="/create">
              <Button size="lg" className="bg-black text-white hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90 font-bold">
                <Plus className="mr-2 h-5 w-5" />
                Create Workspace
              </Button>
            </Link>
          )}
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

        {/* Loading State */}
        {escrowsLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Workspaces - Show based on wallet type/role */}
        {!escrowsLoading && (
          <div>
            {/* Client View (EVM Wallet) */}
            {isClient && (
              <>
                <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                  <User className="h-6 w-6" />
                  Your Client Workspaces
                </h2>
                {clientWorkspaces.length === 0 ? (
                  <Card>
                    <CardContent className="py-16 text-center">
                      <User className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <h3 className="text-lg font-semibold mb-2">No workspaces yet</h3>
                      <p className="text-muted-foreground mb-6">
                        Create a workspace to hire freelancers and fund escrows
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
                    {clientWorkspaces.map((workspace) => (
                      <WorkspaceCard key={workspace.id} workspace={workspace} role="client" />
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Freelancer View (Sui Wallet) */}
            {isFreelancer && (
              <>
                <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                  <Users className="h-6 w-6" />
                  Your Freelancer Workspaces
                </h2>
                {freelancerWorkspaces.length === 0 ? (
                  <Card>
                    <CardContent className="py-16 text-center">
                      <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <h3 className="text-lg font-semibold mb-2">No workspaces yet</h3>
                      <p className="text-muted-foreground mb-6">
                        When a client hires you and funds an escrow, it will appear here
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {freelancerWorkspaces.map((workspace) => (
                      <WorkspaceCard key={workspace.id} workspace={workspace} role="freelancer" />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Transaction History */}
        <TransactionHistory />
      </div>
    </DashboardLayout>
  )
}
