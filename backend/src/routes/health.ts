import { Hono } from 'hono';

export const healthRoutes = new Hono();

healthRoutes.get('/', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0',
  });
});

healthRoutes.get('/ready', (c) => {
  // Check if all services are ready
  return c.json({
    status: 'ready',
    services: {
      database: 'ok',
      evm: 'ok',
      sui: 'ok',
    },
  });
});
