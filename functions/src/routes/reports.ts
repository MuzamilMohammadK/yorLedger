import { Router, Request, Response } from 'express';
import { getDatabase } from '../db/index.js';
import { requireAuth, requireApprovedShop } from '../middleware/auth.js';
import { ReportFilterOptions } from '@yorbalance/shared';

export const reportsRouter = Router();

// Protect all reports endpoints with strict tenant authentication and approved shop check
reportsRouter.use(requireAuth, requireApprovedShop);

function extractReportOptions(req: Request): ReportFilterOptions {
  return {
    from: (req.query.from as string) || (req.query.startDate as string) || undefined,
    to: (req.query.to as string) || (req.query.endDate as string) || undefined,
    financialYear: (req.query.financialYear as string) || (req.query.fy as string) || undefined,
    month: (req.query.month as string) || undefined,
    quarter: (req.query.quarter as string) || undefined,
    partySearch: (req.query.partySearch as string) || (req.query.search as string) || undefined,
    partyId: (req.query.partyId as string) || undefined
  };
}

// GET /api/v1/reports/purchase-ledger
reportsRouter.get('/purchase-ledger', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.shop) {
      res.status(403).json({ code: 'FORBIDDEN', message: 'Shop access not verified' });
      return;
    }

    const options = extractReportOptions(req);
    const db = await getDatabase();
    const report = await db.getPurchaseLedger(req.shop.id, options);

    res.json({
      shop_id: req.shop.id,
      shop_name: req.shop.name,
      gstin: req.shop.gstin,
      report
    });
  } catch (err: any) {
    console.error('Purchase ledger report error:', err);
    res.status(500).json({ code: 'SERVER_ERROR', message: err.message || 'Failed to generate purchase ledger' });
  }
});

// GET /api/v1/reports/sales-ledger
reportsRouter.get('/sales-ledger', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.shop) {
      res.status(403).json({ code: 'FORBIDDEN', message: 'Shop access not verified' });
      return;
    }

    const options = extractReportOptions(req);
    const db = await getDatabase();
    const report = await db.getSalesLedger(req.shop.id, options);

    res.json({
      shop_id: req.shop.id,
      shop_name: req.shop.name,
      gstin: req.shop.gstin,
      report
    });
  } catch (err: any) {
    console.error('Sales ledger report error:', err);
    res.status(500).json({ code: 'SERVER_ERROR', message: err.message || 'Failed to generate sales ledger' });
  }
});

// GET /api/v1/reports/job-work-ledger
reportsRouter.get('/job-work-ledger', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.shop) {
      res.status(403).json({ code: 'FORBIDDEN', message: 'Shop access not verified' });
      return;
    }

    const options = extractReportOptions(req);
    const db = await getDatabase();
    const report = await db.getJobWorkLedger(req.shop.id, options);

    res.json({
      shop_id: req.shop.id,
      shop_name: req.shop.name,
      gstin: req.shop.gstin,
      report
    });
  } catch (err: any) {
    console.error('Job work ledger report error:', err);
    res.status(500).json({ code: 'SERVER_ERROR', message: err.message || 'Failed to generate job work ledger' });
  }
});

// GET /api/v1/reports/gst-dashboard
reportsRouter.get('/gst-dashboard', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.shop) {
      res.status(403).json({ code: 'FORBIDDEN', message: 'Shop access not verified' });
      return;
    }

    const options = extractReportOptions(req);
    const db = await getDatabase();
    const gstData = await db.getGSTDashboard(req.shop.id, options);

    res.json({
      shop_id: req.shop.id,
      shop_name: req.shop.name,
      gstin: req.shop.gstin,
      gst_data: gstData,
      disclaimer: 'GST analytics are accounting summaries and must not be presented as proof that a GST return has been filed. Tax figures should be reviewed by the shop chartered accountant before filing GSTR-1, GSTR-3B, or CMP-08.'
    });
  } catch (err: any) {
    console.error('GST dashboard report error:', err);
    res.status(500).json({ code: 'SERVER_ERROR', message: err.message || 'Failed to generate GST dashboard' });
  }
});

