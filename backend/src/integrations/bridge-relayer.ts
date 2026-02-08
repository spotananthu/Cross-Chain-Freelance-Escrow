/**
 * Bridge Relayer Service
 * 
 * Simulates the cross-chain bridge that transfers funds from EVM to Sui.
 * In production, this would:
 * 1. Watch for release events on EVM escrow contract
 * 2. Verify the release via 1inch Fusion+ order
 * 3. Execute the Sui transfer using HTLC secret
 * 
 * For demo purposes, this uses a funded bridge wallet on Sui testnet
 * to actually send SUI to the freelancer.
 */

import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';

// Initialize Sui client for testnet
const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') });

// Bridge wallet - DEMO ONLY
// In production, this would be a secure hot wallet managed by the bridge protocol
// For demo, you can set this via environment variable
let bridgeKeypair: Ed25519Keypair | null = null;

/**
 * Initialize the bridge wallet from private key
 * Format: suiprivkey... (bech32 encoded) or hex
 */
export function initBridgeWallet(privateKeyOrMnemonic: string): string {
  try {
    if (privateKeyOrMnemonic.startsWith('suiprivkey')) {
      // Bech32 encoded private key
      const { secretKey } = decodeSuiPrivateKey(privateKeyOrMnemonic);
      bridgeKeypair = Ed25519Keypair.fromSecretKey(secretKey);
    } else if (privateKeyOrMnemonic.includes(' ')) {
      // Mnemonic phrase
      bridgeKeypair = Ed25519Keypair.deriveKeypair(privateKeyOrMnemonic);
    } else {
      // Hex encoded
      const secretKey = Buffer.from(privateKeyOrMnemonic.replace('0x', ''), 'hex');
      bridgeKeypair = Ed25519Keypair.fromSecretKey(secretKey);
    }
    
    const address = bridgeKeypair.getPublicKey().toSuiAddress();
    console.log('[Bridge] Initialized bridge wallet:', address);
    return address;
  } catch (error) {
    console.error('[Bridge] Failed to initialize wallet:', error);
    throw error;
  }
}

/**
 * Get bridge wallet address
 */
export function getBridgeAddress(): string | null {
  if (!bridgeKeypair) return null;
  return bridgeKeypair.getPublicKey().toSuiAddress();
}

/**
 * Get bridge wallet balance
 */
export async function getBridgeBalance(): Promise<bigint> {
  const address = getBridgeAddress();
  if (!address) return BigInt(0);
  
  try {
    const balance = await suiClient.getBalance({ owner: address });
    return BigInt(balance.totalBalance);
  } catch (error) {
    console.error('[Bridge] Failed to get balance:', error);
    return BigInt(0);
  }
}

/**
 * Execute cross-chain transfer from bridge to recipient
 * This is called when a release is triggered on EVM side
 */
export async function executeBridgeTransfer(
  recipientAddress: string,
  amountMist: bigint,
  metadata: {
    escrowId: string;
    milestoneId: string;
    secretHash: string;
  }
): Promise<{ success: boolean; digest?: string; error?: string }> {
  if (!bridgeKeypair) {
    console.log('[Bridge] No bridge wallet configured - simulating transfer');
    return {
      success: true,
      digest: `simulated_${Date.now().toString(16)}`,
      error: undefined,
    };
  }

  try {
    console.log('[Bridge] Executing transfer:', {
      recipient: recipientAddress,
      amountMist: amountMist.toString(),
      ...metadata,
    });

    // Create transaction
    const tx = new Transaction();
    
    // Split coins and transfer
    const [coin] = tx.splitCoins(tx.gas, [amountMist]);
    tx.transferObjects([coin], recipientAddress);

    // Execute transaction
    const result = await suiClient.signAndExecuteTransaction({
      transaction: tx,
      signer: bridgeKeypair,
      options: {
        showEffects: true,
      },
    });

    // Wait for confirmation
    await suiClient.waitForTransaction({ digest: result.digest });

    console.log('[Bridge] Transfer successful:', result.digest);
    
    return {
      success: true,
      digest: result.digest,
    };
  } catch (error) {
    console.error('[Bridge] Transfer failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Bridge transfer failed',
    };
  }
}

/**
 * Calculate SUI amount from USD value
 * Demo rate: 1 USDC = 0.5 SUI (adjust as needed)
 */
export function usdToSui(usdAmount: number): bigint {
  const suiAmount = usdAmount * 0.5; // Demo exchange rate
  return BigInt(Math.floor(suiAmount * 1_000_000_000)); // Convert to MIST
}

/**
 * Format MIST to SUI string
 */
export function formatSui(mist: bigint): string {
  return (Number(mist) / 1_000_000_000).toFixed(4);
}

// Try to initialize from environment variable
if (process.env.BRIDGE_PRIVATE_KEY) {
  try {
    initBridgeWallet(process.env.BRIDGE_PRIVATE_KEY);
  } catch (error) {
    console.warn('[Bridge] Could not initialize from env, running in simulation mode');
  }
}

export const bridgeRelayer = {
  initBridgeWallet,
  getBridgeAddress,
  getBridgeBalance,
  executeBridgeTransfer,
  usdToSui,
  formatSui,
};
