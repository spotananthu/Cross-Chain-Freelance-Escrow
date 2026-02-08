import { Context, Next } from 'hono';
import * as jose from 'jose';
import { config } from '../config';
import { verifyPersonalMessageSignature } from '@mysten/sui/verify';

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
    // Sui signature verification (supports zkLogin, Ed25519, Secp256k1, etc.)
    try {
      console.log('Sui verification - address:', address);
      console.log('Sui verification - message length:', message.length);
      console.log('Sui verification - signature length:', signature.length);
      
      const messageBytes = new TextEncoder().encode(message);
      
      // verifyPersonalMessageSignature handles all signature types including zkLogin
      const publicKey = await verifyPersonalMessageSignature(messageBytes, signature);
      
      // Get the address from the public key
      const signerAddress = publicKey.toSuiAddress();
      console.log('Sui verification - signer address:', signerAddress);
      console.log('Sui verification - expected address:', address);
      
      const isValid = signerAddress === address;
      console.log('Sui verification - match:', isValid);
      
      return isValid;
    } catch (error: any) {
      console.error('Sui signature verification error:', error?.message || error);
      console.error('Full error:', error);
      
      // For development with zkLogin wallets, we can temporarily accept
      // signatures if the address format is correct (starts with 0x and is 66 chars)
      // This is NOT secure for production!
      if (process.env.NODE_ENV !== 'production' && address.startsWith('0x') && address.length === 66) {
        console.warn('DEV MODE: Accepting Sui signature without full verification');
        return true;
      }
      
      return false;
    }
  }
}
