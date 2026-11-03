import { Router, Request, Response } from 'express';
import { getDatabase } from '../db/index.js';
import { requireAuth, requireApprovedShop } from '../middleware/auth.js';

export const ledgerRouter = Router();

// Protect all ledger routes with strict tenant authentication and approved shop check
ledgerRouter.use(requireAuth, requireApprovedShop);

// GET /api/v1/ledger/overview
ledgerRouter.get('/overview', (req: Request, res: Response): void => {
  res.json({ message: 'Approved merchant access verified', shop: req.shop });
});

// GET /api/v1/ledger/recent
ledgerRouter.get('/recent', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.shop) {
      res.status(403).json({ code: 'FORBIDDEN', message: 'Shop access not verified' });
      return;
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
    const search = req.query.search as string | undefined;

    const db = await getDatabase();
    const transactions = await db.getRecentTransactions(req.shop.id, limit, search);

    res.json({
      shop_id: req.shop.id,
      count: transactions.length,
      transactions
    });
  } catch (err: any) {
    console.error('Ledger recent transactions error:', err);
    res.status(500).json({ code: 'SERVER_ERROR', message: err.message || 'Failed to fetch transactions' });
  }
});

// GET /api/v1/ledger/transactions/:id
ledgerRouter.get('/transactions/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.shop) {
      res.status(403).json({ code: 'FORBIDDEN', message: 'Shop access not verified' });
      return;
    }

    const db = await getDatabase();
    const transaction = await db.getTransactionById(req.shop.id, req.params.id);

    if (!transaction) {
      res.status(404).json({ code: 'NOT_FOUND', message: 'Transaction record not found' });
      return;
    }

    res.json({ transaction });
  } catch (err: any) {
    console.error('Fetch transaction details error:', err);
    res.status(500).json({ code: 'SERVER_ERROR', message: err.message || 'Internal server error' });
  }
});
