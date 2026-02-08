import { createPublicClient, createWalletClient, http, parseAbiItem } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { mainnet, sepolia, baseSepolia } from 'viem/chains';
import { config } from '../config';
import { db, escrows, milestones, bridgeTransfers } from '../db';
import { eq } from 'drizzle-orm';
import { io } from '../index';

// EVM Event ABIs
const ESCROW_CREATED_ABI = parseAbiItem(
  'event EscrowCreated(uint256 indexed escrowId, address indexed client, address indexed freelancer, uint256 totalAmount, uint256 milestoneCount, bool crossChain)'
);

const MILESTONE_SUBMITTED_ABI = parseAbiItem(
  'event MilestoneSubmitted(uint256 indexed escrowId, uint256 indexed milestoneId, address indexed freelancer, string submissionNote)'
);

const MILESTONE_APPROVED_ABI = parseAbiItem(
  'event MilestoneApproved(uint256 indexed escrowId, uint256 indexed milestoneId, address indexed client)'
);

const MILESTONE_RELEASED_ABI = parseAbiItem(
  'event MilestoneReleased(uint256 indexed escrowId, uint256 indexed milestoneId, address indexed freelancer, uint256 amount)'
);

const BRIDGE_INITIATED_ABI = parseAbiItem(
  'event BridgeInitiated(bytes32 indexed transferId, bytes32 indexed suiRecipient, uint256 amount, uint256 timestamp)'
);

const BRIDGE_EXECUTED_ABI = parseAbiItem(
  'event BridgeExecuted(bytes32 indexed transferId, bytes32 suiRecipient, uint256 amount)'
);

export class EVMIndexer {
  private client: ReturnType<typeof createPublicClient> | null = null;
  private isRunning = false;

  constructor() {
    try {
      const chain = config.evm.chainId === 1 ? mainnet : config.evm.chainId === 11155111 ? sepolia : baseSepolia;
      this.client = createPublicClient({
        chain,
        transport: http(config.evm.rpcUrl),
      }) as ReturnType<typeof createPublicClient>;
    } catch (error) {
      console.error('[EVM Indexer] Failed to create client:', error);
    }
  }

  async start() {
    if (this.isRunning || !this.client) return;
    this.isRunning = true;

    console.log('[EVM Indexer] Starting event listener...');

    // Watch for Escrow events
    if (config.evm.escrowAddress) {
      this.watchEscrowEvents();
    }

    // Watch for Bridge events
    if (config.evm.bridgeAddress) {
      this.watchBridgeEvents();
    }
  }

  private async watchEscrowEvents() {
    if (!this.client) return;
    const escrowAddress = config.evm.escrowAddress as `0x${string}`;

    // EscrowCreated
    this.client.watchEvent({
      address: escrowAddress,
      event: ESCROW_CREATED_ABI,
      onLogs: async (logs) => {
        for (const log of logs) {
          console.log('[EVM] EscrowCreated event:', log);
          await this.handleEscrowCreated(log);
        }
      },
    });

    // MilestoneSubmitted
    this.client.watchEvent({
      address: escrowAddress,
      event: MILESTONE_SUBMITTED_ABI,
      onLogs: async (logs) => {
        for (const log of logs) {
          console.log('[EVM] MilestoneSubmitted event:', log);
          await this.handleMilestoneSubmitted(log);
        }
      },
    });

    // MilestoneApproved
    this.client.watchEvent({
      address: escrowAddress,
      event: MILESTONE_APPROVED_ABI,
      onLogs: async (logs) => {
        for (const log of logs) {
          console.log('[EVM] MilestoneApproved event:', log);
          await this.handleMilestoneApproved(log);
        }
      },
    });

    // MilestoneReleased
    this.client.watchEvent({
      address: escrowAddress,
      event: MILESTONE_RELEASED_ABI,
      onLogs: async (logs) => {
        for (const log of logs) {
          console.log('[EVM] MilestoneReleased event:', log);
          await this.handleMilestoneReleased(log);
        }
      },
    });

    console.log('[EVM Indexer] Watching escrow events at:', escrowAddress);
  }

  private async watchBridgeEvents() {
    if (!this.client) return;
    const bridgeAddress = config.evm.bridgeAddress as `0x${string}`;

    // BridgeInitiated
    this.client.watchEvent({
      address: bridgeAddress,
      event: BRIDGE_INITIATED_ABI,
      onLogs: async (logs) => {
        for (const log of logs) {
          console.log('[EVM] BridgeInitiated event:', log);
          await this.handleBridgeInitiated(log);
        }
      },
    });

    // BridgeExecuted
    this.client.watchEvent({
      address: bridgeAddress,
      event: BRIDGE_EXECUTED_ABI,
      onLogs: async (logs) => {
        for (const log of logs) {
          console.log('[EVM] BridgeExecuted event:', log);
          await this.handleBridgeExecuted(log);
        }
      },
    });

    console.log('[EVM Indexer] Watching bridge events at:', bridgeAddress);
  }

  // Event handlers
  private async handleEscrowCreated(log: any) {
    const { escrowId, client, totalAmount, crossChain } = log.args;
    
    // Update local DB with on-chain ID
    const existing = await db.query.escrows.findFirst({
      where: eq(escrows.txHash, log.transactionHash),
    });

    if (existing) {
      await db.update(escrows)
        .set({
          onChainId: escrowId.toString(),
          status: 'active',
          updatedAt: new Date(),
        })
        .where(eq(escrows.id, existing.id));

      io?.emitToEscrow(existing.id, 'escrow:funded', {
        escrowId: existing.id,
        onChainId: escrowId.toString(),
      });
    }
  }

  private async handleMilestoneSubmitted(log: any) {
    const { escrowId, milestoneId, submissionNote } = log.args;

    const escrow = await db.query.escrows.findFirst({
      where: eq(escrows.onChainId, escrowId.toString()),
    });

    if (escrow) {
      const milestone = await db.query.milestones.findFirst({
        where: eq(milestones.onChainId, Number(milestoneId)),
      });

      if (milestone) {
        await db.update(milestones)
          .set({
            status: 'submitted',
            submissionNote,
            submittedAt: new Date(),
          })
          .where(eq(milestones.id, milestone.id));

        io?.emitToEscrow(escrow.id, 'milestone:submitted', {
          milestoneId: milestone.id,
        });
      }
    }
  }

  private async handleMilestoneApproved(log: any) {
    const { escrowId, milestoneId } = log.args;

    const escrow = await db.query.escrows.findFirst({
      where: eq(escrows.onChainId, escrowId.toString()),
    });

    if (escrow) {
      const milestone = await db.query.milestones.findFirst({
        where: eq(milestones.onChainId, Number(milestoneId)),
      });

      if (milestone) {
        await db.update(milestones)
          .set({
            status: 'approved',
            approvedAt: new Date(),
          })
          .where(eq(milestones.id, milestone.id));

        io?.emitToEscrow(escrow.id, 'milestone:approved', {
          milestoneId: milestone.id,
        });
      }
    }
  }

  private async handleMilestoneReleased(log: any) {
    const { escrowId, milestoneId, amount } = log.args;

    const escrow = await db.query.escrows.findFirst({
      where: eq(escrows.onChainId, escrowId.toString()),
    });

    if (escrow) {
      const milestone = await db.query.milestones.findFirst({
        where: eq(milestones.onChainId, Number(milestoneId)),
      });

      if (milestone) {
        await db.update(milestones)
          .set({
            status: 'released',
            releasedAt: new Date(),
            releaseTxHash: log.transactionHash,
          })
          .where(eq(milestones.id, milestone.id));

        io?.emitToEscrow(escrow.id, 'milestone:released', {
          milestoneId: milestone.id,
          amount: amount.toString(),
        });
      }
    }
  }

  private async handleBridgeInitiated(log: any) {
    const { transferId, suiRecipient, amount, timestamp } = log.args;

    io?.to('bridge').emit('bridge:initiated', {
      transferId: transferId,
      suiRecipient: suiRecipient,
      amount: amount.toString(),
      timestamp: Number(timestamp),
      txHash: log.transactionHash,
    });
  }

  private async handleBridgeExecuted(log: any) {
    const { transferId, suiRecipient, amount } = log.args;

    // Update DB
    await db.update(bridgeTransfers)
      .set({
        status: 'completed',
        completedAt: new Date(),
      })
      .where(eq(bridgeTransfers.transferId, transferId));

    io?.to('bridge').emit('bridge:executed', {
      transferId: transferId,
      suiRecipient: suiRecipient,
      amount: amount.toString(),
    });
  }

  stop() {
    this.isRunning = false;
    console.log('[EVM Indexer] Stopped');
  }
}

// Export singleton
export const evmIndexer = new EVMIndexer();
