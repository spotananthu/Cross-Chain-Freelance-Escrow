import { SuiClient, SuiEvent } from '@mysten/sui/client';
import { config } from '../config';
import { db, escrows, milestones, bridgeTransfers } from '../db';
import { eq } from 'drizzle-orm';
import { io } from '../index';

export class SuiIndexer {
  private client: SuiClient;
  private isRunning = false;
  private cursor: string | null = null;
  private pollInterval: NodeJS.Timer | null = null;

  constructor() {
    this.client = new SuiClient({ url: config.sui.rpcUrl });
  }

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;

    console.log('[Sui Indexer] Starting event listener...');

    // Poll for events every 5 seconds
    this.pollInterval = setInterval(() => this.pollEvents(), 5000);
    
    // Initial poll
    await this.pollEvents();
  }

  private async pollEvents() {
    if (!config.sui.packageId) {
      console.log('[Sui Indexer] No package ID configured, skipping...');
      return;
    }

    try {
      const events = await this.client.queryEvents({
        query: {
          MoveModule: {
            package: config.sui.packageId,
            module: 'escrow',
          },
        },
        cursor: this.cursor ? { txDigest: this.cursor, eventSeq: '0' } : undefined,
        limit: 50,
        order: 'ascending',
      });

      for (const event of events.data) {
        await this.handleEvent(event);
        this.cursor = event.id.txDigest;
      }
    } catch (error) {
      console.error('[Sui Indexer] Error polling events:', error);
    }
  }

  private async handleEvent(event: SuiEvent) {
    const eventType = event.type.split('::').pop();
    console.log(`[Sui Indexer] Processing event: ${eventType}`);

    switch (eventType) {
      case 'EscrowCreated':
        await this.handleEscrowCreated(event);
        break;
      case 'MilestoneSubmitted':
        await this.handleMilestoneSubmitted(event);
        break;
      case 'MilestoneApproved':
        await this.handleMilestoneApproved(event);
        break;
      case 'MilestoneReleased':
        await this.handleMilestoneReleased(event);
        break;
      case 'DisputeInitiated':
        await this.handleDisputeInitiated(event);
        break;
      case 'DisputeResolved':
        await this.handleDisputeResolved(event);
        break;
      case 'BridgeTransferInitiated':
        await this.handleBridgeInitiated(event);
        break;
      case 'BridgeTransferCompleted':
        await this.handleBridgeCompleted(event);
        break;
      default:
        console.log(`[Sui Indexer] Unknown event type: ${eventType}`);
    }
  }

  private async handleEscrowCreated(event: SuiEvent) {
    const data = event.parsedJson as any;
    
    // Update local DB with on-chain ID
    const existing = await db.query.escrows.findFirst({
      where: eq(escrows.txHash, event.id.txDigest),
    });

    if (existing) {
      await db.update(escrows)
        .set({
          onChainId: data.escrow_id,
          status: 'active',
          updatedAt: new Date(),
        })
        .where(eq(escrows.id, existing.id));

      io?.emitToEscrow(existing.id, 'escrow:funded', {
        escrowId: existing.id,
        onChainId: data.escrow_id,
      });
    }

    console.log('[Sui] Escrow created:', data.escrow_id);
  }

  private async handleMilestoneSubmitted(event: SuiEvent) {
    const data = event.parsedJson as any;

    const escrow = await db.query.escrows.findFirst({
      where: eq(escrows.onChainId, data.escrow_id),
    });

    if (escrow) {
      const milestone = await db.query.milestones.findFirst({
        where: eq(milestones.onChainId, Number(data.milestone_index)),
      });

      if (milestone) {
        await db.update(milestones)
          .set({
            status: 'submitted',
            submissionNote: data.submission_note,
            submittedAt: new Date(),
          })
          .where(eq(milestones.id, milestone.id));

        io?.emitToEscrow(escrow.id, 'milestone:submitted', {
          milestoneId: milestone.id,
        });
      }
    }

    console.log('[Sui] Milestone submitted:', data.escrow_id, data.milestone_index);
  }

  private async handleMilestoneApproved(event: SuiEvent) {
    const data = event.parsedJson as any;

    const escrow = await db.query.escrows.findFirst({
      where: eq(escrows.onChainId, data.escrow_id),
    });

    if (escrow) {
      const milestone = await db.query.milestones.findFirst({
        where: eq(milestones.onChainId, Number(data.milestone_index)),
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

    console.log('[Sui] Milestone approved:', data.escrow_id, data.milestone_index);
  }

  private async handleMilestoneReleased(event: SuiEvent) {
    const data = event.parsedJson as any;

    const escrow = await db.query.escrows.findFirst({
      where: eq(escrows.onChainId, data.escrow_id),
    });

    if (escrow) {
      const milestone = await db.query.milestones.findFirst({
        where: eq(milestones.onChainId, Number(data.milestone_index)),
      });

      if (milestone) {
        await db.update(milestones)
          .set({
            status: 'released',
            releasedAt: new Date(),
            releaseTxHash: event.id.txDigest,
          })
          .where(eq(milestones.id, milestone.id));

        io?.emitToEscrow(escrow.id, 'milestone:released', {
          milestoneId: milestone.id,
          amount: data.amount,
        });
      }
    }

    console.log('[Sui] Milestone released:', data.escrow_id, data.milestone_index);
  }

  private async handleDisputeInitiated(event: SuiEvent) {
    const data = event.parsedJson as any;

    const escrow = await db.query.escrows.findFirst({
      where: eq(escrows.onChainId, data.escrow_id),
    });

    if (escrow) {
      await db.update(escrows)
        .set({
          status: 'disputed',
          updatedAt: new Date(),
        })
        .where(eq(escrows.id, escrow.id));

      io?.emitToEscrow(escrow.id, 'dispute:initiated', {
        escrowId: escrow.id,
        reason: data.reason,
      });
    }

    console.log('[Sui] Dispute initiated:', data.escrow_id);
  }

  private async handleDisputeResolved(event: SuiEvent) {
    const data = event.parsedJson as any;

    const escrow = await db.query.escrows.findFirst({
      where: eq(escrows.onChainId, data.escrow_id),
    });

    if (escrow) {
      await db.update(escrows)
        .set({
          status: 'active', // or completed depending on resolution
          updatedAt: new Date(),
        })
        .where(eq(escrows.id, escrow.id));

      io?.emitToEscrow(escrow.id, 'dispute:resolved', {
        escrowId: escrow.id,
        winner: data.winner,
      });
    }

    console.log('[Sui] Dispute resolved:', data.escrow_id);
  }

  private async handleBridgeInitiated(event: SuiEvent) {
    const data = event.parsedJson as any;

    io?.to('bridge').emit('bridge:initiated', {
      transferId: data.transfer_id,
      sender: data.sender,
      recipient: data.recipient,
      amount: data.amount,
      txDigest: event.id.txDigest,
    });

    console.log('[Sui] Bridge transfer initiated:', data.transfer_id);
  }

  private async handleBridgeCompleted(event: SuiEvent) {
    const data = event.parsedJson as any;

    await db.update(bridgeTransfers)
      .set({
        status: 'completed',
        destinationTxHash: event.id.txDigest,
        completedAt: new Date(),
      })
      .where(eq(bridgeTransfers.transferId, data.transfer_id));

    io?.to('bridge').emit('bridge:completed', {
      transferId: data.transfer_id,
      txDigest: event.id.txDigest,
    });

    console.log('[Sui] Bridge transfer completed:', data.transfer_id);
  }

  stop() {
    this.isRunning = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    console.log('[Sui Indexer] Stopped');
  }
}

// Export singleton
export const suiIndexer = new SuiIndexer();
