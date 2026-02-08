'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { useCurrentAccount, useSignPersonalMessage } from '@mysten/dapp-kit';
import { authApi } from '@/lib/api/auth';
import type { User } from '@/lib/api/types';

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isAuthenticating: boolean;
  isInitialized: boolean;
  error: string | null;
  walletType: 'evm' | 'sui' | null;
  authenticate: () => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // EVM wallet
  const { address: evmAddress, status: evmStatus } = useAccount();
  const { signMessageAsync: signEvmMessage } = useSignMessage();
  
  // Sui wallet
  const suiAccount = useCurrentAccount();
  const { mutateAsync: signSuiMessage } = useSignPersonalMessage();
  
  // Start with null/false - will be populated from localStorage after mount
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [walletType, setWalletType] = useState<'evm' | 'sui' | null>(null);
  
  // Track if user explicitly disconnected wallet
  const hasDisconnected = useRef(false);

  // Determine connected address and type
  const connectedAddress = evmAddress || suiAccount?.address;
  const connectedType: 'evm' | 'sui' | null = evmAddress ? 'evm' : suiAccount?.address ? 'sui' : null;

  // Load auth from localStorage and validate wallet - single effect to avoid race conditions
  // Load auth state from localStorage
  useEffect(() => {
    // Wait for wallet connections to stabilize
    if (evmStatus === 'connecting' || evmStatus === 'reconnecting') {
      return;
    }

    const token = localStorage.getItem('accordefi_token');
    const savedUser = localStorage.getItem('accordefi_user');
    const savedWalletType = localStorage.getItem('accordefi_wallet_type') as 'evm' | 'sui' | null;
    
    if (token && savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        const savedAddress = parsed.evmAddress || parsed.walletAddress || parsed.suiAddress;
        
        // Check if connected wallet matches saved session
        if (connectedAddress && savedAddress) {
          const addressMatch = connectedType === 'evm' 
            ? savedAddress.toLowerCase() === connectedAddress.toLowerCase()
            : savedAddress === connectedAddress;
            
          if (addressMatch) {
            setUser(parsed);
            setIsAuthenticated(true);
            setWalletType(savedWalletType);
          } else {
            // Different wallet connected - clear auth
            console.log('Wallet mismatch, clearing auth');
            localStorage.removeItem('accordefi_token');
            localStorage.removeItem('accordefi_user');
            localStorage.removeItem('accordefi_wallet_type');
            setUser(null);
            setIsAuthenticated(false);
            setWalletType(null);
          }
        } else if (!connectedAddress && hasDisconnected.current) {
          // Wallet disconnected - clear auth
          localStorage.removeItem('accordefi_token');
          localStorage.removeItem('accordefi_user');
          localStorage.removeItem('accordefi_wallet_type');
          setUser(null);
          setIsAuthenticated(false);
          setWalletType(null);
        } else if (!connectedAddress) {
          // Keep auth while waiting for reconnect
          setUser(parsed);
          setIsAuthenticated(true);
          setWalletType(savedWalletType);
        }
      } catch {
        localStorage.removeItem('accordefi_user');
        setUser(null);
        setIsAuthenticated(false);
      }
    } else {
      setUser(null);
      setIsAuthenticated(false);
    }
    
    setIsInitialized(true);
  }, [connectedAddress, connectedType, evmStatus]);

  // Track when wallet was previously connected
  useEffect(() => {
    if (connectedAddress) {
      hasDisconnected.current = true;
    }
  }, [connectedAddress]);

  const authenticate = useCallback(async (): Promise<boolean> => {
    if (!connectedAddress || !connectedType) {
      setError('No wallet connected');
      return false;
    }

    setIsAuthenticating(true);
    setError(null);

    try {
      // Get nonce
      const nonceResponse = await authApi.getNonce(connectedAddress, connectedType);
      if (nonceResponse.error || !nonceResponse.data) {
        setError(nonceResponse.error || 'Failed to get nonce');
        setIsAuthenticating(false);
        return false;
      }

      const { nonce } = nonceResponse.data;
      let signature: string;

      // Sign message based on wallet type
      if (connectedType === 'evm') {
        signature = await signEvmMessage({ message: nonce });
      } else {
        // Sui wallet signing
        const messageBytes = new TextEncoder().encode(nonce);
        const result = await signSuiMessage({ message: messageBytes });
        signature = result.signature;
      }

      // Verify signature with backend
      const verifyResponse = await authApi.verify(connectedAddress, connectedType, nonce, signature);
      if (verifyResponse.error || !verifyResponse.data) {
        setError(verifyResponse.error || 'Failed to verify signature');
        setIsAuthenticating(false);
        return false;
      }

      const authenticatedUser = verifyResponse.data.user;
      setUser(authenticatedUser);
      setIsAuthenticated(true);
      setWalletType(connectedType);
      hasDisconnected.current = true;
      
      // Save to localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem('accordefi_user', JSON.stringify(authenticatedUser));
        localStorage.setItem('accordefi_wallet_type', connectedType);
      }

      setIsAuthenticating(false);
      return true;
    } catch (err) {
      console.error('Auth error:', err);
      setError(err instanceof Error ? err.message : 'Authentication failed');
      setIsAuthenticating(false);
      return false;
    }
  }, [connectedAddress, connectedType, signEvmMessage, signSuiMessage]);

  const logout = useCallback(() => {
    authApi.logout();
    setUser(null);
    setIsAuthenticated(false);
    setWalletType(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('accordefi_user');
      localStorage.removeItem('accordefi_wallet_type');
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isAuthenticating,
        isInitialized,
        error,
        walletType,
        authenticate,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
