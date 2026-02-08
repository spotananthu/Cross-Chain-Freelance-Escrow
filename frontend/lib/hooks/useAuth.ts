'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { authApi } from '../api/auth';
import type { User } from '../api/types';

export function useAuth() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if already authenticated on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('accordefi_token');
      const savedUser = localStorage.getItem('accordefi_user');
      if (token && savedUser) {
        try {
          setUser(JSON.parse(savedUser));
          setIsAuthenticated(true);
        } catch {
          // Invalid saved user
          localStorage.removeItem('accordefi_user');
        }
      }
    }
  }, []);

  // Clear auth when wallet disconnects
  useEffect(() => {
    if (!isConnected) {
      logout();
    }
  }, [isConnected]);

  const authenticate = useCallback(async () => {
    if (!address) {
      setError('No wallet connected');
      return false;
    }

    setLoading(true);
    setError(null);

    try {
      // Get nonce
      const nonceResponse = await authApi.getNonce(address, 'evm');
      if (nonceResponse.error || !nonceResponse.data) {
        setError(nonceResponse.error || 'Failed to get nonce');
        setLoading(false);
        return false;
      }

      const { nonce } = nonceResponse.data;

      // Sign message
      const signature = await signMessageAsync({ message: nonce });

      // Verify signature
      const verifyResponse = await authApi.verify(address, 'evm', nonce, signature);
      if (verifyResponse.error || !verifyResponse.data) {
        setError(verifyResponse.error || 'Failed to verify signature');
        setLoading(false);
        return false;
      }

      setUser(verifyResponse.data.user);
      setIsAuthenticated(true);
      
      // Save user to localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem('accordefi_user', JSON.stringify(verifyResponse.data.user));
      }

      setLoading(false);
      return true;
    } catch (err) {
      console.error('Auth error:', err);
      setError('Authentication failed');
      setLoading(false);
      return false;
    }
  }, [address, signMessageAsync]);

  const logout = useCallback(() => {
    authApi.logout();
    setUser(null);
    setIsAuthenticated(false);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('accordefi_user');
    }
  }, []);

  return {
    user,
    isAuthenticated,
    loading,
    error,
    authenticate,
    logout,
  };
}
