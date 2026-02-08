import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3002'),
  
  // Database
  DATABASE_URL: z.string().default('file:./data/accordefi.db'),
  
  // CORS
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  
  // EVM Configuration
  EVM_RPC_URL: z.string().default('http://localhost:8545'),
  EVM_CHAIN_ID: z.string().default('31337'),
  EVM_ESCROW_ADDRESS: z.string().optional(),
  EVM_BRIDGE_ADDRESS: z.string().optional(),
  EVM_PRIVATE_KEY: z.string().optional(),
  
  // Sui Configuration
  SUI_RPC_URL: z.string().default('https://fullnode.testnet.sui.io:443'),
  SUI_PACKAGE_ID: z.string().optional(),
  SUI_ESCROW_ID: z.string().optional(),
  SUI_PRIVATE_KEY: z.string().optional(),
  
  // Redis (optional, for production)
  REDIS_URL: z.string().optional(),
  
  // JWT Secret
  JWT_SECRET: z.string().default('accordefi-dev-secret-change-in-production'),
});

const env = envSchema.parse(process.env);

export const config = {
  nodeEnv: env.NODE_ENV,
  port: parseInt(env.PORT),
  
  database: {
    url: env.DATABASE_URL,
  },
  
  corsOrigins: env.CORS_ORIGINS.split(','),
  
  evm: {
    rpcUrl: env.EVM_RPC_URL,
    chainId: parseInt(env.EVM_CHAIN_ID),
    escrowAddress: env.EVM_ESCROW_ADDRESS,
    bridgeAddress: env.EVM_BRIDGE_ADDRESS,
    privateKey: env.EVM_PRIVATE_KEY,
  },
  
  sui: {
    rpcUrl: env.SUI_RPC_URL,
    packageId: env.SUI_PACKAGE_ID,
    escrowId: env.SUI_ESCROW_ID,
    privateKey: env.SUI_PRIVATE_KEY,
  },
  
  redis: {
    url: env.REDIS_URL,
  },
  
  jwt: {
    secret: env.JWT_SECRET,
  },
};

export type Config = typeof config;
