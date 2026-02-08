// Contract addresses - Update these after deployment
export const CONTRACTS = {
  // Local Anvil (Chain ID: 31337)
  31337: {
    escrow: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512' as `0x${string}`,
    bridge: '0x5FbDB2315678afecb367f032d93F642f64180aa3' as `0x${string}`,
    resolver: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0' as `0x${string}`,
  },
  // Sepolia (Chain ID: 11155111) - Add after testnet deployment
  11155111: {
    escrow: '0x0000000000000000000000000000000000000000' as `0x${string}`,
    bridge: '0x0000000000000000000000000000000000000000' as `0x${string}`,
    resolver: '0x0000000000000000000000000000000000000000' as `0x${string}`,
  },
} as const;

export function getContractAddress(chainId: number, contract: 'escrow' | 'bridge' | 'resolver'): `0x${string}` | null {
  const chainContracts = CONTRACTS[chainId as keyof typeof CONTRACTS];
  if (!chainContracts) return null;
  return chainContracts[contract];
}
