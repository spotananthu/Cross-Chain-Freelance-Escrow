// AccorDefiEscrow ABI - Key functions for frontend
export const ESCROW_ABI = [
  // Create escrow (payable - sends ETH with the call)
  {
    type: 'function',
    name: 'createEscrow',
    inputs: [
      { name: 'freelancer', type: 'address' },
      { name: 'title', type: 'string' },
      { name: 'description', type: 'string' },
      { name: 'milestoneDescriptions', type: 'string[]' },
      { name: 'milestoneAmounts', type: 'uint256[]' },
      { name: 'milestoneDeadlines', type: 'uint256[]' },
      { name: 'suiRecipient', type: 'bytes32' },
      { name: 'crossChain', type: 'bool' },
    ],
    outputs: [{ name: 'escrowId', type: 'uint256' }],
    stateMutability: 'payable',
  },
  // Deposit funds to existing escrow
  {
    type: 'function',
    name: 'deposit',
    inputs: [{ name: 'escrowId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'payable',
  },
  // Get escrow details
  {
    type: 'function',
    name: 'escrows',
    inputs: [{ name: '', type: 'uint256' }],
    outputs: [
      { name: 'id', type: 'uint256' },
      { name: 'client', type: 'address' },
      { name: 'freelancer', type: 'address' },
      { name: 'title', type: 'string' },
      { name: 'description', type: 'string' },
      { name: 'totalAmount', type: 'uint256' },
      { name: 'balance', type: 'uint256' },
      { name: 'milestonesCount', type: 'uint256' },
      { name: 'completedMilestones', type: 'uint256' },
      { name: 'status', type: 'uint8' },
      { name: 'crossChain', type: 'bool' },
      { name: 'suiRecipient', type: 'bytes32' },
      { name: 'createdAt', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
  // Submit milestone (freelancer)
  {
    type: 'function',
    name: 'submitMilestone',
    inputs: [
      { name: 'escrowId', type: 'uint256' },
      { name: 'milestoneId', type: 'uint256' },
      { name: 'submissionNote', type: 'string' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  // Approve milestone (client)
  {
    type: 'function',
    name: 'approveMilestone',
    inputs: [
      { name: 'escrowId', type: 'uint256' },
      { name: 'milestoneId', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  // Release milestone payment (client)
  {
    type: 'function',
    name: 'releaseMilestone',
    inputs: [
      { name: 'escrowId', type: 'uint256' },
      { name: 'milestoneId', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  // Get milestone details
  {
    type: 'function',
    name: 'escrowMilestones',
    inputs: [
      { name: '', type: 'uint256' },
      { name: '', type: 'uint256' },
    ],
    outputs: [
      { name: 'id', type: 'uint256' },
      { name: 'description', type: 'string' },
      { name: 'amount', type: 'uint256' },
      { name: 'status', type: 'uint8' },
      { name: 'deadline', type: 'uint256' },
      { name: 'submissionNote', type: 'string' },
      { name: 'submittedAt', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
  // Total escrows count
  {
    type: 'function',
    name: 'totalEscrows',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  // Events
  {
    type: 'event',
    name: 'EscrowCreated',
    inputs: [
      { name: 'escrowId', type: 'uint256', indexed: true },
      { name: 'client', type: 'address', indexed: true },
      { name: 'freelancer', type: 'address', indexed: true },
      { name: 'totalAmount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'EscrowFunded',
    inputs: [
      { name: 'escrowId', type: 'uint256', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'MilestoneSubmitted',
    inputs: [
      { name: 'escrowId', type: 'uint256', indexed: true },
      { name: 'milestoneId', type: 'uint256', indexed: true },
    ],
  },
  {
    type: 'event',
    name: 'MilestoneApproved',
    inputs: [
      { name: 'escrowId', type: 'uint256', indexed: true },
      { name: 'milestoneId', type: 'uint256', indexed: true },
    ],
  },
  {
    type: 'event',
    name: 'MilestoneReleased',
    inputs: [
      { name: 'escrowId', type: 'uint256', indexed: true },
      { name: 'milestoneId', type: 'uint256', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
] as const;
