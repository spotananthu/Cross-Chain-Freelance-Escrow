import { Web3Provider } from '@/providers'
import '@/app/globals.css'
import '@mysten/dapp-kit/dist/index.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Image from 'next/image'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'AccorDefi',
  description: 'Cross-chain escrow with integrated DeFi yield. Secure. Liquid. Decisive.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Web3Provider>
          <div className="min-h-screen relative">
            {children}
            <Image 
              src="/assets/bottom.png" 
              alt="" 
              width={550} 
              height={550}
              className="absolute -bottom-14 right-0 dark:invert pointer-events-none"
            />
          </div>
        </Web3Provider>
      </body>
    </html>
  )
}
