'use client'

import { ConnectKitButton } from 'connectkit'
import { ConnectButton } from '@mysten/dapp-kit'
import { Bell, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme-toggle'

export function Header() {
  return (
    <header className="h-16 border-b bg-card flex items-center justify-between px-6">
      {/* Search */}
      <div className="flex-1 max-w-xl">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search workspaces, transactions..."
            className="w-full pl-10 pr-4 py-2 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4">
        <ThemeToggle />
        
        <Button variant="ghost" size="icon">
          <Bell className="h-5 w-5" />
        </Button>

        <div className="flex items-center gap-3">
          <ConnectKitButton.Custom>
            {({ isConnected, show, truncatedAddress }) => (
              <button
                onClick={show}
                className="px-4 py-2 text-sm bg-black text-white dark:bg-white dark:text-black font-bold uppercase tracking-wide border-2 border-black dark:border-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all duration-150"
              >
                {isConnected ? truncatedAddress : 'EVM'}
              </button>
            )}
          </ConnectKitButton.Custom>
          <ConnectButton connectText="SUI" />
        </div>
      </div>
    </header>
  )
}
