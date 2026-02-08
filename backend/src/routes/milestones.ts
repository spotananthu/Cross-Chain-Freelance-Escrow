import { Hono } from 'hono';
import { z } from 'zod';
import { db, milestones, escrows, notifications } from '../db';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { io } from '../index';

export const milestoneRoutes = new Hono();

// GET /api/milestones/:id - Get milestone by ID
milestoneRoutes.get('/:id', async (c) => {
  const { id } = c.req.param();
  
  try {
    const milestone = await db.query.milestones.findFirst({
      where: eq(milestones.id, id),
      with: { escrow: true },
    });
    
    if (!milestone) {
      return c.json({ success: false, error: 'Milestone not found' }, 404);
    }
    
    return c.json({ success: true, data: milestone });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch milestone' }, 500);
  }
});

// POST /api/milestones/:id/submit - Submit milestone work
milestoneRoutes.post('/:id/submit', async (c) => {
  const { id } = c.req.param();
  
  try {
    const body = await c.req.json();
    const { submissionNote } = body;
    
    await db.update(milestones)
      .set({
        status: 'submitted',
        submissionNote,
        submittedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(milestones.id, id));
    
    // Get milestone with escrow to notify client
    const milestone = await db.query.milestones.findFirst({
      where: eq(milestones.id, id),
      with: { escrow: { with: { client: true } } },
    });
    
    if (milestone?.escrow?.clientId) {
      // Create notification
      await db.insert(notifications).values({
        id: randomUUID(),
        userId: milestone.escrow.clientId,
        type: 'milestone_submitted',
        title: 'Milestone Submitted',
        message: `Work submitted for milestone: ${milestone.description}`,
        data: JSON.stringify({ milestoneId: id, escrowId: milestone.escrowId }),
      });
      
      // Emit real-time notification
      io?.to(`user:${milestone.escrow.clientId}`).emit('notification', {
        type: 'milestone_submitted',
        milestoneId: id,
      });
    }
    
    return c.json({ success: true, message: 'Milestone submitted' });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to submit milestone' }, 500);
  }
});

// POST /api/milestones/:id/approve - Approve milestone
milestoneRoutes.post('/:id/approve', async (c) => {
  const { id } = c.req.param();
  
  try {
    await db.update(milestones)
      .set({
        status: 'approved',
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(milestones.id, id));
    
    // Get milestone to notify freelancer
    const milestone = await db.query.milestones.findFirst({
      where: eq(milestones.id, id),
      with: { escrow: { with: { freelancer: true } } },
    });
    
    if (milestone?.escrow?.freelancerId) {
      await db.insert(notifications).values({
        id: randomUUID(),
        userId: milestone.escrow.freelancerId,
        type: 'milestone_approved',
        title: 'Milestone Approved',
        message: `Your work was approved: ${milestone.description}`,
        data: JSON.stringify({ milestoneId: id, escrowId: milestone.escrowId }),
      });
      
      io?.to(`user:${milestone.escrow.freelancerId}`).emit('notification', {
        type: 'milestone_approved',
        milestoneId: id,
      });
    }
    
    return c.json({ success: true, message: 'Milestone approved' });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to approve milestone' }, 500);
  }
});

// POST /api/milestones/:id/release - Mark milestone as released
milestoneRoutes.post('/:id/release', async (c) => {
  const { id } = c.req.param();
  
  try {
    const body = await c.req.json();
    const { txHash } = body;
    
    await db.update(milestones)
      .set({
        status: 'released',
        releasedAt: new Date(),
        releaseTxHash: txHash,
        updatedAt: new Date(),
      })
      .where(eq(milestones.id, id));
    
    // Check if all milestones are released
    const milestone = await db.query.milestones.findFirst({
      where: eq(milestones.id, id),
    });
    
    if (milestone) {
      const allMilestones = await db.query.milestones.findMany({
        where: eq(milestones.escrowId, milestone.escrowId),
      });
      
      const allReleased = allMilestones.every(m => 
        m.status === 'released' || m.status === 'refunded'
      );
      
      if (allReleased) {
        await db.update(escrows)
          .set({
            status: 'completed',
            updatedAt: new Date(),
          })
          .where(eq(escrows.id, milestone.escrowId));
      }
    }
    
    return c.json({ success: true, message: 'Milestone released' });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to release milestone' }, 500);
  }
});

// POST /api/milestones/:id/dispute - Initiate dispute
milestoneRoutes.post('/:id/dispute', async (c) => {
  const { id } = c.req.param();
  
  try {
    const body = await c.req.json();
    const { reason, initiatedBy } = body;
    
    await db.update(milestones)
      .set({
        status: 'disputed',
        updatedAt: new Date(),
      })
      .where(eq(milestones.id, id));
    
    // Update escrow status
    const milestone = await db.query.milestones.findFirst({
      where: eq(milestones.id, id),
    });
    
    if (milestone) {
      await db.update(escrows)
        .set({
          status: 'disputed',
          updatedAt: new Date(),
        })
        .where(eq(escrows.id, milestone.escrowId));
    }
    
    return c.json({ success: true, message: 'Dispute initiated' });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to initiate dispute' }, 500);
  }
});
