import { Router, Request, Response } from 'express';
import { getDatabase } from '../db/index.js';
import { requireAuth, requireApprovedShop } from '../middleware/auth.js';
import { RecordPaymentPayload, RecordReturnPayload } from '@yorbalance/shared';

export const paymentsRouter = Router();

paymentsRouter.use(requireAuth, requireApprovedShop);

// POST /api/v1/payments - Record a payment against an invoice or on party account
paymentsRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.shop) {
      res.status(403).json({ code: 'FORBIDDEN', message: 'Shop access not verified' });
      return;
    }

    const {
      party_id,
      transaction_id,
      amount_rupees,
      payment_mode,
      payment_date,
      reference_number,
      cheque_number,
      cheque_date,
      deposit_date,
      clearing_status,
      notes
    } = req.body;

    if (!party_id) {
      res.status(400).json({ code: 'BAD_REQUEST', message: 'Party ID is required' });
      return;
    }

    const amount = parseFloat(amount_rupees);
    if (isNaN(amount) || amount <= 0) {
      res.status(400).json({ code: 'BAD_REQUEST', message: 'Valid payment amount greater than zero is required' });
      return;
    }

    if (!payment_mode || !['CASH', 'CHEQUE', 'NEFT'].includes(payment_mode)) {
      res.status(400).json({ code: 'BAD_REQUEST', message: 'Payment mode must be CASH, CHEQUE, or NEFT' });
      return;
    }

    if (payment_mode === 'CHEQUE' && (!cheque_number || !cheque_number.trim())) {
      res.status(400).json({ code: 'BAD_REQUEST', message: 'Cheque number is required for Cheque payments' });
      return;
    }

    const payload: RecordPaymentPayload = {
      party_id,
      transaction_id: transaction_id || null,
      amount_rupees: amount,
      payment_mode,
      payment_date: payment_date || new Date().toISOString().split('T')[0],
      reference_number: reference_number || null,
      cheque_number: cheque_number || null,
      cheque_date: cheque_date || null,
      deposit_date: deposit_date || null,
      clearing_status: clearing_status || (payment_mode === 'CHEQUE' ? 'PENDING' : 'CLEARED'),
      notes: notes || null
    };

    const db = await getDatabase();
    const result = await db.recordPayment(req.shop.id, payload);

    res.status(201).json({
      message: 'Payment recorded successfully',
      payment: result.payment,
      transaction: result.transaction
    });
  } catch (err: any) {
    console.error('Record payment error:', err);
    res.status(400).json({ code: 'BAD_REQUEST', message: err.message || 'Failed to record payment' });
  }
});

// GET /api/v1/payments/:paymentId - Retrieve payment details
paymentsRouter.get('/:paymentId', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.shop) {
      res.status(403).json({ code: 'FORBIDDEN', message: 'Shop access not verified' });
      return;
    }

    const { paymentId } = req.params;
    const db = await getDatabase();
    const payment = await db.getPaymentById(req.shop.id, paymentId);

    if (!payment) {
      res.status(404).json({ code: 'NOT_FOUND', message: 'Payment record not found' });
      return;
    }

    res.json({
      shop_id: req.shop.id,
      payment
    });
  } catch (err: any) {
    console.error('Get payment error:', err);
    res.status(500).json({ code: 'SERVER_ERROR', message: err.message || 'Failed to fetch payment' });
  }
});

// POST /api/v1/payments/returns - Record goods return on invoice
paymentsRouter.post('/returns', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.shop) {
      res.status(403).json({ code: 'FORBIDDEN', message: 'Shop access not verified' });
      return;
    }

    const { transaction_id, amount_rupees, reason, return_date } = req.body;

    if (!transaction_id) {
      res.status(400).json({ code: 'BAD_REQUEST', message: 'Transaction ID is required' });
      return;
    }

    const amount = parseFloat(amount_rupees);
    if (isNaN(amount) || amount <= 0) {
      res.status(400).json({ code: 'BAD_REQUEST', message: 'Valid return amount greater than zero is required' });
      return;
    }

    const payload: RecordReturnPayload = {
      transaction_id,
      amount_rupees: amount,
      reason: reason || null,
      return_date: return_date || new Date().toISOString().split('T')[0]
    };

    const db = await getDatabase();
    const result = await db.recordReturn(req.shop.id, payload);

    res.status(201).json({
      message: 'Return recorded successfully',
      return: result.returnRecord,
      transaction: result.transaction
    });
  } catch (err: any) {
    console.error('Record return error:', err);
    res.status(400).json({ code: 'BAD_REQUEST', message: err.message || 'Failed to record return' });
  }
});

