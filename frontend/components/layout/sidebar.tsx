'use client'

import { useState, useEffect } from 'react'
import { useAccount, useDisconnect } from 'wagmi'
import { useCurrentAccount, useDisconnectWallet } from '@mysten/dapp-kit'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { 
  Wallet, 
  Home, 
  Briefcase, 
  Plus, 
  History, 
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { formatAddress } from '@/lib/utils'
import { resolveENSName } from '@/lib/ens'
import { cn } from '@/lib/utils'

interface SidebarProps {
  className?: string
}

export function Sidebar({ className }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false)
  const { address: evmAddress } = useAccount()
  const { disconnect: disconnectEVM } = useDisconnect()
  const suiAccount = useCurrentAccount()
  const { mutate: disconnectSui } = useDisconnectWallet()
  const router = useRouter()
  const [ensName, setEnsName] = useState<string | null>(null)

  const handleDisconnect = () => {
    if (evmAddress) {
      disconnectEVM()
    }
    if (suiAccount) {
      disconnectSui()
    }
    router.push('/')
  }

  useEffect(() => {
    if (evmAddress) {
      resolveENSName(evmAddress).then(setEnsName)
    }
  }, [evmAddress])

  const connectedAddress = evmAddress || suiAccount?.address
  const displayName = ensName || (connectedAddress ? formatAddress(connectedAddress) : 'Not Connected')

  const menuItems = [
    { icon: Home, label: 'Dashboard', href: '/dashboard' },
    { icon: Briefcase, label: 'Workspaces', href: '/workspaces' },
    { icon: Plus, label: 'Create Workspace', href: '/create' },
    { icon: History, label: 'Transactions', href: '/transactions' },
    { icon: Settings, label: 'Settings', href: '/settings' },
  ]

  return (
    <div
      className={cn(
        'flex flex-col border-r bg-card transition-all duration-300',
        collapsed ? 'w-16' : 'w-64',
        className
      )}
    >
      {/* Header */}
      <div className="flex h-16 items-center justify-between px-4 border-b">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <Wallet className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-semibold">CrossChain Escrow</span>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="h-8 w-8"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* User Profile */}
      <div className="p-4">
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarImage src={`https://avatar.vercel.sh/${connectedAddress}`} />
            <AvatarFallback>
              {displayName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{displayName}</p>
              <p className="text-xs text-muted-foreground">
                {evmAddress ? 'EVM' : 'Sui'} Wallet
              </p>
            </div>
          )}
        </div>
      </div>

      <Separator />

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-1">
        {menuItems.map((item) => (
          <Link key={item.href} href={item.href}>
            <Button
              variant="ghost"
              className={cn(
                'w-full justify-start',
                collapsed ? 'px-2' : 'px-3'
              )}
            >
              <item.icon className="h-5 w-5" />
              {!collapsed && <span className="ml-3">{item.label}</span>}
            </Button>
          </Link>
        ))}
      </nav>

      <Separator />

      {/* Footer */}
      <div className="p-2">
        <Button
          variant="ghost"
          onClick={handleDisconnect}
          className={cn(
            'w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10',
            collapsed ? 'px-2' : 'px-3'
          )}
        >
          <LogOut className="h-5 w-5" />
          {!collapsed && <span className="ml-3">Disconnect</span>}
        </Button>
      </div>
    </div>
  )
}
