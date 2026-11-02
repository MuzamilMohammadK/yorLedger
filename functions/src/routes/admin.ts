import { Router, Request, Response } from 'express';
import { getDatabase } from '../db/index.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { AdminDecisionPayload } from '@yorbalance/shared';

export const adminRouter = Router();

// Protect all admin routes
adminRouter.use(requireAuth, requireAdmin);

// GET /api/v1/admin/shops?status=PENDING
adminRouter.get('/shops', async (req: Request, res: Response): Promise<void> => {
  try {
    const status = req.query.status as string | undefined;
    const db = await getDatabase();
    const shops = await db.getAllShops(status);
    res.json({ shops });
  } catch (err: any) {
    console.error('Error fetching admin shops:', err);
    res.status(500).json({ code: 'SERVER_ERROR', message: err.message });
  }
});

// GET /api/v1/admin/shops/:id
adminRouter.get('/shops/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = await getDatabase();
    const shop = await db.findShopById(req.params.id);
    if (!shop) {
      res.status(404).json({ code: 'NOT_FOUND', message: 'Shop not found' });
      return;
    }
    const latestVerification = await db.getLatestVerification(shop.id);
    res.json({ shop, latest_verification: latestVerification });
  } catch (err: any) {
    console.error('Error fetching shop details:', err);
    res.status(500).json({ code: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/v1/admin/shops/:id/decision
adminRouter.post('/shops/:id/decision', async (req: Request, res: Response): Promise<void> => {
  try {
    const { decision, reason }: AdminDecisionPayload = req.body;

    if (!decision || !['APPROVED', 'REJECTED'].includes(decision)) {
      res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: "Decision must be either 'APPROVED' or 'REJECTED'"
      });
      return;
    }

    if (decision === 'REJECTED' && !reason?.trim()) {
      res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'A clear reason is required when rejecting a shop registration'
      });
      return;
    }

    const db = await getDatabase();
    const adminEmail = req.user?.email || 'admin@yorbalance.com';

    const result = await db.recordAdminDecision(req.params.id, adminEmail, {
      decision,
      reason: reason?.trim()
    });

    res.json({
      message: `Shop has been ${decision.toLowerCase()} successfully`,
      shop: result.shop,
      verification: result.verification
    });
  } catch (err: any) {
    console.error('Error recording admin decision:', err);
    res.status(500).json({ code: 'SERVER_ERROR', message: err.message });
  }
});

