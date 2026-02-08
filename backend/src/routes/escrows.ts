import { Hono } from 'hono';
import { z } from 'zod';
import { db, escrows, milestones, users } from '../db';
import { eq, desc, and, or } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { releaseManager, generateSecretPair, verifySecret } from '../integrations/fusion-plus';
import { yellowNetwork } from '../integrations/yellow-network';

export const escrowRoutes = new Hono();

// Validation schemas - flexible to accept both string and number amounts
const createEscrowSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  chain: z.enum(['evm', 'sui']).default('evm'),
  clientAddress: z.string(),
  freelancerAddress: z.string().optional(),
  totalAmount: z.union([z.number().positive(), z.string()]).transform(val => 
    typeof val === 'string' ? parseFloat(val) : val
  ),
  tokenSymbol: z.string().default('USDC'),
  currency: z.string().optional(), // alias for tokenSymbol
  isCrossChain: z.boolean().default(false),
  suiRecipient: z.string().optional(),
  milestones: z.array(z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    amount: z.union([z.number().positive(), z.string()]).transform(val => 
      typeof val === 'string' ? parseFloat(val) : val
    ),
    order: z.number().optional(),
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
    
    // Transform to include addresses directly for frontend
    const result = {
      ...escrow,
      clientAddress: escrow.client?.evmAddress || escrow.client?.suiAddress || '',
      freelancerAddress: escrow.freelancer?.evmAddress || escrow.freelancer?.suiAddress || escrow.suiRecipient || '',
      currency: escrow.tokenSymbol,
    };
    
    return c.json({ success: true, data: result });
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
      description: validated.description || '',
      totalAmount: validated.totalAmount,
      tokenSymbol: validated.currency || validated.tokenSymbol,
      isCrossChain: validated.isCrossChain,
      suiRecipient: validated.suiRecipient || validated.freelancerAddress,
      status: 'pending',
    });
    
    // Create milestones
    for (let i = 0; i < validated.milestones.length; i++) {
      const m = validated.milestones[i];
      await db.insert(milestones).values({
        id: randomUUID(),
        escrowId: escrowId,
        onChainId: m.order ?? i,
        description: m.description || m.title || `Milestone ${i + 1}`,
        amount: m.amount,
        deadline: m.deadline ? new Date(m.deadline) : null,
        status: 'pending',
      });
    }
    
    const created = await db.query.escrows.findFirst({
      where: eq(escrows.id, escrowId),
      with: { milestones: true, client: true, freelancer: true },
    });
    
    // Transform to include addresses directly for frontend
    const result = created ? {
      ...created,
      clientAddress: created.client?.evmAddress || created.client?.suiAddress || validated.clientAddress,
      freelancerAddress: created.freelancer?.evmAddress || created.freelancer?.suiAddress || validated.freelancerAddress || '',
      currency: created.tokenSymbol,
    } : null;
    
    return c.json({ success: true, data: result }, 201);
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
    
    // Get escrows where user is client
    let asClient: any[] = [];
    if (user) {
      asClient = await db.query.escrows.findMany({
        where: eq(escrows.clientId, user.id),
        with: { milestones: true, client: true, freelancer: true },
      });
    }
    
    // Get escrows where user is freelancer (by freelancerId OR suiRecipient address)
    let asFreelancer: any[] = [];
    if (user) {
      asFreelancer = await db.query.escrows.findMany({
        where: eq(escrows.freelancerId, user.id),
        with: { milestones: true, client: true, freelancer: true },
      });
    }
    
    // Also check suiRecipient for cross-chain escrows where freelancer is Sui address
    const bySuiRecipient = await db.query.escrows.findMany({
      where: eq(escrows.suiRecipient, address),
      with: { milestones: true, client: true, freelancer: true },
    });
    
    // Merge and deduplicate freelancer escrows
    const freelancerIds = new Set(asFreelancer.map(e => e.id));
    for (const escrow of bySuiRecipient) {
      if (!freelancerIds.has(escrow.id)) {
        asFreelancer.push(escrow);
      }
    }
    
    // Transform results to include addresses
    const transformEscrow = (escrow: any) => ({
      ...escrow,
      clientAddress: escrow.client?.evmAddress || escrow.client?.suiAddress || '',
      freelancerAddress: escrow.freelancer?.evmAddress || escrow.freelancer?.suiAddress || escrow.suiRecipient || '',
      currency: escrow.tokenSymbol,
    });
    
    return c.json({
      success: true,
      data: { 
        asClient: asClient.map(transformEscrow), 
        asFreelancer: asFreelancer.map(transformEscrow) 
      },
    });
  } catch (error) {
    console.error('Error fetching user escrows:', error);
    return c.json({ success: false, error: 'Failed to fetch user escrows' }, 500);
  }
});
// ============ CROSS-CHAIN RELEASE ENDPOINTS ============

/**
 * POST /api/escrows/:id/milestones/:milestoneId/initiate-release
 * 
 * STEP 1: Client initiates release
 * - Generates secret/hash pair
 * - Creates Yellow Network session
 * - Returns secretHash for Sui contract
 */
escrowRoutes.post('/:id/milestones/:milestoneId/initiate-release', async (c) => {
  const { id: escrowId, milestoneId } = c.req.param();
  
  try {
    // Verify escrow and milestone exist
    const escrow = await db.query.escrows.findFirst({
      where: eq(escrows.id, escrowId),
      with: { milestones: true },
    });
    
    if (!escrow) {
      return c.json({ success: false, error: 'Escrow not found' }, 404);
    }
    
    const milestone = escrow.milestones.find(m => m.id === milestoneId);
    if (!milestone) {
      return c.json({ success: false, error: 'Milestone not found' }, 404);
    }
    
    if (milestone.status !== 'approved') {
      return c.json({ success: false, error: 'Milestone must be approved before release' }, 400);
    }
    
    // Generate secret pair for HTLC
    const { secretHash, releaseId } = await releaseManager.initiateRelease(escrowId, milestoneId);
    
    // Create Yellow Network session for handshake
    yellowNetwork.createSession(escrowId, milestoneId);
    
    console.log('[Release] Initiated cross-chain release:', {
      escrowId,
      milestoneId,
      releaseId,
      secretHash,
    });
    
    return c.json({
      success: true,
      data: {
        releaseId,
        secretHash,
        message: 'Release initiated. Secret hash ready for Sui contract.',
        nextStep: 'Sign approval with Yellow Network, then create Fusion+ order',
      },
    });
  } catch (error) {
    console.error('Error initiating release:', error);
    return c.json({ success: false, error: 'Failed to initiate release' }, 500);
  }
});

/**
 * POST /api/escrows/:id/milestones/:milestoneId/complete-release
 * 
 * STEP 2: Complete the release (demo mode - skips actual cross-chain)
 * - Updates milestone status to 'released'
 * - Returns secret for freelancer to claim on Sui
 */
escrowRoutes.post('/:id/milestones/:milestoneId/complete-release', async (c) => {
  const { id: escrowId, milestoneId } = c.req.param();
  
  try {
    const body = await c.req.json().catch(() => ({}));
    const { releaseId } = body;
    
    // Get the secret for this release
    const secret = releaseId ? releaseManager.getSecret(releaseId) : null;
    
    // Update milestone status to released
    await db.update(milestones)
      .set({
        status: 'released',
        updatedAt: new Date(),
      })
      .where(eq(milestones.id, milestoneId));
    
    // Check if all milestones are released
    const escrow = await db.query.escrows.findFirst({
      where: eq(escrows.id, escrowId),
      with: { milestones: true },
    });
    
    if (escrow) {
      const allReleased = escrow.milestones.every(m => 
        m.id === milestoneId || m.status === 'released'
      );
      
      if (allReleased) {
        await db.update(escrows)
          .set({
            status: 'completed',
            updatedAt: new Date(),
          })
          .where(eq(escrows.id, escrowId));
      }
    }
    
    // Mark release as complete
    if (releaseId) {
      releaseManager.completeRelease(releaseId);
      yellowNetwork.completeSession(escrowId, milestoneId);
    }
    
    console.log('[Release] Completed:', { escrowId, milestoneId });
    
    return c.json({
      success: true,
      data: {
        message: 'Payment released successfully!',
        secret: secret || 'Demo mode - secret not generated',
        suiClaimInstructions: secret ? 
          `Freelancer can claim on Sui by calling release_funds with secret: ${secret}` :
          'In demo mode, funds are marked as released in the database',
      },
    });
  } catch (error) {
    console.error('Error completing release:', error);
    return c.json({ success: false, error: 'Failed to complete release' }, 500);
  }
});

/**
 * POST /api/escrows/:id/milestones/:milestoneId/release
 * 
 * SIMPLIFIED RELEASE - Demo mode that combines all steps
 * Used by the frontend "Release Payment" button
 */
escrowRoutes.post('/:id/milestones/:milestoneId/release', async (c) => {
  const { id: escrowId, milestoneId } = c.req.param();
  
  try {
    // Verify escrow and milestone exist
    const escrow = await db.query.escrows.findFirst({
      where: eq(escrows.id, escrowId),
      with: { milestones: true },
    });
    
    if (!escrow) {
      return c.json({ success: false, error: 'Escrow not found' }, 404);
    }
    
    const milestone = escrow.milestones.find(m => m.id === milestoneId);
    if (!milestone) {
      return c.json({ success: false, error: 'Milestone not found' }, 404);
    }
    
    if (milestone.status !== 'approved') {
      return c.json({ success: false, error: 'Milestone must be approved before release' }, 400);
    }
    
    // For demo: Generate secret pair
    const secretPair = generateSecretPair();
    
    console.log('[Release] Demo mode release:', {
      escrowId,
      milestoneId,
      secretHash: secretPair.secretHashHex,
      suiRecipient: escrow.suiRecipient,
    });
    
    // Update milestone status to released
    await db.update(milestones)
      .set({
        status: 'released',
        updatedAt: new Date(),
      })
      .where(eq(milestones.id, milestoneId));
    
    // Check if all milestones are released
    const allReleased = escrow.milestones.every(m => 
      m.id === milestoneId || m.status === 'released'
    );
    
    if (allReleased) {
      await db.update(escrows)
        .set({
          status: 'completed',
          updatedAt: new Date(),
        })
        .where(eq(escrows.id, escrowId));
    }
    
    return c.json({
      success: true,
      data: {
        message: 'Payment released successfully!',
        crossChainDetails: {
          secretHash: secretPair.secretHashHex,
          secret: secretPair.secretHex,
          suiRecipient: escrow.suiRecipient,
          amount: milestone.amount,
          status: 'RELEASED',
          note: 'In production, this would trigger 1inch Fusion+ cross-chain swap',
        },
      },
    });
  } catch (error) {
    console.error('Error releasing payment:', error);
    return c.json({ success: false, error: 'Failed to release payment' }, 500);
  }
});