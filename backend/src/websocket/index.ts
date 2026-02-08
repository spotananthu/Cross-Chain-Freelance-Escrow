import { Server as SocketServer, Socket } from 'socket.io';
import { db, users } from '../db';
import { eq, or } from 'drizzle-orm';

// Extended Socket.io Server type
export interface SocketManager extends SocketServer {
  emitToEscrow: (escrowId: number | string, event: string, data: unknown) => void;
  emitToUser: (userId: number | string, event: string, data: unknown) => void;
}

export function setupSocketHandlers(io: SocketServer): SocketManager {
  io.on('connection', (socket: Socket) => {
    console.log(`[WS] Client connected: ${socket.id}`);

    // Join user-specific room for notifications
    socket.on('join:user', async (address: string) => {
      try {
        const user = await db.query.users.findFirst({
          where: or(
            eq(users.evmAddress, address),
            eq(users.suiAddress, address)
          ),
        });

        if (user) {
          socket.join(`user:${user.id}`);
          console.log(`[WS] User ${address} joined room user:${user.id}`);
        }
      } catch (error) {
        console.error('[WS] Error joining user room:', error);
      }
    });

    // Join escrow-specific room for updates
    socket.on('join:escrow', (escrowId: string) => {
      socket.join(`escrow:${escrowId}`);
      console.log(`[WS] Client joined escrow room: ${escrowId}`);
    });

    // Leave rooms
    socket.on('leave:user', (userId: string) => {
      socket.leave(`user:${userId}`);
    });

    socket.on('leave:escrow', (escrowId: string) => {
      socket.leave(`escrow:${escrowId}`);
    });

    // Subscribe to bridge transfers
    socket.on('subscribe:bridge', () => {
      socket.join('bridge');
      console.log(`[WS] Client subscribed to bridge updates`);
    });

    socket.on('unsubscribe:bridge', () => {
      socket.leave('bridge');
    });

    // Disconnect
    socket.on('disconnect', () => {
      console.log(`[WS] Client disconnected: ${socket.id}`);
    });
  });

  // Add helper methods
  const socketManager = io as SocketManager;
  
  socketManager.emitToEscrow = (escrowId: number | string, event: string, data: unknown) => {
    io.to(`escrow:${escrowId}`).emit(event, data);
  };

  socketManager.emitToUser = (userId: number | string, event: string, data: unknown) => {
    io.to(`user:${userId}`).emit(event, data);
  };

  return socketManager;
}
