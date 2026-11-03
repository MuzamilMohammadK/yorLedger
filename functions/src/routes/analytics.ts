import { Router, Request, Response } from 'express';
import { getDatabase } from '../db/index.js';
import { requireAuth, requireApprovedShop } from '../middleware/auth.js';
import { DateRangeOption } from '@yorbalance/shared';

export const analyticsRouter = Router();

// Protect all analytics endpoints with strict tenant authentication and approved shop check
analyticsRouter.use(requireAuth, requireApprovedShop);

// GET /api/v1/analytics/summary
analyticsRouter.get('/summary', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.shop) {
      res.status(403).json({ code: 'FORBIDDEN', message: 'Shop access not verified' });
      return;
    }

    const period = (req.query.period as DateRangeOption) || 'this_month';
    const db = await getDatabase();
    const summary = await db.getDashboardSummary(req.shop.id, period);

    res.json({
      shop: {
        id: req.shop.id,
        name: req.shop.name,
        gstin: req.shop.gstin
      },
      summary
    });
  } catch (err: any) {
    console.error('Analytics summary error:', err);
    res.status(500).json({ code: 'SERVER_ERROR', message: err.message || 'Failed to calculate summary' });
  }
});

// GET /api/v1/analytics/charts
analyticsRouter.get('/charts', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.shop) {
      res.status(403).json({ code: 'FORBIDDEN', message: 'Shop access not verified' });
      return;
    }

    const period = (req.query.period as DateRangeOption) || 'this_month';
    const db = await getDatabase();
    const charts = await db.getDashboardCharts(req.shop.id, period);

    res.json({
      shop_id: req.shop.id,
      period,
      charts
    });
  } catch (err: any) {
    console.error('Analytics charts error:', err);
    res.status(500).json({ code: 'SERVER_ERROR', message: err.message || 'Failed to fetch charts' });
  }
});
