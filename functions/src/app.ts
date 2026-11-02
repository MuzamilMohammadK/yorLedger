import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { authRouter } from './routes/auth.js';
import { adminRouter } from './routes/admin.js';
import { initializeFirebaseAdmin } from './middleware/auth.js';

export function createApp(): Express {
  const app = express();

  // Initialize Firebase Admin SDK
  initializeFirebaseAdmin();

  // Middleware
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());

  // Health check route
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'yorbalance-api', timestamp: new Date().toISOString() });
  });

  // API v1 Routes
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/admin', adminRouter);

  // Global 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ code: 'NOT_FOUND', message: 'API route not found' });
  });

  // Global error handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled API exception:', err);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: err.message || 'Internal server error' });
  });

  return app;
}

