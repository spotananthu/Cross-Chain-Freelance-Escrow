'use client';

import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_BASE_URL } from '../api/client';

type EventCallback = (data: unknown) => void;

// Hook for WebSocket connection
export function useSocket() {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // Connect to WebSocket server
    socketRef.current = io(API_BASE_URL, {
      transports: ['websocket', 'polling'],
    });

    socketRef.current.on('connect', () => {
      console.log('[WS] Connected to server');
    });

    socketRef.current.on('disconnect', () => {
      console.log('[WS] Disconnected from server');
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  // Join user room for notifications
  const joinUserRoom = useCallback((address: string) => {
    socketRef.current?.emit('join:user', address);
  }, []);

  // Join escrow room for updates
  const joinEscrowRoom = useCallback((escrowId: string) => {
    socketRef.current?.emit('join:escrow', escrowId);
  }, []);

  // Leave escrow room
  const leaveEscrowRoom = useCallback((escrowId: string) => {
    socketRef.current?.emit('leave:escrow', escrowId);
  }, []);

  // Subscribe to bridge updates
  const subscribeBridge = useCallback(() => {
    socketRef.current?.emit('subscribe:bridge');
  }, []);

  // Listen for events
  const on = useCallback((event: string, callback: EventCallback) => {
    socketRef.current?.on(event, callback);
    return () => {
      socketRef.current?.off(event, callback);
    };
  }, []);

  return {
    socket: socketRef.current,
    joinUserRoom,
    joinEscrowRoom,
    leaveEscrowRoom,
    subscribeBridge,
    on,
  };
}

// Hook for escrow-specific WebSocket events
export function useEscrowSocket(escrowId: string | undefined, callbacks?: {
  onMilestoneSubmitted?: (data: unknown) => void;
  onMilestoneApproved?: (data: unknown) => void;
  onMilestoneReleased?: (data: unknown) => void;
  onDisputeCreated?: (data: unknown) => void;
  onDisputeResolved?: (data: unknown) => void;
}) {
  const { joinEscrowRoom, leaveEscrowRoom, on } = useSocket();

  useEffect(() => {
    if (!escrowId) return;

    joinEscrowRoom(escrowId);

    const cleanups: (() => void)[] = [];

    if (callbacks?.onMilestoneSubmitted) {
      cleanups.push(on('milestone:submitted', callbacks.onMilestoneSubmitted));
    }
    if (callbacks?.onMilestoneApproved) {
      cleanups.push(on('milestone:approved', callbacks.onMilestoneApproved));
    }
    if (callbacks?.onMilestoneReleased) {
      cleanups.push(on('milestone:released', callbacks.onMilestoneReleased));
    }
    if (callbacks?.onDisputeCreated) {
      cleanups.push(on('dispute:created', callbacks.onDisputeCreated));
    }
    if (callbacks?.onDisputeResolved) {
      cleanups.push(on('dispute:resolved', callbacks.onDisputeResolved));
    }

    return () => {
      leaveEscrowRoom(escrowId);
      cleanups.forEach(cleanup => cleanup());
    };
  }, [escrowId, joinEscrowRoom, leaveEscrowRoom, on, callbacks]);
}
