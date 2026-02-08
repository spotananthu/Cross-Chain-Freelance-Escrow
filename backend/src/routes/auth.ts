import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
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
authRoutes.post('/nonce', zValidator('json', nonceSchema), async (c) => {
  const { address, chain } = c.req.valid('json');

  // Generate unique nonce
  const nonce = `Sign this message to authenticate with AccorDefi.\n\nAddress: ${address}\nChain: ${chain}\nNonce: ${crypto.randomUUID()}\nTimestamp: ${new Date().toISOString()}`;

  // Store nonce temporarily (in production, use Redis with TTL)
  // For now, we include timestamp in the message itself

  return c.json({
    nonce,
    expiresIn: 300, // 5 minutes
  });
});

// Verify signature and issue JWT
authRoutes.post('/verify', zValidator('json', verifySchema), async (c) => {
  const { address, chain, message, signature } = c.req.valid('json');

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
});

// Logout (client-side, just for completeness)
authRoutes.post('/logout', async (c) => {
  // JWT is stateless, logout is handled client-side
  return c.json({ success: true });
});

export { authRoutes };
