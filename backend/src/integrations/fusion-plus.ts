/**
 * 1inch Fusion+ Cross-Chain Integration
 * 
 * Handles cross-chain swaps from EVM (Base/Ethereum) to Sui
 * using the 1inch Fusion+ protocol with HTLC (Hash Time-Locked Contracts).
 * 
 * Flow:
 * 1. Generate random secret + sha256(secret) = secret_hash
 * 2. Create Fusion+ order with secret_hash
 * 3. Resolver locks funds on Sui side with same secret_hash
 * 4. Freelancer reveals secret on Sui to claim funds
 * 5. Secret revelation automatically unlocks EVM side
 */

import { randomBytes, createHash } from 'crypto';
import { ethers } from 'ethers';

// Chain IDs
export const CHAIN_IDS = {
  ETHEREUM: 1,
  BASE: 8453,
  POLYGON: 137,
  ARBITRUM: 42161,
  OPTIMISM: 10,
  ANVIL: 31337,
} as const;

// Fusion+ API endpoints
const FUSION_API_BASE = 'https://api.1inch.dev/fusion-plus';
const ORDERBOOK_API = 'https://api.1inch.dev/orderbook';

// Token addresses (USDC on various chains)
export const USDC_ADDRESSES: Record<number, string> = {
  [CHAIN_IDS.ETHEREUM]: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  [CHAIN_IDS.BASE]: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  [CHAIN_IDS.POLYGON]: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  [CHAIN_IDS.ARBITRUM]: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  [CHAIN_IDS.OPTIMISM]: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
};

export interface SecretPair {
  secret: Buffer;
  secretHash: Buffer;
  secretHex: string;
  secretHashHex: string;
}

export interface FusionOrder {
  orderId: string;
  srcChainId: number;
  dstChainId: number;
  srcToken: string;
  dstToken: string;
  srcAmount: string;
  dstAmount: string;
  secretHash: string;
  maker: string;
  receiver: string;
  deadline: number;
  status: 'pending' | 'filled' | 'cancelled' | 'expired';
}

export interface QuoteParams {
  srcChainId: number;
  dstChainId: number;
  srcTokenAddress: string;
  dstTokenAddress: string;
  amount: string;
  walletAddress: string;
}

export interface Quote {
  srcChainId: number;
  dstChainId: number;
  srcTokenAmount: string;
  dstTokenAmount: string;
  estimatedGas: string;
  priceImpact: string;
  route: string[];
}

/**
 * Generate a cryptographically secure secret and its SHA256 hash
 * The secret is 32 bytes (256 bits) for security
 */
export function generateSecretPair(): SecretPair {
  // Generate 32 random bytes as the secret
  const secret = randomBytes(32);
  
  // Compute SHA256 hash of the secret
  const secretHash = createHash('sha256').update(secret).digest();

  return {
    secret,
    secretHash,
    secretHex: '0x' + secret.toString('hex'),
    secretHashHex: '0x' + secretHash.toString('hex'),
  };
}

/**
 * Verify that a secret matches a given hash
 */
export function verifySecret(secret: Buffer | string, expectedHash: Buffer | string): boolean {
  const secretBuffer = typeof secret === 'string' 
    ? Buffer.from(secret.replace('0x', ''), 'hex')
    : secret;
  
  const hashBuffer = typeof expectedHash === 'string'
    ? Buffer.from(expectedHash.replace('0x', ''), 'hex')
    : expectedHash;

  const computedHash = createHash('sha256').update(secretBuffer).digest();
  
  return computedHash.equals(hashBuffer);
}

/**
 * 1inch Fusion+ Client
 */
export class FusionPlusClient {
  private apiKey: string;
  private chainId: number;

  constructor(apiKey: string = '', chainId: number = CHAIN_IDS.ANVIL) {
    this.apiKey = apiKey;
    this.chainId = chainId;
  }

  /**
   * Get headers for 1inch API requests
   */
  private getHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Get a quote for cross-chain swap
   */
  async getQuote(params: QuoteParams): Promise<Quote> {
    // For demo/development, return mock quote
    if (!this.apiKey || this.chainId === CHAIN_IDS.ANVIL) {
      return this.getMockQuote(params);
    }

    const queryParams = new URLSearchParams({
      srcChain: params.srcChainId.toString(),
      dstChain: params.dstChainId.toString(),
      srcTokenAddress: params.srcTokenAddress,
      dstTokenAddress: params.dstTokenAddress,
      amount: params.amount,
      walletAddress: params.walletAddress,
    });

    const response = await fetch(`${FUSION_API_BASE}/v1/quote?${queryParams}`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to get quote: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Create a Fusion+ cross-chain order
   */
  async createOrder(
    signer: ethers.Signer,
    params: {
      srcChainId: number;
      dstChainId: number;
      srcToken: string;
      dstToken: string;
      amount: string;
      receiver: string;
      secretHash: string;
      deadline?: number;
    }
  ): Promise<FusionOrder> {
    // For demo/development, return mock order
    if (!this.apiKey || this.chainId === CHAIN_IDS.ANVIL) {
      return this.createMockOrder(signer, params);
    }

    const maker = await signer.getAddress();
    const deadline = params.deadline || Math.floor(Date.now() / 1000) + 3600; // 1 hour

    // Build order data
    const orderData = {
      srcChainId: params.srcChainId,
      dstChainId: params.dstChainId,
      srcTokenAddress: params.srcToken,
      dstTokenAddress: params.dstToken,
      srcAmount: params.amount,
      receiver: params.receiver,
      secretHash: params.secretHash,
      deadline,
    };

    // Sign the order (EIP-712)
    const signature = await this.signOrder(signer, orderData);

    // Submit to Fusion+ API
    const response = await fetch(`${FUSION_API_BASE}/v1/order`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        ...orderData,
        signature,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create order: ${response.statusText}`);
    }

    const result = await response.json();

    return {
      orderId: result.orderId,
      srcChainId: params.srcChainId,
      dstChainId: params.dstChainId,
      srcToken: params.srcToken,
      dstToken: params.dstToken,
      srcAmount: params.amount,
      dstAmount: result.dstAmount,
      secretHash: params.secretHash,
      maker,
      receiver: params.receiver,
      deadline,
      status: 'pending',
    };
  }

  /**
   * Get order status
   */
  async getOrderStatus(orderId: string): Promise<FusionOrder['status']> {
    if (!this.apiKey || this.chainId === CHAIN_IDS.ANVIL) {
      return 'pending'; // Mock status
    }

    const response = await fetch(`${ORDERBOOK_API}/v1/order/${orderId}`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to get order status: ${response.statusText}`);
    }

    const result = await response.json();
    return result.status;
  }

  /**
   * Reveal secret to complete the swap
   * This is called by the freelancer to claim funds on the destination chain
   */
  async revealSecret(orderId: string, secret: string): Promise<boolean> {
    if (!this.apiKey || this.chainId === CHAIN_IDS.ANVIL) {
      console.log(`[FusionPlus] Mock: Revealing secret for order ${orderId}`);
      return true;
    }

    const response = await fetch(`${FUSION_API_BASE}/v1/order/${orderId}/reveal`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ secret }),
    });

    if (!response.ok) {
      throw new Error(`Failed to reveal secret: ${response.statusText}`);
    }

    return true;
  }

  /**
   * Sign order using EIP-712
   */
  private async signOrder(signer: ethers.Signer, orderData: any): Promise<string> {
    const domain = {
      name: 'Fusion+',
      version: '1',
      chainId: orderData.srcChainId,
    };

    const types = {
      Order: [
        { name: 'srcChainId', type: 'uint256' },
        { name: 'dstChainId', type: 'uint256' },
        { name: 'srcTokenAddress', type: 'address' },
        { name: 'dstTokenAddress', type: 'address' },
        { name: 'srcAmount', type: 'uint256' },
        { name: 'receiver', type: 'address' },
        { name: 'secretHash', type: 'bytes32' },
        { name: 'deadline', type: 'uint256' },
      ],
    };

    return signer.signTypedData(domain, types, orderData);
  }

  /**
   * Mock quote for development
   */
  private getMockQuote(params: QuoteParams): Quote {
    // Simulate 0.1% slippage
    const srcAmount = BigInt(params.amount);
    const dstAmount = srcAmount * 999n / 1000n;

    return {
      srcChainId: params.srcChainId,
      dstChainId: params.dstChainId,
      srcTokenAmount: params.amount,
      dstTokenAmount: dstAmount.toString(),
      estimatedGas: '150000',
      priceImpact: '0.1',
      route: ['1inch Router', 'Fusion+ Bridge', 'Sui DEX'],
    };
  }

  /**
   * Mock order for development
   */
  private async createMockOrder(
    signer: ethers.Signer,
    params: {
      srcChainId: number;
      dstChainId: number;
      srcToken: string;
      dstToken: string;
      amount: string;
      receiver: string;
      secretHash: string;
      deadline?: number;
    }
  ): Promise<FusionOrder> {
    const maker = await signer.getAddress();
    const deadline = params.deadline || Math.floor(Date.now() / 1000) + 3600;
    
    // Generate mock order ID
    const orderIdBytes = randomBytes(16);
    const orderId = '0x' + orderIdBytes.toString('hex');

    console.log('[FusionPlus] Created mock order:', {
      orderId,
      secretHash: params.secretHash,
      receiver: params.receiver,
    });

    return {
      orderId,
      srcChainId: params.srcChainId,
      dstChainId: params.dstChainId,
      srcToken: params.srcToken,
      dstToken: params.dstToken,
      srcAmount: params.amount,
      dstAmount: params.amount, // 1:1 for demo
      secretHash: params.secretHash,
      maker,
      receiver: params.receiver,
      deadline,
      status: 'pending',
    };
  }
}

/**
 * Cross-Chain Release Manager
 * 
 * Orchestrates the full release flow:
 * 1. Generate secret pair
 * 2. Create Fusion+ order on EVM
 * 3. Wait for resolver to lock on Sui
 * 4. Freelancer reveals secret on Sui
 * 5. Mark order as complete
 */
export class CrossChainReleaseManager {
  private fusionClient: FusionPlusClient;
  private pendingReleases: Map<string, {
    escrowId: string;
    milestoneId: string;
    secretPair: SecretPair;
    fusionOrder: FusionOrder | null;
    status: 'created' | 'order_pending' | 'sui_locked' | 'revealed' | 'completed';
  }> = new Map();

  constructor(apiKey: string = '', chainId: number = CHAIN_IDS.ANVIL) {
    this.fusionClient = new FusionPlusClient(apiKey, chainId);
  }

  /**
   * Initiate cross-chain release
   * Returns the secret pair - secret_hash goes to contracts, secret to freelancer
   */
  async initiateRelease(
    escrowId: string,
    milestoneId: string
  ): Promise<{ secretHash: string; releaseId: string }> {
    const secretPair = generateSecretPair();
    const releaseId = `${escrowId}:${milestoneId}`;

    this.pendingReleases.set(releaseId, {
      escrowId,
      milestoneId,
      secretPair,
      fusionOrder: null,
      status: 'created',
    });

    console.log('[CrossChainRelease] Initiated:', {
      releaseId,
      secretHashHex: secretPair.secretHashHex,
    });

    return {
      secretHash: secretPair.secretHashHex,
      releaseId,
    };
  }

  /**
   * Create Fusion+ order for cross-chain swap
   */
  async createFusionOrder(
    releaseId: string,
    signer: ethers.Signer,
    params: {
      srcChainId: number;
      srcToken: string;
      amount: string;
      suiReceiver: string;
    }
  ): Promise<FusionOrder> {
    const release = this.pendingReleases.get(releaseId);
    if (!release) {
      throw new Error('Release not found');
    }

    // Create order with our secret hash
    const order = await this.fusionClient.createOrder(signer, {
      srcChainId: params.srcChainId,
      dstChainId: 101, // Sui chain ID placeholder
      srcToken: params.srcToken,
      dstToken: 'SUI', // Native SUI for simplicity
      amount: params.amount,
      receiver: params.suiReceiver,
      secretHash: release.secretPair.secretHashHex,
    });

    release.fusionOrder = order;
    release.status = 'order_pending';

    return order;
  }

  /**
   * Get the secret for a release (only after order is filled)
   * This secret is sent to the freelancer to claim on Sui
   */
  getSecret(releaseId: string): string | null {
    const release = this.pendingReleases.get(releaseId);
    if (!release) {
      return null;
    }

    // In production, only reveal after Sui side is locked
    // For demo, we reveal immediately
    return release.secretPair.secretHex;
  }

  /**
   * Mark release as completed
   */
  completeRelease(releaseId: string): void {
    const release = this.pendingReleases.get(releaseId);
    if (release) {
      release.status = 'completed';
    }
  }

  /**
   * Get release status
   */
  getReleaseStatus(releaseId: string): string | null {
    return this.pendingReleases.get(releaseId)?.status || null;
  }
}

// Export singleton instances
export const fusionClient = new FusionPlusClient();
export const releaseManager = new CrossChainReleaseManager();
