import { Context, Next } from 'hono';
import * as jose from 'jose';
import { config } from '../config';

export interface AuthPayload {
  address: string;
  chain: 'evm' | 'sui';
  iat: number;
  exp: number;
}

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing authorization header' }, 401);
  }

  const token = authHeader.substring(7);

  try {
    const secret = new TextEncoder().encode(config.jwt.secret);
    const { payload } = await jose.jwtVerify(token, secret);
    
    c.set('auth', payload as unknown as AuthPayload);
    await next();
  } catch (error) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }
}

export async function generateToken(payload: Omit<AuthPayload, 'iat' | 'exp'>): Promise<string> {
  const secret = new TextEncoder().encode(config.jwt.secret);
  
  const token = await new jose.SignJWT(payload as unknown as jose.JWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret);

  return token;
}

export async function verifySignature(
  message: string,
  signature: string,
  address: string,
  chain: 'evm' | 'sui'
): Promise<boolean> {
  if (chain === 'evm') {
    const { verifyMessage } = await import('viem');
    try {
      const isValid = await verifyMessage({
        address: address as `0x${string}`,
        message,
        signature: signature as `0x${string}`,
      });
      return isValid;
    } catch {
      return false;
    }
  } else {
    // Sui signature verification
    // For now, we'll do basic validation
    // In production, use @mysten/sui for proper verification
    return signature.length > 0 && address.startsWith('0x');
  }
}
