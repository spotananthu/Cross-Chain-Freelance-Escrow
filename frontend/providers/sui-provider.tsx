'use client'

import { SuiClientProvider, WalletProvider, createNetworkConfig } from '@mysten/dapp-kit'

const { networkConfig } = createNetworkConfig({
  mainnet: { url: 'https://fullnode.mainnet.sui.io' },
  testnet: { url: 'https://fullnode.testnet.sui.io' },
  devnet: { url: 'https://fullnode.devnet.sui.io' },
})

export function SuiProvider({ children }: { children: React.ReactNode }) {
  return (
    <SuiClientProvider networks={networkConfig} defaultNetwork="testnet">
      <WalletProvider autoConnect>
        {children}
      </WalletProvider>
    </SuiClientProvider>
  )
}
