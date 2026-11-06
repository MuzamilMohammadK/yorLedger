import { Router, Request, Response } from 'express';
import { getDatabase } from '../db/index.js';
import { requireAuth, requireApprovedShop } from '../middleware/auth.js';
import { HistoryFilterOptions } from '@yorbalance/shared';

export const historyRouter = Router();

historyRouter.use(requireAuth, requireApprovedShop);

// GET /api/v1/history - Filterable transaction history with summary metrics
historyRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.shop) {
      res.status(403).json({ code: 'FORBIDDEN', message: 'Shop access not verified' });
      return;
    }

    const options: HistoryFilterOptions = {
      search: (req.query.search as string) || undefined,
      dateRange: (req.query.date_range as string) || (req.query.dateRange as string) || undefined,
      startDate: (req.query.start_date as string) || (req.query.startDate as string) || undefined,
      endDate: (req.query.end_date as string) || (req.query.endDate as string) || undefined,
      type: (req.query.type as any) || undefined,
      partyId: (req.query.party_id as string) || (req.query.partyId as string) || undefined,
      status: (req.query.status as any) || undefined,
      minAmount: req.query.min_amount ? parseFloat(req.query.min_amount as string) : undefined,
      maxAmount: req.query.max_amount ? parseFloat(req.query.max_amount as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 100,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0
    };

    const db = await getDatabase();
    const result = await db.getHistory(req.shop.id, options);

    res.json({
      shop_id: req.shop.id,
      summary: result.summary,
      total: result.total,
      count: result.transactions.length,
      transactions: result.transactions
    });
  } catch (err: any) {
    console.error('History fetch error:', err);
    res.status(500).json({ code: 'SERVER_ERROR', message: err.message || 'Failed to fetch history' });
  }
});

// GET /api/v1/history/:transactionId - Detailed transaction audit & items breakdown
historyRouter.get('/:transactionId', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.shop) {
      res.status(403).json({ code: 'FORBIDDEN', message: 'Shop access not verified' });
      return;
    }

    const { transactionId } = req.params;
    const db = await getDatabase();
    const transaction = await db.getTransactionHistoryDetails(req.shop.id, transactionId);

    if (!transaction) {
      res.status(404).json({ code: 'NOT_FOUND', message: 'Transaction not found' });
      return;
    }

    res.json({
      shop_id: req.shop.id,
      transaction
    });
  } catch (err: any) {
    console.error('History detail fetch error:', err);
    res.status(500).json({ code: 'SERVER_ERROR', message: err.message || 'Failed to fetch transaction details' });
  }
});

