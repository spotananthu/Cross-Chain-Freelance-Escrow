import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatAddress(address: string): string {
  if (!address) return ''
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function formatUSDC(amount: string | number): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num)
}

export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function getTimeRemaining(expiryTimestamp: number): {
  total: number
  days: number
  hours: number
  minutes: number
  seconds: number
} {
  const total = expiryTimestamp - Date.now()
  const seconds = Math.floor((total / 1000) % 60)
  const minutes = Math.floor((total / 1000 / 60) % 60)
  const hours = Math.floor((total / (1000 * 60 * 60)) % 24)
  const days = Math.floor(total / (1000 * 60 * 60 * 24))

  return {
    total,
    days,
    hours,
    minutes,
    seconds,
  }
}

export function getExplorerUrl(
  network: 'ethereum' | 'base' | 'sui',
  type: 'tx' | 'address',
  value: string
): string {
  const explorers = {
    ethereum: {
      tx: `https://eth.blockscout.com/tx/${value}`,
      address: `https://eth.blockscout.com/address/${value}`,
    },
    base: {
      tx: `https://base.blockscout.com/tx/${value}`,
      address: `https://base.blockscout.com/address/${value}`,
    },
    sui: {
      tx: `https://suiexplorer.com/txblock/${value}`,
      address: `https://suiexplorer.com/address/${value}`,
    },
  }

  return explorers[network][type]
}
