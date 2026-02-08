/**
 * Yellow Network State Channel Client
 * 
 * Handles off-chain coordination between client and freelancer
 * using Yellow Network's NitroliteClient for state channels.
 * 
 * Flow:
 * 1. Client signs EIP-712 "Work Approved" intent
 * 2. Freelancer countersigns to confirm
 * 3. State channel tracks handshake before on-chain release
 */

import { ethers } from 'ethers';

// Yellow Network ClearNode Sandbox endpoint
const CLEARNODE_SANDBOX_WS = 'wss://clearnet-sandbox.yellow.com/ws';

// EIP-712 Domain for AccorDefi
const EIP712_DOMAIN = {
  name: 'AccorDefi',
  version: '1',
  chainId: 31337, // Will be updated dynamically
};

// EIP-712 Types for Work Approval
const WORK_APPROVAL_TYPES = {
  WorkApproval: [
    { name: 'escrowId', type: 'string' },
    { name: 'milestoneId', type: 'string' },
    { name: 'amount', type: 'uint256' },
    { name: 'freelancerAddress', type: 'string' },
    { name: 'secretHash', type: 'bytes32' },
    { name: 'timestamp', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
  ],
};

// EIP-712 Types for Release Intent
const RELEASE_INTENT_TYPES = {
  ReleaseIntent: [
    { name: 'escrowId', type: 'string' },
    { name: 'milestoneId', type: 'string' },
    { name: 'amount', type: 'uint256' },
    { name: 'secretHash', type: 'bytes32' },
    { name: 'timestamp', type: 'uint256' },
  ],
};

export interface WorkApprovalMessage {
  escrowId: string;
  milestoneId: string;
  amount: bigint;
  freelancerAddress: string;
  secretHash: string;
  timestamp: number;
  nonce: number;
}

export interface ReleaseIntentMessage {
  escrowId: string;
  milestoneId: string;
  amount: bigint;
  secretHash: string;
  timestamp: number;
}

export interface SignedMessage<T> {
  message: T;
  signature: string;
  signer: string;
}

export interface SessionState {
  escrowId: string;
  milestoneId: string;
  clientApproval?: SignedMessage<WorkApprovalMessage>;
  freelancerConfirmation?: SignedMessage<WorkApprovalMessage>;
  releaseIntent?: SignedMessage<ReleaseIntentMessage>;
  status: 'pending' | 'approved' | 'confirmed' | 'releasing' | 'completed';
  createdAt: number;
  updatedAt: number;
}

/**
 * Yellow Network State Channel Client
 */
export class YellowNetworkClient {
  private ws: WebSocket | null = null;
  private sessions: Map<string, SessionState> = new Map();
  private chainId: number;
  private messageHandlers: Map<string, (data: any) => void> = new Map();

  constructor(chainId: number = 31337) {
    this.chainId = chainId;
  }

  /**
   * Connect to Yellow Network ClearNode
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(CLEARNODE_SANDBOX_WS);
        
        this.ws.onopen = () => {
          console.log('[YellowNetwork] Connected to ClearNode Sandbox');
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(JSON.parse(event.data));
        };

        this.ws.onerror = (error) => {
          console.error('[YellowNetwork] WebSocket error:', error);
          reject(error);
        };

        this.ws.onclose = () => {
          console.log('[YellowNetwork] Connection closed');
        };
      } catch (error) {
        // Fallback for non-browser environments
        console.log('[YellowNetwork] WebSocket not available, using mock mode');
        resolve();
      }
    });
  }

  /**
   * Disconnect from ClearNode
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Get EIP-712 domain with current chain ID
   */
  private getDomain() {
    return {
      ...EIP712_DOMAIN,
      chainId: this.chainId,
    };
  }

  /**
   * Sign a "Work Approved" message as the client
   * This is the first step in the handshake
   */
  async signWorkApproval(
    signer: ethers.Signer,
    message: WorkApprovalMessage
  ): Promise<SignedMessage<WorkApprovalMessage>> {
    const domain = this.getDomain();
    
    const signature = await signer.signTypedData(
      domain,
      WORK_APPROVAL_TYPES,
      {
        ...message,
        amount: message.amount.toString(),
      }
    );

    const signerAddress = await signer.getAddress();

    return {
      message,
      signature,
      signer: signerAddress,
    };
  }

  /**
   * Verify a signed work approval message
   */
  verifyWorkApproval(signedMessage: SignedMessage<WorkApprovalMessage>): boolean {
    try {
      const domain = this.getDomain();
      
      const recoveredAddress = ethers.verifyTypedData(
        domain,
        WORK_APPROVAL_TYPES,
        {
          ...signedMessage.message,
          amount: signedMessage.message.amount.toString(),
        },
        signedMessage.signature
      );

      return recoveredAddress.toLowerCase() === signedMessage.signer.toLowerCase();
    } catch (error) {
      console.error('[YellowNetwork] Signature verification failed:', error);
      return false;
    }
  }

  /**
   * Sign a "Release Intent" message
   * This triggers the cross-chain release process
   */
  async signReleaseIntent(
    signer: ethers.Signer,
    message: ReleaseIntentMessage
  ): Promise<SignedMessage<ReleaseIntentMessage>> {
    const domain = this.getDomain();
    
    const signature = await signer.signTypedData(
      domain,
      RELEASE_INTENT_TYPES,
      {
        ...message,
        amount: message.amount.toString(),
      }
    );

    const signerAddress = await signer.getAddress();

    return {
      message,
      signature,
      signer: signerAddress,
    };
  }

  /**
   * Create a new session for milestone release
   */
  createSession(escrowId: string, milestoneId: string): SessionState {
    const sessionKey = `${escrowId}:${milestoneId}`;
    
    const session: SessionState = {
      escrowId,
      milestoneId,
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.sessions.set(sessionKey, session);
    return session;
  }

  /**
   * Get session by escrow and milestone ID
   */
  getSession(escrowId: string, milestoneId: string): SessionState | undefined {
    const sessionKey = `${escrowId}:${milestoneId}`;
    return this.sessions.get(sessionKey);
  }

  /**
   * Update session with client approval
   */
  async setClientApproval(
    escrowId: string,
    milestoneId: string,
    approval: SignedMessage<WorkApprovalMessage>
  ): Promise<SessionState> {
    const sessionKey = `${escrowId}:${milestoneId}`;
    let session = this.sessions.get(sessionKey);

    if (!session) {
      session = this.createSession(escrowId, milestoneId);
    }

    session.clientApproval = approval;
    session.status = 'approved';
    session.updatedAt = Date.now();

    this.sessions.set(sessionKey, session);

    // Broadcast to ClearNode
    this.sendMessage({
      type: 'CLIENT_APPROVAL',
      sessionKey,
      approval,
    });

    return session;
  }

  /**
   * Update session with freelancer confirmation
   */
  async setFreelancerConfirmation(
    escrowId: string,
    milestoneId: string,
    confirmation: SignedMessage<WorkApprovalMessage>
  ): Promise<SessionState> {
    const sessionKey = `${escrowId}:${milestoneId}`;
    const session = this.sessions.get(sessionKey);

    if (!session) {
      throw new Error('Session not found');
    }

    if (!session.clientApproval) {
      throw new Error('Client approval required first');
    }

    session.freelancerConfirmation = confirmation;
    session.status = 'confirmed';
    session.updatedAt = Date.now();

    this.sessions.set(sessionKey, session);

    // Broadcast to ClearNode
    this.sendMessage({
      type: 'FREELANCER_CONFIRMATION',
      sessionKey,
      confirmation,
    });

    return session;
  }

  /**
   * Complete handshake and trigger release
   */
  async initiateRelease(
    escrowId: string,
    milestoneId: string,
    releaseIntent: SignedMessage<ReleaseIntentMessage>
  ): Promise<SessionState> {
    const sessionKey = `${escrowId}:${milestoneId}`;
    const session = this.sessions.get(sessionKey);

    if (!session) {
      throw new Error('Session not found');
    }

    if (session.status !== 'confirmed') {
      throw new Error('Handshake not complete');
    }

    session.releaseIntent = releaseIntent;
    session.status = 'releasing';
    session.updatedAt = Date.now();

    this.sessions.set(sessionKey, session);

    // Broadcast to ClearNode
    this.sendMessage({
      type: 'RELEASE_INTENT',
      sessionKey,
      releaseIntent,
    });

    return session;
  }

  /**
   * Mark session as completed
   */
  completeSession(escrowId: string, milestoneId: string): void {
    const sessionKey = `${escrowId}:${milestoneId}`;
    const session = this.sessions.get(sessionKey);

    if (session) {
      session.status = 'completed';
      session.updatedAt = Date.now();
      this.sessions.set(sessionKey, session);
    }
  }

  /**
   * Send message to ClearNode
   */
  private sendMessage(data: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.log('[YellowNetwork] Mock mode - message:', data);
    }
  }

  /**
   * Handle incoming messages from ClearNode
   */
  private handleMessage(data: any): void {
    console.log('[YellowNetwork] Received:', data);

    const handler = this.messageHandlers.get(data.type);
    if (handler) {
      handler(data);
    }
  }

  /**
   * Register a message handler
   */
  onMessage(type: string, handler: (data: any) => void): void {
    this.messageHandlers.set(type, handler);
  }

  /**
   * Check if handshake is complete for a session
   */
  isHandshakeComplete(escrowId: string, milestoneId: string): boolean {
    const session = this.getSession(escrowId, milestoneId);
    return session?.status === 'confirmed' || session?.status === 'releasing' || session?.status === 'completed';
  }
}

// Export singleton instance
export const yellowNetwork = new YellowNetworkClient();
