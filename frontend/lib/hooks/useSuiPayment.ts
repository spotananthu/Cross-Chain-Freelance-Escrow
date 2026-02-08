'use client';

import { useCallback, useState } from 'react';
import { useSignAndExecuteTransaction, useSuiClient } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';

export interface SendPaymentParams {
  recipientAddress: string;
  amountMist: bigint; // Amount in MIST (1 SUI = 1_000_000_000 MIST)
}

export interface PaymentResult {
  success: boolean;
  digest?: string;
  error?: string;
}

/**
 * Hook for sending SUI payments directly from the connected wallet
 */
export function useSuiPayment() {
  const suiClient = useSuiClient();
  const { mutateAsync: signAndExecute, isPending } = useSignAndExecuteTransaction();
  const [lastTxDigest, setLastTxDigest] = useState<string | null>(null);

  /**
   * Send SUI to a recipient address
   * @param recipientAddress - The Sui address to send to
   * @param amountSui - Amount in SUI (will be converted to MIST)
   */
  const sendPayment = useCallback(async (
    recipientAddress: string,
    amountSui: number
  ): Promise<PaymentResult> => {
    try {
      // Convert SUI to MIST (1 SUI = 1_000_000_000 MIST)
      const amountMist = BigInt(Math.floor(amountSui * 1_000_000_000));
      
      console.log('[SuiPayment] Sending payment:', {
        recipient: recipientAddress,
        amountSui,
        amountMist: amountMist.toString(),
      });

      // Create transaction
      const tx = new Transaction();
      
      // Split coins and transfer
      const [coin] = tx.splitCoins(tx.gas, [amountMist]);
      tx.transferObjects([coin], recipientAddress);

      // Sign and execute
      const result = await signAndExecute({
        transaction: tx,
      });

      console.log('[SuiPayment] Transaction result:', result);
      
      // Wait for transaction confirmation
      const txResult = await suiClient.waitForTransaction({
        digest: result.digest,
        options: {
          showEffects: true,
        },
      });

      const success = txResult.effects?.status?.status === 'success';
      
      if (success) {
        setLastTxDigest(result.digest);
      }

      return {
        success,
        digest: result.digest,
        error: success ? undefined : txResult.effects?.status?.error,
      };
    } catch (error) {
      console.error('[SuiPayment] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send payment',
      };
    }
  }, [signAndExecute, suiClient]);

  /**
   * Get SUI balance for an address
   */
  const getBalance = useCallback(async (address: string): Promise<bigint> => {
    try {
      const balance = await suiClient.getBalance({
        owner: address,
      });
      return BigInt(balance.totalBalance);
    } catch (error) {
      console.error('[SuiPayment] Error getting balance:', error);
      return BigInt(0);
    }
  }, [suiClient]);

  /**
   * Format MIST to SUI with decimals
   */
  const formatSui = useCallback((mist: bigint): string => {
    const sui = Number(mist) / 1_000_000_000;
    return sui.toFixed(4);
  }, []);

  return {
    sendPayment,
    getBalance,
    formatSui,
    isPending,
    lastTxDigest,
  };
}
