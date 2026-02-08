import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, disputes, arbiterVotes, escrows, users } from '../db';
import { eq, and, or } from 'drizzle-orm';
import { io } from '../index';

const disputeRoutes = new Hono();

// Get dispute by ID
disputeRoutes.get('/:id', async (c) => {
  const disputeId = c.req.param('id');

  const dispute = await db.query.disputes.findFirst({
    where: eq(disputes.id, disputeId),
    with: {
      escrow: true,
      votes: {
        with: {
          arbiter: true,
        },
      },
    },
  });

  if (!dispute) {
    return c.json({ error: 'Dispute not found' }, 404);
  }

  return c.json(dispute);
});

// Create dispute
const createDisputeSchema = z.object({
  escrowId: z.string(),
  milestoneId: z.string().optional(),
  reason: z.string().min(10),
});

disputeRoutes.post('/', zValidator('json', createDisputeSchema), async (c) => {
  const data = c.req.valid('json');
  const initiatorAddress = c.req.header('X-User-Address');

  // Verify escrow exists
  const escrow = await db.query.escrows.findFirst({
    where: eq(escrows.id, data.escrowId),
    with: {
      client: true,
      freelancer: true,
    },
  });

  if (!escrow) {
    return c.json({ error: 'Escrow not found' }, 404);
  }

  // Find initiator user
  const initiator = initiatorAddress ? await db.query.users.findFirst({
    where: or(
      eq(users.evmAddress, initiatorAddress),
      eq(users.suiAddress, initiatorAddress)
    ),
  }) : null;

  const [dispute] = await db.insert(disputes)
    .values({
      id: crypto.randomUUID(),
      escrowId: data.escrowId,
      milestoneId: data.milestoneId,
      initiatedBy: initiator?.id,
      reason: data.reason,
      status: 'open',
    })
    .returning();

  // Update escrow status
  await db.update(escrows)
    .set({ status: 'disputed', updatedAt: new Date() })
    .where(eq(escrows.id, data.escrowId));

  io?.emitToEscrow(data.escrowId, 'dispute:created', {
    disputeId: dispute.id,
    escrowId: data.escrowId,
  });

  return c.json(dispute, 201);
});

// Submit arbiter vote
const voteSchema = z.object({
  voteForClient: z.boolean(),
});

disputeRoutes.post('/:id/vote', zValidator('json', voteSchema), async (c) => {
  const disputeId = c.req.param('id');
  const data = c.req.valid('json');
  const arbiterAddress = c.req.header('X-User-Address');

  const dispute = await db.query.disputes.findFirst({
    where: eq(disputes.id, disputeId),
    with: {
      escrow: true,
    },
  });

  if (!dispute) {
    return c.json({ error: 'Dispute not found' }, 404);
  }

  if (dispute.status !== 'voting') {
    return c.json({ error: 'Dispute is not in voting phase' }, 400);
  }

  // Find arbiter
  const arbiter = arbiterAddress ? await db.query.users.findFirst({
    where: or(
      eq(users.evmAddress, arbiterAddress),
      eq(users.suiAddress, arbiterAddress)
    ),
  }) : null;

  if (!arbiter) {
    return c.json({ error: 'Arbiter not found' }, 404);
  }

  // Check if already voted
  const existingVote = await db.query.arbiterVotes.findFirst({
    where: and(
      eq(arbiterVotes.disputeId, disputeId),
      eq(arbiterVotes.arbiterId, arbiter.id)
    ),
  });

  if (existingVote) {
    return c.json({ error: 'Already voted on this dispute' }, 400);
  }

  const [vote] = await db.insert(arbiterVotes)
    .values({
      id: crypto.randomUUID(),
      disputeId,
      arbiterId: arbiter.id,
      voteForClient: data.voteForClient,
    })
    .returning();

  // Update vote counts
  if (data.voteForClient) {
    await db.update(disputes)
      .set({ votesForClient: (dispute.votesForClient || 0) + 1 })
      .where(eq(disputes.id, disputeId));
  } else {
    await db.update(disputes)
      .set({ votesForFreelancer: (dispute.votesForFreelancer || 0) + 1 })
      .where(eq(disputes.id, disputeId));
  }

  // Check if all arbiters have voted (3 votes required)
  const allVotes = await db.query.arbiterVotes.findMany({
    where: eq(arbiterVotes.disputeId, disputeId),
  });

  if (allVotes.length >= 3) {
    // Tally votes and resolve
    const clientVotes = allVotes.filter(v => v.voteForClient).length;
    const freelancerVotes = allVotes.length - clientVotes;
    
    const resolution = clientVotes > freelancerVotes ? 'resolved_client' : 'resolved_freelancer';
    
    await db.update(disputes)
      .set({
        status: resolution,
        resolvedAt: new Date(),
      })
      .where(eq(disputes.id, disputeId));

    io?.emitToEscrow(dispute.escrowId, 'dispute:resolved', {
      disputeId,
      resolution,
    });
  }

  return c.json(vote, 201);
});

// Get dispute timeline
disputeRoutes.get('/:id/timeline', async (c) => {
  const disputeId = c.req.param('id');

  const dispute = await db.query.disputes.findFirst({
    where: eq(disputes.id, disputeId),
    with: {
      votes: true,
    },
  });

  if (!dispute) {
    return c.json({ error: 'Dispute not found' }, 404);
  }

  interface TimelineEvent {
    type: string;
    timestamp: Date | null;
    details: Record<string, unknown>;
  }

  const timeline: TimelineEvent[] = [
    {
      type: 'initiated',
      timestamp: dispute.createdAt,
      details: { reason: dispute.reason },
    },
    ...dispute.votes.map(v => ({
      type: 'vote',
      timestamp: v.votedAt,
      details: { voteForClient: v.voteForClient },
    })),
  ];

  if (dispute.resolvedAt) {
    timeline.push({
      type: 'resolved',
      timestamp: dispute.resolvedAt,
      details: { status: dispute.status },
    });
  }

  return c.json(timeline);
});

export { disputeRoutes };
