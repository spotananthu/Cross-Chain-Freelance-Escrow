# AccorDefi

Cross-chain freelance escrow. Clients pay on Ethereum, freelancers receive on Sui.

## What it does

Clients fund escrows in ETH/USDC. Freelancers connect with Sui wallets. When milestones are approved and released, our bridge converts the payment to SUI and sends it directly to the freelancer's wallet.

No manual bridging. No swapping. Just cross-chain payments that work.

## Stack

- **Frontend**: Next.js 14, wagmi, @mysten/dapp-kit
- **Backend**: Hono.js, Drizzle ORM, SQLite
- **EVM Contracts**: Solidity + Foundry
- **Sui Contracts**: Move (HTLC pattern)
- **Wallets**: MetaMask/Coinbase (clients), Slush (freelancers)

## Integrations

**Sui** - Move smart contracts with HTLC for atomic swaps. Bridge relayer sends native SUI on payment release.

**Yellow Network** - Off-chain state channels for gasless milestone negotiations. EIP-712 signed approvals.

## Quick Start

```bash
# Backend
cd backend && npm install && npm run dev

# Frontend  
cd frontend && npm install && npm run dev

# Local EVM (optional)
cd ethereum-contracts && anvil
```

Backend runs on `localhost:3002`, frontend on `localhost:3000`.

## Project Structure

```
├── backend/
│   └── src/
│       ├── routes/          # API endpoints
│       ├── integrations/    # Yellow, bridge relayer
│       └── db/              # Schema, migrations
├── frontend/
│   ├── app/                 # Next.js pages
│   ├── components/          # UI components
│   ├── lib/                 # Hooks, contracts, API
│   └── providers/           # Wallet providers
├── ethereum-contracts/      # Solidity escrow
└── sui-contracts/           # Move workspace HTLC
```

## Flow

1. Client creates workspace with milestones
2. Client funds escrow on EVM
3. Freelancer submits work
4. Client approves milestone
5. Client releases payment → Bridge sends SUI to freelancer

## Links

- [workspace.move](sui-contracts/sources/workspace.move) - Sui HTLC contract
- [bridge-relayer.ts](backend/src/integrations/bridge-relayer.ts) - Cross-chain transfer
- [yellow-network.ts](backend/src/integrations/yellow-network.ts) - State channels

