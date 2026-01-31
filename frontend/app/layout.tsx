import { Web3Provider } from '@/providers'
import '@/app/globals.css'
import '@mysten/dapp-kit/dist/index.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Cross-Chain Freelance Escrow',
  description: 'Secure cross-chain freelance payments with milestone management',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Web3Provider>{children}</Web3Provider>
      </body>
    </html>
  )
}
