import { Hono } from 'hono';
import { z } from 'zod';
import { db, escrows, milestones, users } from '../db';
import { eq, desc, and, or } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export const escrowRoutes = new Hono();

// Validation schemas
const createEscrowSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  chain: z.enum(['evm', 'sui']),
  clientAddress: z.string(),
  freelancerAddress: z.string().optional(),
  totalAmount: z.number().positive(),
  tokenSymbol: z.string().default('ETH'),
  isCrossChain: z.boolean().default(false),
  suiRecipient: z.string().optional(),
  milestones: z.array(z.object({
    description: z.string(),
    amount: z.number().positive(),
    deadline: z.string().datetime().optional(),
  })).min(1),
});

// GET /api/escrows - List all escrows (with filters)
escrowRoutes.get('/', async (c) => {
  const { status, chain, client, freelancer } = c.req.query();
  
  try {
    let query = db.select().from(escrows).orderBy(desc(escrows.createdAt));
    
    // Apply filters if provided
    const conditions = [];
    if (status) conditions.push(eq(escrows.status, status as any));
    if (chain) conditions.push(eq(escrows.chain, chain as any));
    
    const result = await query;
    
    return c.json({
      success: true,
      data: result,
      count: result.length,
    });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch escrows' }, 500);
  }
});

// GET /api/escrows/:id - Get escrow by ID
escrowRoutes.get('/:id', async (c) => {
  const { id } = c.req.param();
  
  try {
    const escrow = await db.query.escrows.findFirst({
      where: eq(escrows.id, id),
      with: {
        milestones: true,
        client: true,
        freelancer: true,
        disputes: true,
      },
    });
    
    if (!escrow) {
      return c.json({ success: false, error: 'Escrow not found' }, 404);
    }
    
    return c.json({ success: true, data: escrow });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch escrow' }, 500);
  }
});

// POST /api/escrows - Create new escrow
escrowRoutes.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const validated = createEscrowSchema.parse(body);
    
    const escrowId = randomUUID();
    
    // Create or get client user
    let client = await db.query.users.findFirst({
      where: or(
        eq(users.evmAddress, validated.clientAddress),
        eq(users.suiAddress, validated.clientAddress)
      ),
    });
    
    let clientId = client?.id;
    
    if (!clientId) {
      clientId = randomUUID();
      await db.insert(users).values({
        id: clientId,
        [validated.chain === 'evm' ? 'evmAddress' : 'suiAddress']: validated.clientAddress,
        role: 'client',
      });
    }
    
    // Create escrow
    await db.insert(escrows).values({
      id: escrowId,
      chain: validated.chain,
      clientId,
      title: validated.title,
      description: validated.description,
      totalAmount: validated.totalAmount,
      tokenSymbol: validated.tokenSymbol,
      isCrossChain: validated.isCrossChain,
      suiRecipient: validated.suiRecipient,
      status: 'pending',
    });
    
    // Create milestones
    for (let i = 0; i < validated.milestones.length; i++) {
      const m = validated.milestones[i];
      await db.insert(milestones).values({
        id: randomUUID(),
        escrowId: escrowId,
        onChainId: i,
        description: m.description,
        amount: m.amount,
        deadline: m.deadline ? new Date(m.deadline) : undefined,
        status: 'pending',
      });
    }
    
    const created = await db.query.escrows.findFirst({
      where: eq(escrows.id, escrowId),
      with: { milestones: true },
    });
    
    return c.json({ success: true, data: created }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ success: false, error: 'Validation failed', details: error.errors }, 400);
    }
    console.error(error);
    return c.json({ success: false, error: 'Failed to create escrow' }, 500);
  }
});

// PATCH /api/escrows/:id - Update escrow (e.g., after on-chain confirmation)
escrowRoutes.patch('/:id', async (c) => {
  const { id } = c.req.param();
  
  try {
    const body = await c.req.json();
    
    await db.update(escrows)
      .set({
        ...body,
        updatedAt: new Date(),
      })
      .where(eq(escrows.id, id));
    
    const updated = await db.query.escrows.findFirst({
      where: eq(escrows.id, id),
    });
    
    return c.json({ success: true, data: updated });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to update escrow' }, 500);
  }
});

// POST /api/escrows/:id/fund - Mark escrow as funded
escrowRoutes.post('/:id/fund', async (c) => {
  const { id } = c.req.param();
  
  try {
    const body = await c.req.json();
    const { txHash, onChainId } = body;
    
    await db.update(escrows)
      .set({
        status: 'active',
        txHash,
        onChainId,
        updatedAt: new Date(),
      })
      .where(eq(escrows.id, id));
    
    return c.json({ success: true, message: 'Escrow funded' });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fund escrow' }, 500);
  }
});

// GET /api/escrows/user/:address - Get escrows for a user
escrowRoutes.get('/user/:address', async (c) => {
  const { address } = c.req.param();
  
  try {
    // Find user by address
    const user = await db.query.users.findFirst({
      where: or(
        eq(users.evmAddress, address),
        eq(users.suiAddress, address)
      ),
    });
    
    if (!user) {
      return c.json({ success: true, data: { asClient: [], asFreelancer: [] } });
    }
    
    const asClient = await db.query.escrows.findMany({
      where: eq(escrows.clientId, user.id),
      with: { milestones: true },
    });
    
    const asFreelancer = await db.query.escrows.findMany({
      where: eq(escrows.freelancerId, user.id),
      with: { milestones: true },
    });
    
    return c.json({
      success: true,
      data: { asClient, asFreelancer },
    });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch user escrows' }, 500);
  }
});
