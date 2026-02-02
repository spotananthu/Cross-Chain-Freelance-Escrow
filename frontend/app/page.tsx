'use client'

import { useRouter } from 'next/navigation'
import { useAccount } from 'wagmi'
import { useCurrentAccount } from '@mysten/dapp-kit'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Zap, Shield, Users } from 'lucide-react'
import { ConnectKitButton } from 'connectkit'
import { ConnectButton } from '@mysten/dapp-kit'
import { useEffect } from 'react'
import { ThemeToggle } from '@/components/theme-toggle'
import { HowItWorks } from '@/components/how-it-works'
import { WavyDotGrid } from '@/components/wavy-dot-grid'
import dynamic from 'next/dynamic'
import Image from 'next/image'

// Dynamic import both wallet buttons to load them together on client-side only
const WalletButtons = dynamic(
  () => Promise.resolve(({ onEvmConnect }: { onEvmConnect?: () => void }) => (
    <>
      <ConnectKitButton.Custom>
        {({ isConnected, show, truncatedAddress }) => (
          <button
            onClick={show}
            className="px-8 py-4 bg-black text-white dark:bg-white dark:text-black font-black text-lg uppercase tracking-wide border-4 border-black dark:border-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)] hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all duration-150"
          >
            {isConnected ? truncatedAddress : 'Connect EVM (Client)'}
          </button>
        )}
      </ConnectKitButton.Custom>
      <span className="text-neutral-400 hidden sm:block font-black text-xl">OR</span>
      <div className="sui-connect-wrapper">
        <ConnectButton connectText="Connect Sui (Freelancer)" />
      </div>
    </>
  )),
  { ssr: false }
)

export default function HomePage() {
  const router = useRouter()
  const { address: evmAddress } = useAccount()
  const suiAccount = useCurrentAccount()

  useEffect(() => {
    if (evmAddress || suiAccount?.address) {
      router.push('/dashboard')
    }
  }, [evmAddress, suiAccount, router])

  const features = [
    {
      icon: Shield,
      title: 'Secure Cross-Chain Escrow',
      description: 'Your funds are protected across EVM and Sui chains with trustless contracts',
    },
    {
      icon: Zap,
      title: 'Gasless Milestones',
      description: 'Yellow Network state channels enable zero-gas milestone approvals',
    },
    {
      icon: Users,
      title: 'ENS Integration',
      description: 'Human-readable names for clients and freelancers across all chains',
    },
  ]

  return (
    <div className="min-h-screen bg-white dark:bg-black relative">
      {/* Animated Background */}
      <WavyDotGrid />

      {/* Theme Toggle - Top Right */}
      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle />
      </div>

      {/* Hero Section */}
      <div className="container mx-auto px-4 py-16 relative z-10">
        <div className="text-center mb-16">
          <div className="flex justify-center -mb-8">
            <Image 
              src="/assets/title.png" 
              alt="AccorDefi" 
              width={290} 
              height={290}
              className="dark:invert"
            />
          </div>
          
          <h1 className="text-6xl md:text-8xl font-black mb-4 text-black dark:text-white tracking-tight">
            AccorDefi
          </h1>
          
          <p className="text-xl text-neutral-600 dark:text-neutral-400 mb-8 max-w-2xl mx-auto font-medium">
            Secure milestone-based payments across EVM and Sui blockchains with gasless approvals
          </p>

          <div className="flex flex-col sm:flex-row gap-6 justify-center items-center min-h-[60px]">
            <WalletButtons />
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-6 mb-16 mt-28">
          {features.map((feature, index) => (
            <Card key={index} className="border-2 border-black dark:border-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-all duration-300 group">
              <CardHeader>
                <div className="h-12 w-12 rounded-lg bg-black dark:bg-white flex items-center justify-center mb-4 group-hover:bg-white group-hover:dark:bg-black transition-colors">
                  <feature.icon className="h-6 w-6 text-white dark:text-black group-hover:text-black group-hover:dark:text-white transition-colors" />
                </div>
                <CardTitle className="font-bold text-xl">{feature.title}</CardTitle>
                <CardDescription className="group-hover:text-neutral-300 dark:group-hover:text-neutral-700">{feature.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>

        {/* How It Works - Animated Section */}
        <HowItWorks />

        {/* Footer */}
        <div className="mt-16 text-center text-sm text-neutral-500 dark:text-neutral-500 font-medium">
          <p className="mt-2">© 2026 AccorDefi. All rights reserved.</p>
        </div>
      </div>
    </div>
  )
}
