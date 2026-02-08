import { Hono } from 'hono';
import { z } from 'zod';
import { db, bridgeTransfers } from '../db';
import { eq, desc } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { io } from '../index';

export const bridgeRoutes = new Hono();

// GET /api/bridge/transfers - List all bridge transfers
bridgeRoutes.get('/transfers', async (c) => {
  const { status, sender, recipient } = c.req.query();
  
  try {
    const transfers = await db.select()
      .from(bridgeTransfers)
      .orderBy(desc(bridgeTransfers.initiatedAt));
    
    return c.json({
      success: true,
      data: transfers,
      count: transfers.length,
    });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch transfers' }, 500);
  }
});

// GET /api/bridge/transfers/:id - Get transfer by ID
bridgeRoutes.get('/transfers/:id', async (c) => {
  const { id } = c.req.param();
  
  try {
    const transfer = await db.query.bridgeTransfers.findFirst({
      where: eq(bridgeTransfers.id, id),
    });
    
    if (!transfer) {
      return c.json({ success: false, error: 'Transfer not found' }, 404);
    }
    
    return c.json({ success: true, data: transfer });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch transfer' }, 500);
  }
});

// POST /api/bridge/transfers - Create new transfer record
bridgeRoutes.post('/transfers', async (c) => {
  try {
    const body = await c.req.json();
    const { 
      transferId, 
      sourceChain, 
      destinationChain, 
      sender, 
      recipient, 
      amount,
      tokenSymbol,
      sourceTxHash,
    } = body;
    
    const id = randomUUID();
    
    await db.insert(bridgeTransfers).values({
      id,
      transferId,
      sourceChain,
      destinationChain,
      sender,
      recipient,
      amount,
      tokenSymbol: tokenSymbol || 'ETH',
      status: 'initiated',
      sourceTxHash,
    });
    
    const created = await db.query.bridgeTransfers.findFirst({
      where: eq(bridgeTransfers.id, id),
    });
    
    // Emit real-time update
    io?.emit('bridge:initiated', created);
    
    return c.json({ success: true, data: created }, 201);
  } catch (error) {
    console.error(error);
    return c.json({ success: false, error: 'Failed to create transfer' }, 500);
  }
});

// POST /api/bridge/transfers/:id/confirm - Add confirmation
bridgeRoutes.post('/transfers/:id/confirm', async (c) => {
  const { id } = c.req.param();
  
  try {
    const body = await c.req.json();
    const { relayer } = body;
    
    const transfer = await db.query.bridgeTransfers.findFirst({
      where: eq(bridgeTransfers.id, id),
    });
    
    if (!transfer) {
      return c.json({ success: false, error: 'Transfer not found' }, 404);
    }
    
    const newConfirmations = (transfer.confirmations || 0) + 1;
    const isComplete = newConfirmations >= (transfer.requiredConfirmations || 2);
    
    await db.update(bridgeTransfers)
      .set({
        confirmations: newConfirmations,
        status: isComplete ? 'confirmed' : 'confirming',
      })
      .where(eq(bridgeTransfers.id, id));
    
    // Emit real-time update
    io?.emit('bridge:confirmed', { 
      transferId: id, 
      confirmations: newConfirmations,
      isComplete,
    });
    
    return c.json({ 
      success: true, 
      confirmations: newConfirmations,
      isComplete,
    });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to confirm transfer' }, 500);
  }
});

// POST /api/bridge/transfers/:id/complete - Mark transfer as complete
bridgeRoutes.post('/transfers/:id/complete', async (c) => {
  const { id } = c.req.param();
  
  try {
    const body = await c.req.json();
    const { destinationTxHash } = body;
    
    await db.update(bridgeTransfers)
      .set({
        status: 'completed',
        destinationTxHash,
        completedAt: new Date(),
      })
      .where(eq(bridgeTransfers.id, id));
    
    const updated = await db.query.bridgeTransfers.findFirst({
      where: eq(bridgeTransfers.id, id),
    });
    
    // Emit real-time update
    io?.emit('bridge:completed', updated);
    
    return c.json({ success: true, data: updated });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to complete transfer' }, 500);
  }
});

// GET /api/bridge/stats - Get bridge statistics
bridgeRoutes.get('/stats', async (c) => {
  try {
    const transfers = await db.select().from(bridgeTransfers);
    
    const stats = {
      totalTransfers: transfers.length,
      completed: transfers.filter(t => t.status === 'completed').length,
      pending: transfers.filter(t => ['initiated', 'confirming', 'confirmed'].includes(t.status!)).length,
      failed: transfers.filter(t => t.status === 'failed').length,
      totalVolume: transfers.reduce((sum, t) => sum + (t.amount || 0), 0),
    };
    
    return c.json({ success: true, data: stats });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch stats' }, 500);
  }
});
