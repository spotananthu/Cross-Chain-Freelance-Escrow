'use client';

import { useWriteContract, useWaitForTransactionReceipt, useChainId } from 'wagmi';
import { parseEther } from 'viem';
import { ESCROW_ABI } from './abi';
import { getContractAddress } from './config';

export function useEscrowContract() {
  const chainId = useChainId();
  const escrowAddress = getContractAddress(chainId, 'escrow');
  
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  // Create and fund a new escrow on-chain
  const createEscrow = async (params: {
    freelancerAddress: string;
    title: string;
    description: string;
    milestones: { description: string; amount: string; deadline?: number }[];
    suiRecipient?: string;
    totalAmountEth: string;
  }) => {
    if (!escrowAddress) {
      throw new Error('Contract not deployed on this network');
    }

    const milestoneDescriptions = params.milestones.map(m => m.description);
    const milestoneAmounts = params.milestones.map(m => parseEther(m.amount));
    const milestoneDeadlines = params.milestones.map(m => BigInt(m.deadline || 0));
    
    // Convert Sui recipient to bytes32 (or zero if not cross-chain)
    const suiRecipient = params.suiRecipient 
      ? params.suiRecipient as `0x${string}`
      : '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`;
    
    const isCrossChain = !!params.suiRecipient;

    writeContract({
      address: escrowAddress,
      abi: ESCROW_ABI,
      functionName: 'createEscrow',
      args: [
        params.freelancerAddress as `0x${string}`,
        params.title,
        params.description,
        milestoneDescriptions,
        milestoneAmounts,
        milestoneDeadlines,
        suiRecipient,
        isCrossChain,
      ],
      value: parseEther(params.totalAmountEth),
    });
  };

  // Deposit additional funds to an existing escrow
  const depositToEscrow = async (escrowId: number, amountEth: string) => {
    if (!escrowAddress) {
      throw new Error('Contract not deployed on this network');
    }

    writeContract({
      address: escrowAddress,
      abi: ESCROW_ABI,
      functionName: 'deposit',
      args: [BigInt(escrowId)],
      value: parseEther(amountEth),
    });
  };

  // Submit milestone work (freelancer)
  const submitMilestone = async (escrowId: number, milestoneId: number, note: string) => {
    if (!escrowAddress) {
      throw new Error('Contract not deployed on this network');
    }

    writeContract({
      address: escrowAddress,
      abi: ESCROW_ABI,
      functionName: 'submitMilestone',
      args: [BigInt(escrowId), BigInt(milestoneId), note],
    });
  };

  // Approve milestone (client)
  const approveMilestone = async (escrowId: number, milestoneId: number) => {
    if (!escrowAddress) {
      throw new Error('Contract not deployed on this network');
    }

    writeContract({
      address: escrowAddress,
      abi: ESCROW_ABI,
      functionName: 'approveMilestone',
      args: [BigInt(escrowId), BigInt(milestoneId)],
    });
  };

  // Release milestone payment (client)
  const releaseMilestone = async (escrowId: number, milestoneId: number) => {
    if (!escrowAddress) {
      throw new Error('Contract not deployed on this network');
    }

    writeContract({
      address: escrowAddress,
      abi: ESCROW_ABI,
      functionName: 'releaseMilestone',
      args: [BigInt(escrowId), BigInt(milestoneId)],
    });
  };

  return {
    // Contract address
    escrowAddress,
    chainId,
    
    // Actions
    createEscrow,
    depositToEscrow,
    submitMilestone,
    approveMilestone,
    releaseMilestone,
    
    // State
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
  };
}
