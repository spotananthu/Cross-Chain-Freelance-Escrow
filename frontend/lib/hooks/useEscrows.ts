'use client';

import { useState, useEffect, useCallback } from 'react';
import { escrowsApi, milestonesApi } from '../api';
import type { Escrow, Milestone } from '../api/types';

// Hook to fetch all escrows
export function useEscrows() {
  const [escrows, setEscrows] = useState<Escrow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEscrows = useCallback(async () => {
    setLoading(true);
    const response = await escrowsApi.getAll();
    if (response.error) {
      setError(response.error);
    } else {
      setEscrows(response.data || []);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchEscrows();
  }, [fetchEscrows]);

  return { escrows, loading, error, refetch: fetchEscrows };
}

// Hook to fetch escrows for a specific user with role separation
export function useUserEscrowsByRole(address: string | undefined) {
  const [asClient, setAsClient] = useState<Escrow[]>([]);
  const [asFreelancer, setAsFreelancer] = useState<Escrow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEscrows = useCallback(async () => {
    if (!address) {
      setAsClient([]);
      setAsFreelancer([]);
      setLoading(false);
      return;
    }
    
    setLoading(true);
    const response = await escrowsApi.getByUser(address);
    if (response.error) {
      setError(response.error);
    } else {
      const data = response.data as any;
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        setAsClient(Array.isArray(data.asClient) ? data.asClient : []);
        setAsFreelancer(Array.isArray(data.asFreelancer) ? data.asFreelancer : []);
      } else {
        setAsClient([]);
        setAsFreelancer([]);
      }
      setError(null);
    }
    setLoading(false);
  }, [address]);

  useEffect(() => {
    fetchEscrows();
  }, [fetchEscrows]);

  return { asClient, asFreelancer, loading, error, refetch: fetchEscrows };
}

// Hook to fetch escrows for a specific user (combined)
export function useUserEscrows(address: string | undefined) {
  const [escrows, setEscrows] = useState<Escrow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEscrows = useCallback(async () => {
    if (!address) {
      setEscrows([]);
      setLoading(false);
      return;
    }
    
    setLoading(true);
    const response = await escrowsApi.getByUser(address);
    if (response.error) {
      setError(response.error);
    } else {
      // API returns { asClient: [], asFreelancer: [] } - combine them
      const data = response.data as any;
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        const asClient = Array.isArray(data.asClient) ? data.asClient : [];
        const asFreelancer = Array.isArray(data.asFreelancer) ? data.asFreelancer : [];
        // Combine and deduplicate by id
        const combined = [...asClient, ...asFreelancer];
        const unique = combined.filter((escrow, index, self) => 
          index === self.findIndex(e => e.id === escrow.id)
        );
        setEscrows(unique);
      } else if (Array.isArray(data)) {
        setEscrows(data);
      } else {
        setEscrows([]);
      }
      setError(null);
    }
    setLoading(false);
  }, [address]);

  useEffect(() => {
    fetchEscrows();
  }, [fetchEscrows]);

  return { escrows, loading, error, refetch: fetchEscrows };
}

// Hook to fetch a single escrow
export function useEscrow(id: string | undefined) {
  const [escrow, setEscrow] = useState<Escrow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEscrow = useCallback(async () => {
    if (!id) {
      setEscrow(null);
      setLoading(false);
      return;
    }
    
    setLoading(true);
    const response = await escrowsApi.getById(id);
    if (response.error) {
      setError(response.error);
    } else {
      setEscrow(response.data || null);
      setError(null);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchEscrow();
  }, [fetchEscrow]);

  return { escrow, loading, error, refetch: fetchEscrow };
}

// Hook for escrow actions
export function useEscrowActions() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createEscrow = useCallback(async (data: Parameters<typeof escrowsApi.create>[0]) => {
    setLoading(true);
    setError(null);
    const response = await escrowsApi.create(data);
    setLoading(false);
    if (response.error) {
      setError(response.error);
      return null;
    }
    return response.data;
  }, []);

  const fundEscrow = useCallback(async (id: string, txHash: string, onChainId?: string) => {
    setLoading(true);
    setError(null);
    const response = await escrowsApi.fund(id, txHash, onChainId);
    setLoading(false);
    if (response.error) {
      setError(response.error);
      return null;
    }
    return response.data;
  }, []);

  return { createEscrow, fundEscrow, loading, error };
}

// Hook for milestone actions
export function useMilestoneActions() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitMilestone = useCallback(async (id: string, note: string) => {
    setLoading(true);
    setError(null);
    const response = await milestonesApi.submit(id, note);
    setLoading(false);
    if (response.error) {
      setError(response.error);
      return null;
    }
    return response.data;
  }, []);

  const approveMilestone = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    const response = await milestonesApi.approve(id);
    setLoading(false);
    if (response.error) {
      setError(response.error);
      return null;
    }
    return response.data;
  }, []);

  const releaseMilestone = useCallback(async (id: string, txHash?: string) => {
    setLoading(true);
    setError(null);
    const response = await milestonesApi.release(id, txHash);
    setLoading(false);
    if (response.error) {
      setError(response.error);
      return null;
    }
    return response.data;
  }, []);

  const disputeMilestone = useCallback(async (id: string, reason: string) => {
    setLoading(true);
    setError(null);
    const response = await milestonesApi.dispute(id, reason);
    setLoading(false);
    if (response.error) {
      setError(response.error);
      return null;
    }
    return response.data;
  }, []);

  return {
    submitMilestone,
    approveMilestone,
    releaseMilestone,
    disputeMilestone,
    loading,
    error,
  };
}
