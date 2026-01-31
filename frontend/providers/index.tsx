'use client'

import { EVMProvider } from './evm-provider'
import { SuiProvider } from './sui-provider'
import { ThemeProvider } from './theme-provider'

export function Web3Provider({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider defaultTheme="system" storageKey="escrow-ui-theme">
      <EVMProvider>
        <SuiProvider>{children}</SuiProvider>
      </EVMProvider>
    </ThemeProvider>
  )
}
