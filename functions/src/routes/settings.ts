import { Router, Request, Response } from 'express';
import { getDatabase } from '../db/index.js';
import { requireAuth, requireApprovedShop } from '../middleware/auth.js';

export const settingsRouter = Router();

// Protect all settings endpoints with strict tenant authentication and approved shop check
settingsRouter.use(requireAuth, requireApprovedShop);

// GET /api/v1/settings - Get complete shop settings & preferences
settingsRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.shop) {
      res.status(403).json({ code: 'FORBIDDEN', message: 'Shop access not verified' });
      return;
    }

    const db = await getDatabase();
    const settings = await db.getShopSettings(req.shop.id);

    res.json(settings);
  } catch (err: any) {
    console.error('Get settings error:', err);
    res.status(500).json({ code: 'SERVER_ERROR', message: err.message || 'Failed to fetch settings' });
  }
});

// PUT /api/v1/settings/profile - Update shop profile
settingsRouter.put('/profile', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.shop) {
      res.status(403).json({ code: 'FORBIDDEN', message: 'Shop access not verified' });
      return;
    }

    const db = await getDatabase();
    const updatedShop = await db.updateShopProfile(req.shop.id, req.body);

    res.json({
      message: 'Shop profile updated successfully',
      shop: updatedShop
    });
  } catch (err: any) {
    console.error('Update shop profile error:', err);
    res.status(400).json({ code: 'BAD_REQUEST', message: err.message || 'Failed to update shop profile' });
  }
});

// PUT /api/v1/settings/gst - Update GST & Tax configuration
settingsRouter.put('/gst', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.shop) {
      res.status(403).json({ code: 'FORBIDDEN', message: 'Shop access not verified' });
      return;
    }

    const { gstin, default_gst_bp, state_code } = req.body;

    if (default_gst_bp !== undefined && (typeof default_gst_bp !== 'number' || default_gst_bp < 0 || default_gst_bp > 4000)) {
      res.status(400).json({ code: 'BAD_REQUEST', message: 'Invalid default GST rate (must be 0 - 4000 basis points)' });
      return;
    }

    const db = await getDatabase();
    const updatedShop = await db.updateGSTSettings(req.shop.id, {
      gstin,
      default_gst_bp,
      state_code
    });

    res.json({
      message: 'GST settings updated successfully. New bills will use this default rate; previous bills preserve their recorded tax snapshots.',
      shop: updatedShop
    });
  } catch (err: any) {
    console.error('Update GST settings error:', err);
    res.status(400).json({ code: 'BAD_REQUEST', message: err.message || 'Failed to update GST settings' });
  }
});

// PUT /api/v1/settings/invoice - Update invoice templates & numbering prefix
settingsRouter.put('/invoice', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.shop) {
      res.status(403).json({ code: 'FORBIDDEN', message: 'Shop access not verified' });
      return;
    }

    const db = await getDatabase();
    const updated = await db.updateInvoiceSettings(req.shop.id, req.body);

    res.json({
      message: 'Invoice settings updated successfully',
      invoice_settings: updated
    });
  } catch (err: any) {
    console.error('Update invoice settings error:', err);
    res.status(400).json({ code: 'BAD_REQUEST', message: err.message || 'Failed to update invoice settings' });
  }
});

// PUT /api/v1/settings/notifications - Update alert & reminder preferences
settingsRouter.put('/notifications', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.shop) {
      res.status(403).json({ code: 'FORBIDDEN', message: 'Shop access not verified' });
      return;
    }

    const db = await getDatabase();
    const updated = await db.updateNotificationSettings(req.shop.id, req.body);

    res.json({
      message: 'Notification settings updated successfully',
      notification_settings: updated
    });
  } catch (err: any) {
    console.error('Update notification settings error:', err);
    res.status(400).json({ code: 'BAD_REQUEST', message: err.message || 'Failed to update notification settings' });
  }
});

// PUT /api/v1/settings/preferences - Update application display preferences
settingsRouter.put('/preferences', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.shop) {
      res.status(403).json({ code: 'FORBIDDEN', message: 'Shop access not verified' });
      return;
    }

    const db = await getDatabase();
    const updated = await db.updateAppPreferences(req.shop.id, req.body);

    res.json({
      message: 'App preferences updated successfully',
      app_preferences: updated
    });
  } catch (err: any) {
    console.error('Update app preferences error:', err);
    res.status(400).json({ code: 'BAD_REQUEST', message: err.message || 'Failed to update app preferences' });
  }
});

// GET /api/v1/settings/export/:type - Export data strictly for authenticated shop
settingsRouter.get('/export/:type', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.shop) {
      res.status(403).json({ code: 'FORBIDDEN', message: 'Shop access not verified' });
      return;
    }

    const type = req.params.type as 'transactions' | 'parties' | 'reports';
    if (!['transactions', 'parties', 'reports'].includes(type)) {
      res.status(400).json({ code: 'BAD_REQUEST', message: 'Invalid export type. Must be transactions, parties, or reports.' });
      return;
    }

    const db = await getDatabase();
    const result = await db.exportShopData(req.shop.id, type);

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.data);
  } catch (err: any) {
    console.error('Export data error:', err);
    res.status(500).json({ code: 'SERVER_ERROR', message: err.message || 'Failed to export data' });
  }
});

