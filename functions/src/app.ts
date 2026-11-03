import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { authRouter } from './routes/auth.js';
import { adminRouter } from './routes/admin.js';
import { analyticsRouter } from './routes/analytics.js';
import { ledgerRouter } from './routes/ledger.js';
import { initializeFirebaseAdmin, requireAuth, requireApprovedShop } from './middleware/auth.js';

export function createApp(): Express {
  const app = express();

  // Initialize Firebase Admin SDK
  initializeFirebaseAdmin();

  // Middleware
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '10mb' })); // Support base64 image uploads

  // Health check route
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'yorbalance-api', timestamp: new Date().toISOString() });
  });

  // API v1 Routes
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/admin', adminRouter);
  app.use('/api/v1/analytics', analyticsRouter);
  app.use('/api/v1/ledger', ledgerRouter);

  // Protected Business Routes - Strictly requires APPROVED shop status
  const protectedShopRouter = express.Router();
  protectedShopRouter.use(requireAuth, requireApprovedShop);
  protectedShopRouter.get('/overview', (req: Request, res: Response) => {
    res.json({ message: 'Approved merchant access verified', shop: req.shop });
  });
  app.use('/api/v1/parties', protectedShopRouter);
  app.use('/api/v1/dues', protectedShopRouter);
  app.use('/api/v1/dashboard-data', protectedShopRouter);

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

