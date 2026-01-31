'use client'

import { useWorkspaceStore } from '@/store/workspace-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatTimestamp, getExplorerUrl } from '@/lib/utils'
import { ExternalLink, ArrowUpRight, ArrowDownLeft, AlertCircle, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'

export function TransactionHistory() {
  const transactions = useWorkspaceStore((state) => state.transactions)

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'DEPOSIT':
        return <ArrowDownLeft className="h-4 w-4 text-green-500" />
      case 'RELEASE':
      case 'REFUND':
        return <ArrowUpRight className="h-4 w-4 text-blue-500" />
      case 'DISPUTE':
        return <AlertCircle className="h-4 w-4 text-red-500" />
      default:
        return <CheckCircle2 className="h-4 w-4 text-gray-500" />
    }
  }

  const statusColors = {
    PENDING: 'warning',
    CONFIRMED: 'success',
    FAILED: 'destructive',
  } as const

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Transactions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {transactions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No transactions yet
            </div>
          ) : (
            transactions.slice(0, 10).map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {getTransactionIcon(tx.type)}
                  <div>
                    <p className="font-medium text-sm">{tx.type}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatTimestamp(tx.timestamp)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Badge variant={statusColors[tx.status as keyof typeof statusColors]}>
                    {tx.status}
                  </Badge>
                  <Link
                    href={getExplorerUrl(tx.network, 'tx', tx.txHash)}
                    target="_blank"
                    className="text-primary hover:underline"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}
