import { Hono } from 'hono';
import { z } from 'zod';
import { db, users } from '../db';
import { eq, or } from 'drizzle-orm';
import { generateToken, verifySignature } from '../middleware/auth';

const authRoutes = new Hono();

const nonceSchema = z.object({
  address: z.string().min(1),
  chain: z.enum(['evm', 'sui']),
});

const verifySchema = z.object({
  address: z.string().min(1),
  chain: z.enum(['evm', 'sui']),
  message: z.string().min(1),
  signature: z.string().min(1),
});

// Generate nonce for signing
authRoutes.post('/nonce', async (c) => {
  try {
    // Get raw text first to debug
    const rawBody = await c.req.text();
    console.log('Raw body received:', rawBody);
    
    if (!rawBody || rawBody.trim() === '') {
      return c.json({ error: 'Empty request body' }, 400);
    }
    
    let body;
    try {
      body = JSON.parse(rawBody);
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      return c.json({ error: 'Invalid JSON', received: rawBody.substring(0, 100) }, 400);
    }
    
    const parsed = nonceSchema.safeParse(body);
    
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.errors }, 400);
    }
    
    const { address, chain } = parsed.data;

    // Generate unique nonce
    const nonce = `Sign this message to authenticate with AccorDefi.\n\nAddress: ${address}\nChain: ${chain}\nNonce: ${crypto.randomUUID()}\nTimestamp: ${new Date().toISOString()}`;

    return c.json({
      nonce,
      expiresIn: 300, // 5 minutes
    });
  } catch (error) {
    console.error('Nonce error:', error);
    return c.json({ error: 'Failed to generate nonce' }, 500);
  }
});

// Verify signature and issue JWT
authRoutes.post('/verify', async (c) => {
  try {
    const body = await c.req.json();
    const parsed = verifySchema.safeParse(body);
    
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.errors }, 400);
    }
    
    const { address, chain, message, signature } = parsed.data;

    // Verify signature
    const isValid = await verifySignature(message, signature, address, chain);

    if (!isValid) {
      return c.json({ error: 'Invalid signature' }, 401);
    }

    // Find user by EVM or Sui address
    const whereClause = chain === 'evm' 
      ? eq(users.evmAddress, address)
      : eq(users.suiAddress, address);

    let user = await db.query.users.findFirst({
      where: whereClause,
    });

    if (!user) {
      const [newUser] = await db.insert(users)
        .values({
          id: crypto.randomUUID(),
          evmAddress: chain === 'evm' ? address : null,
          suiAddress: chain === 'sui' ? address : null,
        })
        .returning();
      user = newUser;
    }

    // Generate JWT
    const token = await generateToken({ address, chain });

    return c.json({
      token,
      user: {
        id: user.id,
        evmAddress: user.evmAddress,
        suiAddress: user.suiAddress,
        displayName: user.displayName,
        ensName: user.ensName,
      },
    });
  } catch (error) {
    console.error('Verify error:', error);
    return c.json({ error: 'Failed to verify signature' }, 500);
  }
});

// Logout (client-side, just for completeness)
authRoutes.post('/logout', async (c) => {
  // JWT is stateless, logout is handled client-side
  return c.json({ success: true });
});

export { authRoutes };
