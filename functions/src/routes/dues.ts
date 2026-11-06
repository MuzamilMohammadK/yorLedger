import { Router, Request, Response } from 'express';
import { getDatabase } from '../db/index.js';
import { requireAuth, requireApprovedShop } from '../middleware/auth.js';
import { DuesFilterOptions } from '@yorbalance/shared';

export const duesRouter = Router();

duesRouter.use(requireAuth, requireApprovedShop);

// GET /api/v1/dues/summary - Totals for receivables, payables, and overdue amounts
duesRouter.get('/summary', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.shop) {
      res.status(403).json({ code: 'FORBIDDEN', message: 'Shop access not verified' });
      return;
    }

    const db = await getDatabase();
    const summary = await db.getDuesSummary(req.shop.id);

    res.json({
      shop_id: req.shop.id,
      summary
    });
  } catch (err: any) {
    console.error('Dues summary error:', err);
    res.status(500).json({ code: 'SERVER_ERROR', message: err.message || 'Failed to fetch dues summary' });
  }
});

// GET /api/v1/dues - Filterable dues list
duesRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.shop) {
      res.status(403).json({ code: 'FORBIDDEN', message: 'Shop access not verified' });
      return;
    }

    const options: DuesFilterOptions = {
      view: (req.query.view as any) || 'ALL',
      search: (req.query.search as string) || undefined,
      partyType: (req.query.party_type as any) || (req.query.partyType as any) || undefined,
      status: (req.query.status as any) || undefined,
      invoiceStartDate: (req.query.invoice_start_date as string) || (req.query.invoiceStartDate as string) || undefined,
      invoiceEndDate: (req.query.invoice_end_date as string) || (req.query.invoiceEndDate as string) || undefined,
      dueStartDate: (req.query.due_start_date as string) || (req.query.dueStartDate as string) || undefined,
      dueEndDate: (req.query.due_end_date as string) || (req.query.dueEndDate as string) || undefined,
      minAmount: req.query.min_amount ? parseFloat(req.query.min_amount as string) : undefined,
      maxAmount: req.query.max_amount ? parseFloat(req.query.max_amount as string) : undefined
    };

    const db = await getDatabase();
    const result = await db.getDues(req.shop.id, options);

    res.json({
      shop_id: req.shop.id,
      summary: result.summary,
      total: result.total,
      count: result.dues.length,
      dues: result.dues
    });
  } catch (err: any) {
    console.error('Dues list error:', err);
    res.status(500).json({ code: 'SERVER_ERROR', message: err.message || 'Failed to fetch dues' });
  }
});

// GET /api/v1/dues/:transactionId - Single due details
duesRouter.get('/:transactionId', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.shop) {
      res.status(403).json({ code: 'FORBIDDEN', message: 'Shop access not verified' });
      return;
    }

    const { transactionId } = req.params;
    const db = await getDatabase();
    const due = await db.getDueById(req.shop.id, transactionId);

    if (!due) {
      res.status(404).json({ code: 'NOT_FOUND', message: 'Due record not found' });
      return;
    }

    res.json({
      shop_id: req.shop.id,
      due
    });
  } catch (err: any) {
    console.error('Due detail error:', err);
    res.status(500).json({ code: 'SERVER_ERROR', message: err.message || 'Failed to fetch due detail' });
  }
});

