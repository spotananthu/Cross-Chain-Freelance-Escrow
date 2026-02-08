'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EVMProvider } from './evm-provider'
import { SuiProvider } from './sui-provider'
import { ThemeProvider } from './theme-provider'
import { AuthProvider } from './auth-provider'

const queryClient = new QueryClient()

export function Web3Provider({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="system" storageKey="escrow-ui-theme">
        <EVMProvider>
          <SuiProvider>
            <AuthProvider>{children}</AuthProvider>
          </SuiProvider>
        </EVMProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

export { useAuth } from './auth-provider'
