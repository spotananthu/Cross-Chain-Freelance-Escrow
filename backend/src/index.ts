import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { Server as SocketServer } from 'socket.io';
import { createServer } from 'http';

import { authRoutes } from './routes/auth';
import { escrowRoutes } from './routes/escrows';
import { milestoneRoutes } from './routes/milestones';
import { userRoutes } from './routes/users';
import { bridgeRoutes } from './routes/bridge';
import { disputeRoutes } from './routes/disputes';
import { healthRoutes } from './routes/health';
import { setupSocketHandlers, SocketManager } from './websocket';
import { config } from './config';

// Create Hono app
const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', prettyJSON());
app.use('*', cors({
  origin: config.corsOrigins,
  credentials: true,
}));

// API Routes
app.route('/api/health', healthRoutes);
app.route('/api/auth', authRoutes);
app.route('/api/escrows', escrowRoutes);
app.route('/api/milestones', milestoneRoutes);
app.route('/api/users', userRoutes);
app.route('/api/bridge', bridgeRoutes);
app.route('/api/disputes', disputeRoutes);

// Root endpoint
app.get('/', (c) => {
  return c.json({
    name: 'AccorDefi API',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      escrows: '/api/escrows',
      milestones: '/api/milestones',
      users: '/api/users',
      bridge: '/api/bridge',
      disputes: '/api/disputes',
    },
  });
});

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not Found', path: c.req.path }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('Server Error:', err);
  return c.json({ error: 'Internal Server Error', message: err.message }, 500);
});

// Create HTTP server with Hono handler
const httpServer = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const response = await app.fetch(new Request(url.toString(), {
    method: req.method,
    headers: req.headers as HeadersInit,
  }));
  
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  
  const body = await response.text();
  res.end(body);
});

// Socket.io for real-time updates
const socketServer = new SocketServer(httpServer, {
  cors: {
    origin: config.corsOrigins,
    credentials: true,
  },
});

const io = setupSocketHandlers(socketServer);

// Export for use in other modules
export { io };

// Start server
const PORT = config.port;
httpServer.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════╗
║                                                   ║
║      AccorDefi Backend API                        ║
║                                                   ║
║   Server:    http://localhost:${PORT}             ║
║   WebSocket: ws://localhost:${PORT}               ║
║   Env:       ${config.nodeEnv}                    ║
║                                                   ║
╚═══════════════════════════════════════════════════╝
  `);
});
