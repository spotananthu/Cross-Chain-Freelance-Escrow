'use client'

import { WagmiProvider, createConfig, http } from 'wagmi'
import { base, mainnet, foundry } from 'wagmi/chains'
import { ConnectKitProvider, getDefaultConfig } from 'connectkit'

// Local Anvil chain configuration
const localhost = {
  ...foundry,
  id: 31337,
  name: 'Localhost',
  rpcUrls: {
    default: { http: ['http://127.0.0.1:8545'] },
  },
} as const;

const config = createConfig(
  getDefaultConfig({
    chains: [localhost, mainnet, base],
    transports: {
      [localhost.id]: http('http://127.0.0.1:8545'),
      [mainnet.id]: http(),
      [base.id]: http(),
    },
    walletConnectProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID!,
    appName: 'AccorDefi',
    appDescription: 'Cross-chain escrow with integrated DeFi yield. Secure. Liquid. Decisive.',
    appUrl: 'https://crosschain-escrow.app',
    appIcon: 'https://crosschain-escrow.app/logo.png',
  })
)

export function EVMProvider({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <ConnectKitProvider>{children}</ConnectKitProvider>
    </WagmiProvider>
  )
}
