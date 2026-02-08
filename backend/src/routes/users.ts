import { Hono } from 'hono';
import { z } from 'zod';
import { db, users, notifications } from '../db';
import { eq, or, desc } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export const userRoutes = new Hono();

// GET /api/users/:address - Get user by wallet address
userRoutes.get('/:address', async (c) => {
  const { address } = c.req.param();
  
  try {
    const user = await db.query.users.findFirst({
      where: or(
        eq(users.evmAddress, address),
        eq(users.suiAddress, address)
      ),
    });
    
    if (!user) {
      return c.json({ success: false, error: 'User not found' }, 404);
    }
    
    return c.json({ success: true, data: user });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch user' }, 500);
  }
});

// POST /api/users - Create or update user
userRoutes.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const { evmAddress, suiAddress, displayName, email, role } = body;
    
    // Build where clause
    let existing = null;
    if (evmAddress) {
      existing = await db.query.users.findFirst({
        where: eq(users.evmAddress, evmAddress),
      });
    }
    if (!existing && suiAddress) {
      existing = await db.query.users.findFirst({
        where: eq(users.suiAddress, suiAddress),
      });
    }
    
    if (existing) {
      // Update
      await db.update(users)
        .set({
          displayName: displayName || existing.displayName,
          email: email || existing.email,
          evmAddress: evmAddress || existing.evmAddress,
          suiAddress: suiAddress || existing.suiAddress,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existing.id));
      
      return c.json({ success: true, data: { ...existing, displayName, email } });
    }
    
    // Create new user
    const userId = randomUUID();
    await db.insert(users).values({
      id: userId,
      evmAddress,
      suiAddress,
      displayName,
      email,
      role: role || 'freelancer',
    });
    
    const newUser = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    
    return c.json({ success: true, data: newUser }, 201);
  } catch (error) {
    console.error(error);
    return c.json({ success: false, error: 'Failed to create/update user' }, 500);
  }
});

// GET /api/users/:address/notifications - Get user notifications
userRoutes.get('/:address/notifications', async (c) => {
  const { address } = c.req.param();
  const { unread } = c.req.query();
  
  try {
    const user = await db.query.users.findFirst({
      where: or(
        eq(users.evmAddress, address),
        eq(users.suiAddress, address)
      ),
    });
    
    if (!user) {
      return c.json({ success: true, data: [] });
    }
    
    let query = db.select()
      .from(notifications)
      .where(eq(notifications.userId, user.id))
      .orderBy(desc(notifications.createdAt));
    
    const result = await query;
    
    // Filter unread if requested
    const filtered = unread === 'true' 
      ? result.filter(n => !n.read)
      : result;
    
    return c.json({ success: true, data: filtered });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch notifications' }, 500);
  }
});

// POST /api/users/:address/notifications/:id/read - Mark notification as read
userRoutes.post('/:address/notifications/:id/read', async (c) => {
  const { id } = c.req.param();
  
  try {
    await db.update(notifications)
      .set({
        read: true,
        readAt: new Date(),
      })
      .where(eq(notifications.id, id));
    
    return c.json({ success: true, message: 'Notification marked as read' });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to update notification' }, 500);
  }
});

// POST /api/users/:address/notifications/read-all - Mark all as read
userRoutes.post('/:address/notifications/read-all', async (c) => {
  const { address } = c.req.param();
  
  try {
    const user = await db.query.users.findFirst({
      where: or(
        eq(users.evmAddress, address),
        eq(users.suiAddress, address)
      ),
    });
    
    if (!user) {
      return c.json({ success: false, error: 'User not found' }, 404);
    }
    
    await db.update(notifications)
      .set({
        read: true,
        readAt: new Date(),
      })
      .where(eq(notifications.userId, user.id));
    
    return c.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to update notifications' }, 500);
  }
});
