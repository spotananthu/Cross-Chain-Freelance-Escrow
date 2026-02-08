// Auth API functions

import { api } from './client';
import type { AuthResponse } from './types';

export const authApi = {
  // Get nonce for signing
  async getNonce(address: string, chain: 'evm' | 'sui') {
    return api.post<{ nonce: string; expiresIn: number }>('/api/auth/nonce', {
      address,
      chain,
    });
  },

  // Verify signature and get JWT
  async verify(address: string, chain: 'evm' | 'sui', message: string, signature: string) {
    const response = await api.post<AuthResponse>('/api/auth/verify', {
      address,
      chain,
      message,
      signature,
    });

    if (response.data?.token) {
      api.setToken(response.data.token);
    }

    return response;
  },

  // Logout
  logout() {
    api.clearToken();
  },
};
