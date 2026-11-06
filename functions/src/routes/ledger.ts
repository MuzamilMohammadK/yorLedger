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

// GET /api/v1/ledger/transactions - Comprehensive filtered ledger with summary
ledgerRouter.get('/transactions', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.shop) {
      res.status(403).json({ code: 'FORBIDDEN', message: 'Shop access not verified' });
      return;
    }

    const partyId = req.query.party_id as string | undefined;
    const type = req.query.type as any | undefined;
    const search = req.query.search as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;

    const db = await getDatabase();
    const { transactions, summary } = await db.getLedgerTransactions(req.shop.id, {
      partyId,
      type,
      search,
      limit
    });

    let party = null;
    if (partyId) {
      party = await db.getPartyById(req.shop.id, partyId);
    }

    res.json({
      shop_id: req.shop.id,
      party,
      count: transactions.length,
      summary,
      transactions
    });
  } catch (err: any) {
    console.error('Get ledger transactions error:', err);
    res.status(500).json({ code: 'SERVER_ERROR', message: err.message || 'Failed to fetch ledger transactions' });
  }
});

// POST /api/v1/ledger/transactions - Record a new ledger transaction
ledgerRouter.post('/transactions', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.shop) {
      res.status(403).json({ code: 'FORBIDDEN', message: 'Shop access not verified' });
      return;
    }

    const { party_id, type, amount_rupees, paid_rupees, gst_rate_bp, is_inter_state, invoice_number, invoice_date, notes, item_name } = req.body;

    const errors: Record<string, string> = {};
    if (!party_id) {
      errors.party_id = 'Party is required';
    }
    if (!type || !['SALE', 'PURCHASE', 'JOB_WORK', 'RETURN'].includes(type)) {
      errors.type = 'Valid transaction type (Sale, Purchase, Job Work, Return) is required';
    }
    if (amount_rupees === undefined || isNaN(amount_rupees) || Number(amount_rupees) <= 0) {
      errors.amount_rupees = 'Valid positive transaction amount is required';
    }

    if (Object.keys(errors).length > 0) {
      res.status(400).json({ code: 'VALIDATION_FAILED', message: 'Please fix validation errors', fields: errors });
      return;
    }

    const db = await getDatabase();
    const transaction = await db.createTransaction(req.shop.id, {
      party_id,
      type,
      amount_rupees: Number(amount_rupees),
      paid_rupees: paid_rupees !== undefined ? Number(paid_rupees) : undefined,
      gst_rate_bp,
      is_inter_state: Boolean(is_inter_state),
      invoice_number,
      invoice_date,
      notes,
      item_name
    });

    res.status(201).json({
      message: 'Transaction successfully recorded',
      transaction
    });
  } catch (err: any) {
    console.error('Create transaction error:', err);
    res.status(500).json({ code: 'SERVER_ERROR', message: err.message || 'Failed to record transaction' });
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
