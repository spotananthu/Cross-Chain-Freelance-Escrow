// API service functions for escrows

import { api } from './client';
import type { Escrow, CreateEscrowRequest, Milestone } from './types';

export const escrowsApi = {
  // Get all escrows
  async getAll() {
    return api.get<Escrow[]>('/api/escrows');
  },

  // Get escrow by ID
  async getById(id: string) {
    return api.get<Escrow>(`/api/escrows/${id}`);
  },

  // Get escrows for a user
  async getByUser(address: string) {
    return api.get<Escrow[]>(`/api/escrows/user/${address}`);
  },

  // Create new escrow
  async create(data: CreateEscrowRequest) {
    return api.post<Escrow>('/api/escrows', data);
  },

  // Update escrow status after funding
  async fund(id: string, txHash: string, onChainId?: string) {
    return api.post<Escrow>(`/api/escrows/${id}/fund`, { txHash, onChainId });
  },

  // Cancel escrow
  async cancel(id: string) {
    return api.patch<Escrow>(`/api/escrows/${id}`, { status: 'cancelled' });
  },
};

export const milestonesApi = {
  // Get milestone by ID
  async getById(id: string) {
    return api.get<Milestone>(`/api/milestones/${id}`);
  },

  // Submit milestone work
  async submit(id: string, note: string) {
    return api.post<Milestone>(`/api/milestones/${id}/submit`, { submissionNote: note });
  },

  // Approve milestone
  async approve(id: string) {
    return api.post<Milestone>(`/api/milestones/${id}/approve`);
  },

  // Release milestone payment (cross-chain)
  async release(id: string, txHash?: string) {
    return api.post<{ 
      milestoneId: string; 
      amount: number;
      suiRecipient?: string;
      bridge?: {
        success: boolean;
        suiTxDigest?: string;
        error?: string;
        amountSui: string;
      };
      crossChain: { 
        secretHash: string; 
        secret: string; 
        note: string; 
      } 
    }>(`/api/milestones/${id}/release`, { txHash });
  },

  // Dispute milestone
  async dispute(id: string, reason: string) {
    return api.post<Milestone>(`/api/milestones/${id}/dispute`, { reason });
  },
};
