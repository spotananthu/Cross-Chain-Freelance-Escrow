// Type definitions for API responses

export interface User {
  id: string;
  evmAddress: string | null;
  suiAddress: string | null;
  walletAddress?: string; // computed from evmAddress || suiAddress
  ensName: string | null;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
  role: 'client' | 'freelancer' | 'arbiter' | null;
  createdAt: string;
  updatedAt: string;
}

export interface Milestone {
  id: string;
  escrowId: string;
  onChainId: number | null;
  title: string;
  description: string | null;
  amount: string;
  order: number;
  dueDate: string | null;
  status: 'pending' | 'in_progress' | 'submitted' | 'approved' | 'released' | 'disputed' | 'refunded';
  submissionNote: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  releasedAt: string | null;
  releaseTxHash: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Escrow {
  id: string;
  onChainId: string | null;
  chain: 'evm' | 'sui';
  txHash: string | null;
  clientId: string | null;
  freelancerId: string | null;
  // Addresses - can be derived from client/freelancer or stored directly
  clientAddress: string;
  freelancerAddress: string;
  clientEnsName?: string | null;
  freelancerEnsName?: string | null;
  title: string;
  description: string | null;
  totalAmount: string;
  currency: string;
  tokenAddress: string | null;
  tokenSymbol: string;
  status: 'pending' | 'active' | 'completed' | 'disputed' | 'cancelled' | 'refunded';
  isCrossChain: boolean;
  suiRecipient: string | null;
  suiObjectId: string | null;
  evmTxHash: string | null;
  createdAt: string;
  updatedAt: string;
  client?: User;
  freelancer?: User;
  milestones?: Milestone[];
}

export interface Dispute {
  id: string;
  escrowId: string;
  milestoneId: string | null;
  initiatedBy: string | null;
  reason: string;
  votesForClient: number;
  votesForFreelancer: number;
  status: 'open' | 'voting' | 'resolved_client' | 'resolved_freelancer';
  resolutionNote: string | null;
  resolvedAt: string | null;
  createdAt: string;
  escrow?: Escrow;
}

export interface BridgeTransfer {
  id: string;
  transferId: string;
  sourceChain: 'evm' | 'sui';
  destinationChain: 'evm' | 'sui';
  sender: string;
  recipient: string;
  amount: number;
  tokenSymbol: string;
  status: 'initiated' | 'confirming' | 'confirmed' | 'completed' | 'failed' | 'refunded';
  confirmations: number;
  requiredConfirmations: number;
  sourceTxHash: string | null;
  destinationTxHash: string | null;
  initiatedAt: string;
  completedAt: string | null;
}

export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  data: string | null;
  read: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface CreateEscrowRequest {
  chain?: 'evm' | 'sui';
  clientAddress: string;
  freelancerAddress?: string;
  title: string;
  description?: string;
  totalAmount: string | number;
  currency?: string;
  tokenSymbol?: string;
  isCrossChain?: boolean;
  suiRecipient?: string;
  milestones: {
    title: string;
    description?: string;
    amount: string | number;
    order?: number;
    deadline?: string;
  }[];
}

export interface AuthResponse {
  token: string;
  user: User;
}
