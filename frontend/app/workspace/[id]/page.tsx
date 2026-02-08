'use client'

import { useParams, useRouter } from 'next/navigation'
import { useAccount, useChainId } from 'wagmi'
import { useCurrentAccount } from '@mysten/dapp-kit'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { 
  ArrowLeft, 
  CheckCircle, 
  Clock, 
  Loader2, 
  AlertCircle,
  ExternalLink,
  Copy,
  User,
  DollarSign,
  Calendar,
  RefreshCw,
  Send,
  Wallet
} from 'lucide-react'
import Link from 'next/link'
import { useAuth } from '@/providers'
import { useEscrow, useMilestoneActions } from '@/lib/hooks/useEscrows'
import { useEscrowSocket } from '@/lib/hooks/useSocket'
import { useEscrowContract } from '@/lib/contracts'
import { useWorkspaceStore } from '@/store/workspace-store'
import { TransactionHistory } from '@/components/transaction/transaction-history'
import { useSuiPayment } from '@/lib/hooks/useSuiPayment'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import type { Milestone } from '@/lib/api/types'
import { useState, useCallback, useEffect } from 'react'

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-600',
  active: 'bg-blue-500/20 text-blue-600',
  completed: 'bg-green-500/20 text-green-600',
  disputed: 'bg-red-500/20 text-red-600',
  cancelled: 'bg-gray-500/20 text-gray-600',
  refunded: 'bg-gray-500/20 text-gray-600',
}

const milestoneStatusColors: Record<string, string> = {
  pending: 'bg-gray-500/20 text-gray-600',
  in_progress: 'bg-blue-500/20 text-blue-600',
  submitted: 'bg-yellow-500/20 text-yellow-600',
  approved: 'bg-green-500/20 text-green-600',
  released: 'bg-emerald-500/20 text-emerald-600',
  disputed: 'bg-red-500/20 text-red-600',
  refunded: 'bg-gray-500/20 text-gray-600',
}

export default function WorkspaceDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { address: evmAddress } = useAccount()
  const suiAccount = useCurrentAccount()
  const { isAuthenticated } = useAuth()
  const escrowId = params.id as string
  
  const { escrow, loading: isLoading, error, refetch } = useEscrow(escrowId)
  const { submitMilestone, approveMilestone, releaseMilestone, disputeMilestone, loading: actionLoading } = useMilestoneActions()
  const addTransaction = useWorkspaceStore((state) => state.addTransaction)
  
  // Submit work dialog state
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false)
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(null)
  const [submissionNote, setSubmissionNote] = useState('')
  
  // Release payment dialog state
  const [releaseDialogOpen, setReleaseDialogOpen] = useState(false)
  const [releaseResult, setReleaseResult] = useState<{
    milestoneId: string;
    amount: number;
    suiTxDigest?: string;
    bridge?: {
      success: boolean;
      suiTxDigest?: string;
      error?: string;
      amountSui: string;
    };
    crossChain?: {
      secretHash: string;
      secret: string;
      note: string;
    };
  } | null>(null)
  
  // Sui payment hook for real transfers
  const { sendPayment: sendSuiPayment, isPending: isSuiPaymentPending, lastTxDigest } = useSuiPayment()
  
  // Contract hook for on-chain interactions
  const { 
    createEscrow: createOnChainEscrow, 
    escrowAddress,
    hash: txHash,
    isPending: isTxPending,
    isConfirming: isTxConfirming,
    isSuccess: isTxSuccess,
    error: txError
  } = useEscrowContract()
  
  const chainId = useChainId()
  const [actionError, setActionError] = useState<string | null>(null)
  const [fundingStep, setFundingStep] = useState<'idle' | 'signing' | 'confirming' | 'updating' | 'done'>('idle')

  // Debug logging for transaction states
  useEffect(() => {
    console.log('Transaction State:', {
      txHash,
      isTxPending,
      isTxConfirming,
      isTxSuccess,
      txError: txError?.message,
      fundingStep,
    })
  }, [txHash, isTxPending, isTxConfirming, isTxSuccess, txError, fundingStep])

  // Handle transaction errors
  useEffect(() => {
    if (txError && fundingStep !== 'idle') {
      console.error('Transaction error:', txError)
      setActionError(txError.message || 'Transaction failed')
      setFundingStep('idle')
    }
  }, [txError, fundingStep])

  // Update fundingStep based on transaction state
  useEffect(() => {
    if (isTxPending && fundingStep === 'signing') {
      // Transaction is being signed, wait for it
    } else if (txHash && fundingStep === 'signing') {
      // Transaction was sent, now confirming
      setFundingStep('confirming')
    }
  }, [isTxPending, txHash, fundingStep])

  // Update backend when transaction is confirmed
  useEffect(() => {
    if (isTxSuccess && txHash && fundingStep === 'confirming') {
      setFundingStep('updating')
      
      // Add transaction to local store for Recent Transactions
      addTransaction({
        id: txHash,
        workspaceId: escrowId,
        type: 'DEPOSIT',
        status: 'CONFIRMED',
        txHash: txHash,
        network: 'ethereum',
        amount: escrow?.totalAmount,
        timestamp: Date.now(),
      })
      
      // Update the backend with the transaction hash
      fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002'}/api/escrows/${escrowId}/fund`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accordefi_token')}`,
        },
        body: JSON.stringify({ 
          txHash: txHash,
          onChainId: txHash // Use tx hash as reference for now
        }),
      }).then(response => {
        if (response.ok) {
          setFundingStep('done')
          refetch()
        } else {
          setActionError('Failed to update escrow status')
          setFundingStep('idle')
        }
      }).catch(err => {
        setActionError(err.message)
        setFundingStep('idle')
      })
    }
  }, [isTxSuccess, txHash, fundingStep, escrowId, refetch, addTransaction, escrow?.totalAmount])

  // Real-time updates
  useEscrowSocket(escrowId, {
    onMilestoneSubmitted: useCallback(() => {
      refetch()
    }, [refetch]),
    onMilestoneApproved: useCallback(() => {
      refetch()
    }, [refetch]),
    onMilestoneReleased: useCallback(() => {
      refetch()
    }, [refetch]),
    onDisputeCreated: useCallback(() => {
      refetch()
    }, [refetch]),
  })

  const isClient = evmAddress?.toLowerCase() === escrow?.clientAddress?.toLowerCase()
  // Check if user is freelancer - can be EVM address OR Sui address
  const suiAddress = suiAccount?.address
  const isFreelancer = 
    (evmAddress?.toLowerCase() === escrow?.freelancerAddress?.toLowerCase()) ||
    (suiAddress === escrow?.freelancerAddress)

  const handleFundEscrow = async () => {
    setActionError(null)
    
    if (!escrow) {
      setActionError('Escrow not found')
      return
    }

    if (!escrowAddress) {
      setActionError(`Smart contract not deployed on chain ${chainId}. Please switch to Localhost (Anvil).`)
      return
    }

    try {
      setFundingStep('signing')
      
      // Get milestones data
      const milestones = escrow.milestones || []
      const milestoneDescriptions = milestones.map(m => m.title || m.description || 'Milestone')
      const milestoneAmounts = milestones.map(m => m.amount || '0')
      const milestoneDeadlines = milestones.map(m => m.dueDate ? Math.floor(new Date(m.dueDate).getTime() / 1000) : 0)
      
      // Calculate total in ETH (assuming amount is in USD cents, convert to ETH for demo)
      // For demo, we'll use a small amount of ETH
      const totalEth = (parseFloat(escrow.totalAmount) / 100000).toFixed(6) // Convert to small ETH amount for testing
      
      // Validate freelancer address - EVM addresses are 42 chars (0x + 40 hex chars)
      // Sui addresses are longer (0x + 64 hex chars), so use placeholder for cross-chain
      let freelancerEvmAddress = '0x0000000000000000000000000000000000000000'
      const freelancerAddr = escrow.freelancerAddress || ''
      if (freelancerAddr.startsWith('0x') && freelancerAddr.length === 42) {
        // Valid EVM address
        freelancerEvmAddress = freelancerAddr
      } else if (freelancerAddr.startsWith('0x') && freelancerAddr.length === 66) {
        // This is a Sui address, use the suiRecipient field and placeholder EVM address
        console.log('Freelancer is on Sui chain, using cross-chain mode')
      }
      
      // Create escrow on-chain
      await createOnChainEscrow({
        freelancerAddress: freelancerEvmAddress,
        title: escrow.title || 'Escrow',
        description: escrow.description || '',
        milestones: milestones.map((m, i) => ({
          description: milestoneDescriptions[i],
          amount: (parseFloat(milestoneAmounts[i]) / 100000).toFixed(6),
          deadline: milestoneDeadlines[i],
        })),
        // Use freelancer Sui address if it's a Sui address
        suiRecipient: freelancerAddr.length === 66 ? freelancerAddr : (escrow.suiRecipient || undefined),
        totalAmountEth: totalEth,
      })
      
      // Don't set confirming here - let the useEffect handle it based on txHash
    } catch (err) {
      console.error('Fund escrow error:', err)
      setActionError(err instanceof Error ? err.message : 'Failed to fund escrow')
      setFundingStep('idle')
    }
  }

  // Open submit dialog
  const openSubmitDialog = (milestoneId: string) => {
    setSelectedMilestoneId(milestoneId)
    setSubmissionNote('')
    setSubmitDialogOpen(true)
  }

  // Handle submit work
  const handleSubmitWork = async () => {
    if (!selectedMilestoneId) return
    setActionError(null)
    try {
      await submitMilestone(selectedMilestoneId, submissionNote || 'Work completed - ready for review')
      setSubmitDialogOpen(false)
      setSelectedMilestoneId(null)
      setSubmissionNote('')
      refetch()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to submit work')
    }
  }

  const handleMilestoneAction = async (action: 'approve' | 'release' | 'dispute', milestoneId: string) => {
    setActionError(null)
    try {
      switch (action) {
        case 'approve':
          await approveMilestone(milestoneId)
          break
        case 'release':
          // Find the milestone to get the amount
          const milestone = escrow?.milestones?.find((m: Milestone) => m.id === milestoneId)
          if (!milestone) {
            throw new Error('Milestone not found')
          }
          
          // Check if we have a Sui recipient address
          const suiRecipient = escrow?.suiRecipient || escrow?.freelancerAddress
          if (!suiRecipient) {
            throw new Error('No Sui recipient address found')
          }
          
          console.log('[Release] Cross-chain release:', {
            escrowId: escrow?.id,
            milestoneId,
            milestoneAmount: milestone.amount,
            suiRecipient,
          })
          
          // Step 1: Call the backend to release (which triggers the bridge)
          // In production: Client signs EVM tx → Bridge detects → Sends SUI
          const result = await releaseMilestone(milestoneId)
          
          // Show success with cross-chain details
          setReleaseResult({
            milestoneId,
            amount: parseFloat(String(milestone.amount)),
            bridge: result?.bridge as any,
            crossChain: result?.crossChain as any,
          })
          setReleaseDialogOpen(true)
          break
        case 'dispute':
          await disputeMilestone(milestoneId, 'Dispute reason')
          break
      }
      refetch()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed')
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const formatAddress = (addr: string | undefined | null) => {
    if (!addr) return 'Unknown'
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  const completedMilestones = escrow?.milestones?.filter((m: Milestone) => m.status === 'released' || m.status === 'approved').length || 0
  const totalMilestones = escrow?.milestones?.length || 1
  const progressPercent = (completedMilestones / totalMilestones) * 100

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    )
  }

  if (error || !escrow) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
          <AlertCircle className="h-16 w-16 text-destructive" />
          <h2 className="text-xl font-semibold">Escrow Not Found</h2>
          <p className="text-muted-foreground">{error || 'The escrow you are looking for does not exist.'}</p>
          <Link href="/dashboard">
            <Button>Back to Dashboard</Button>
          </Link>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href="/dashboard">
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{escrow.title || 'Workspace'}</h1>
              <Badge className={statusColors[escrow.status] || statusColors.PENDING}>
                {escrow.status}
              </Badge>
            </div>
            <p className="text-muted-foreground">{escrow.description}</p>
          </div>
          <div className="flex items-center gap-2">
            {isClient && escrow.status === 'pending' && (
              <Button 
                onClick={handleFundEscrow}
                disabled={fundingStep !== 'idle' && fundingStep !== 'done'}
                className="bg-green-600 hover:bg-green-700"
              >
                {fundingStep === 'signing' && (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Sign Transaction...
                  </>
                )}
                {fundingStep === 'confirming' && (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Confirming...
                  </>
                )}
                {fundingStep === 'updating' && (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Updating...
                  </>
                )}
                {(fundingStep === 'idle' || fundingStep === 'done') && (
                  <>
                    <DollarSign className="h-4 w-4 mr-2" />
                    Fund Escrow
                  </>
                )}
              </Button>
            )}
            {txHash && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border border-green-500/20 rounded-lg">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="text-sm text-green-600 font-medium">TX Confirmed</span>
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                  {txHash.slice(0, 10)}...{txHash.slice(-8)}
                </code>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6"
                  onClick={() => copyToClipboard(txHash)}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            )}
            <Button variant="outline" size="icon" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Transaction Success Message */}
        {fundingStep === 'done' && txHash && (
          <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
            <CheckCircle className="h-6 w-6 text-green-600" />
            <div className="flex-1">
              <p className="font-medium text-green-700">Escrow Funded Successfully!</p>
              <p className="text-sm text-green-600">
                Your transaction has been confirmed on the blockchain.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <code className="text-xs bg-green-100 dark:bg-green-900/30 px-2 py-1 rounded font-mono text-green-700">
                {txHash.slice(0, 14)}...{txHash.slice(-10)}
              </code>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => copyToClipboard(txHash)}
                className="border-green-500/30 text-green-700 hover:bg-green-500/10"
              >
                <Copy className="h-3 w-3 mr-1" />
                Copy Hash
              </Button>
            </div>
          </div>
        )}

        {/* Action Error */}
        {actionError && (
          <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive">
            <AlertCircle className="h-4 w-4" />
            <p className="text-sm">{actionError}</p>
          </div>
        )}

        {/* Freelancer Earnings Summary */}
        {isFreelancer && (
          <Card className="border-green-200 dark:border-green-800 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-green-100 dark:bg-green-900 rounded-full">
                    <DollarSign className="h-6 w-6 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Your Earnings from this Workspace</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold text-green-600">
                        {escrow.milestones?.filter((m: Milestone) => m.status === 'released').reduce((sum: number, m: Milestone) => sum + parseFloat(String(m.amount || 0)), 0).toFixed(2) || '0.00'}
                      </span>
                      <span className="text-lg text-green-600">{escrow.tokenSymbol || 'USDC'}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Pending</p>
                  <p className="text-xl font-semibold">
                    {escrow.milestones?.filter((m: Milestone) => m.status !== 'released' && m.status !== 'refunded').reduce((sum: number, m: Milestone) => sum + parseFloat(String(m.amount || 0)), 0).toFixed(2) || '0.00'} {escrow.tokenSymbol || 'USDC'}
                  </p>
                </div>
              </div>
              {escrow.milestones?.some((m: Milestone) => m.status === 'released') && (
                <div className="mt-4 pt-4 border-t border-green-200 dark:border-green-800">
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    <span className="text-sm">Payments received to your Sui wallet: <code className="font-mono text-xs bg-green-100 dark:bg-green-900 px-2 py-0.5 rounded">{formatAddress(suiAddress)}</code></span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Overview Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Total Amount
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {escrow.totalAmount} {escrow.currency}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                Progress
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="text-2xl font-bold">
                {completedMilestones}/{totalMilestones}
              </div>
              <Progress value={progressPercent} className="h-2" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Created
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {new Date(escrow.createdAt).toLocaleDateString()}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Participants */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Participants
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground mb-1">Client (EVM)</p>
                <div className="flex items-center gap-2">
                  <code className="text-sm font-mono">
                    {escrow.clientEnsName || formatAddress(escrow.clientAddress)}
                  </code>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6"
                    onClick={() => copyToClipboard(escrow.clientAddress)}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                  {isClient && <Badge variant="outline">You</Badge>}
                </div>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground mb-1">Freelancer (Sui)</p>
                <div className="flex items-center gap-2">
                  <code className="text-sm font-mono">
                    {escrow.freelancerEnsName || formatAddress(escrow.freelancerAddress)}
                  </code>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6"
                    onClick={() => copyToClipboard(escrow.freelancerAddress)}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                  {isFreelancer && <Badge variant="outline">You</Badge>}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Milestones */}
        <Card>
          <CardHeader>
            <CardTitle>Milestones</CardTitle>
            <CardDescription>Track project progress and payments</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {actionError && (
              <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive">
                <AlertCircle className="h-4 w-4" />
                <p className="text-sm">{actionError}</p>
              </div>
            )}

            {escrow.milestones?.map((milestone, index) => (
              <div key={milestone.id} className="p-4 border rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm">
                      {index + 1}
                    </div>
                    <div>
                      <h4 className="font-medium">{milestone.title}</h4>
                      <p className="text-sm text-muted-foreground">{milestone.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold">{milestone.amount} {escrow.currency}</span>
                    <Badge className={milestoneStatusColors[milestone.status] || milestoneStatusColors.PENDING}>
                      {milestone.status}
                    </Badge>
                  </div>
                </div>

                {/* Milestone Actions */}
                {isAuthenticated && (
                  <div className="flex items-center gap-2 pt-2 border-t">
                    {isFreelancer && milestone.status === 'pending' && (
                      <Button 
                        size="sm" 
                        onClick={() => openSubmitDialog(milestone.id)}
                        disabled={actionLoading}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        <Send className="h-4 w-4 mr-2" />
                        Submit Work
                      </Button>
                    )}
                    {isFreelancer && milestone.status === 'submitted' && (
                      <div className="flex items-center gap-2 text-yellow-600">
                        <Clock className="h-4 w-4" />
                        <span className="text-sm">Awaiting client review</span>
                      </div>
                    )}
                    {isClient && milestone.status === 'submitted' && (
                      <>
                        <Button 
                          size="sm" 
                          onClick={() => handleMilestoneAction('approve', milestone.id)}
                          disabled={actionLoading}
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          Approve
                        </Button>
                        <Button 
                          size="sm" 
                          variant="destructive"
                          onClick={() => handleMilestoneAction('dispute', milestone.id)}
                          disabled={actionLoading}
                        >
                          Dispute
                        </Button>
                      </>
                    )}
                    {isClient && milestone.status === 'approved' && (
                      <Button 
                        size="sm" 
                        onClick={() => handleMilestoneAction('release', milestone.id)}
                        disabled={actionLoading}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        {actionLoading ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Releasing...
                          </>
                        ) : (
                          <>
                            <Send className="h-4 w-4 mr-2" />
                            Release Payment
                          </>
                        )}
                      </Button>
                    )}
                    {milestone.status === 'released' && isFreelancer && (
                      <div className="flex items-center gap-3 p-2 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800">
                        <CheckCircle className="h-5 w-5 text-green-600" />
                        <div>
                          <span className="text-sm font-medium text-green-700 dark:text-green-300">
                            +{milestone.amount} {escrow.tokenSymbol || 'USDC'} received!
                          </span>
                          <p className="text-xs text-green-600 dark:text-green-400">
                            Payment claimed to your Sui wallet
                          </p>
                        </div>
                      </div>
                    )}
                    {milestone.status === 'released' && isClient && (
                      <div className="flex items-center gap-2 text-green-600">
                        <CheckCircle className="h-4 w-4" />
                        <span className="text-sm">Payment Released</span>
                      </div>
                    )}
                    {milestone.status === 'released' && !isClient && !isFreelancer && (
                      <div className="flex items-center gap-2 text-green-600">
                        <CheckCircle className="h-4 w-4" />
                        <span className="text-sm">Payment Released</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Transaction Links */}
        {(escrow.evmTxHash || escrow.suiObjectId || txHash) && (
          <Card>
            <CardHeader>
              <CardTitle>Blockchain References</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {/* Recent Transaction from this session */}
              {txHash && (
                <div className="flex items-center justify-between p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium text-green-700">Fund Escrow TX</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono bg-green-100 dark:bg-green-900/30 px-2 py-1 rounded">
                      {txHash.slice(0, 10)}...{txHash.slice(-8)}
                    </code>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6"
                      onClick={() => copyToClipboard(txHash)}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}
              {escrow.evmTxHash && escrow.evmTxHash !== txHash && (
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <span className="text-sm">EVM Transaction</span>
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono">
                      {formatAddress(escrow.evmTxHash)}
                    </code>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6"
                      onClick={() => copyToClipboard(escrow.evmTxHash || '')}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}
              {escrow.suiObjectId && (
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <span className="text-sm">Sui Object</span>
                  <a 
                    href={`https://suiexplorer.com/object/${escrow.suiObjectId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    {formatAddress(escrow.suiObjectId)}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Recent Transactions */}
        <TransactionHistory />
      </div>

      {/* Submit Work Dialog */}
      <Dialog open={submitDialogOpen} onOpenChange={setSubmitDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-blue-600" />
              Submit Milestone Work
            </DialogTitle>
            <DialogDescription>
              Submit your completed work for this milestone. The client will review and approve it before releasing payment.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <strong>💡 Demo Mode:</strong> In a real scenario, we would attach deliverables, 
                links to your work, or detailed descriptions. For this demo, just add a comment 
                and click submit.
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="submission-note">Submission Notes (Optional)</Label>
              <Textarea
                id="submission-note"
                placeholder="Describe the work you've completed, add any relevant links or notes for the client..."
                value={submissionNote}
                onChange={(e) => setSubmissionNote(e.target.value)}
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                We can ddd details about deliverables, files, or links to help the client review the work.
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubmitDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSubmitWork} 
              disabled={actionLoading}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {actionLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Submit Work
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Release Payment Success Dialog */}
      <Dialog open={releaseDialogOpen} onOpenChange={setReleaseDialogOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Payment Released Successfully!
            </DialogTitle>
            <DialogDescription>
              {releaseResult?.bridge?.success 
                ? 'SUI has been transferred to the freelancer\'s wallet via the bridge!'
                : 'The cross-chain payment has been initiated.'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Success Banner */}
            <div className="p-4 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800">
              <p className="text-sm text-green-800 dark:text-green-200">
                <strong>✅ Payment Released!</strong> The milestone payment of{' '}
                <span className="font-mono font-bold">{releaseResult?.amount} {escrow?.tokenSymbol || 'USDC'}</span>{' '}
                {releaseResult?.bridge?.success 
                  ? <>was bridged to <span className="font-mono font-bold">{releaseResult.bridge.amountSui} SUI</span></>
                  : 'has been initiated.'}
              </p>
            </div>

            {/* Bridge Transaction Details */}
            {releaseResult?.bridge?.success && releaseResult.bridge.suiTxDigest && (
              <div className="space-y-3">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-blue-500" />
                  Bridge Transaction Confirmed
                </h4>
                
                <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-blue-700 dark:text-blue-300 font-medium">Sui Transaction Digest</span>
                    <div className="flex items-center gap-1">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-6 px-2"
                        onClick={() => copyToClipboard(releaseResult.bridge!.suiTxDigest!)}
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Copy
                      </Button>
                      <a
                        href={`https://suiscan.xyz/testnet/tx/${releaseResult.bridge.suiTxDigest}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                      >
                        View on SuiScan
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                  <code className="text-xs font-mono break-all block p-2 bg-background rounded">
                    {releaseResult.bridge.suiTxDigest}
                  </code>
                </div>

                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg border border-emerald-200 dark:border-emerald-800">
                  <p className="text-sm text-emerald-800 dark:text-emerald-200">
                    <strong>💰 Cross-Chain Transfer Complete!</strong> SUI sent to:
                  </p>
                  <code className="text-xs font-mono break-all block p-2 bg-background rounded mt-2">
                    {escrow?.suiRecipient || escrow?.freelancerAddress}
                  </code>
                </div>
              </div>
            )}

            {/* Bridge Error */}
            {releaseResult?.bridge && !releaseResult.bridge.success && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  <strong>⚠️ Bridge Simulation Mode:</strong> {releaseResult.bridge.error || 'Configure BRIDGE_PRIVATE_KEY to enable real transfers.'}
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-2">
                  In production, the bridge automatically sends {releaseResult.bridge.amountSui} SUI to the freelancer.
                </p>
              </div>
            )}

            {/* Cross-Chain HTLC Details */}
            {releaseResult?.crossChain && (
              <div className="space-y-3">
                <h4 className="font-medium text-sm">Cross-Chain HTLC Details (Atomic Swap):</h4>
                
                <div className="p-3 bg-muted/50 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Secret Hash</span>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-6 px-2"
                      onClick={() => copyToClipboard(releaseResult.crossChain!.secretHash)}
                    >
                      <Copy className="h-3 w-3 mr-1" />
                      Copy
                    </Button>
                  </div>
                  <code className="text-xs font-mono break-all block p-2 bg-background rounded">
                    {releaseResult.crossChain.secretHash}
                  </code>
                </div>

                <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                  <p className="text-xs text-blue-800 dark:text-blue-200">
                    <strong>ℹ️ Note:</strong> {releaseResult.crossChain.note}
                  </p>
                </div>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button 
              onClick={() => setReleaseDialogOpen(false)}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
