import { Router, Request, Response } from 'express';
import { getDatabase } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { validateGSTIN, normalizePhone, RegisterShopPayload, ResubmitShopPayload } from '@yorbalance/shared';

export const authRouter = Router();

// POST /api/v1/auth/register-shop
authRouter.post('/register-shop', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const payload: RegisterShopPayload = req.body;
    const firebaseUid = req.firebaseUid;

    if (!firebaseUid) {
      res.status(401).json({ code: 'UNAUTHORIZED', message: 'Missing authenticated user identity' });
      return;
    }

    // Input Validation
    const errors: Record<string, string> = {};

    if (!payload.shop_name?.trim()) {
      errors.shop_name = 'Shop name is required';
    }

    if (!payload.owner_name?.trim()) {
      errors.owner_name = 'Owner name is required';
    }

    if (!payload.email?.trim() || !/^\S+@\S+\.\S+$/.test(payload.email)) {
      errors.email = 'Valid email address is required';
    }

    const normalizedMobile = normalizePhone(payload.mobile);
    if (!normalizedMobile) {
      errors.mobile = 'Mobile number must be a valid 10-digit Indian phone number';
    } else {
      payload.mobile = normalizedMobile;
    }

    if (!payload.address?.trim()) {
      errors.address = 'Full address is required';
    }

    if (!payload.state_code?.trim()) {
      errors.state_code = 'State code is required';
    }

    // GSTIN Validation (Format + Checksum)
    const gstinResult = validateGSTIN(payload.gstin, true);
    if (!gstinResult.valid) {
      errors.gstin = gstinResult.error || 'Invalid GSTIN';
    } else if (gstinResult.stateCode !== payload.state_code) {
      errors.state_code = `State code (${payload.state_code}) does not match GSTIN state prefix (${gstinResult.stateCode})`;
    }

    // Validate default GST basis points
    if (payload.default_gst_bp && ![500, 1200, 1800, 2800].includes(payload.default_gst_bp)) {
      errors.default_gst_bp = 'Default GST rate must be 5%, 12%, 18%, or 28%';
    }

    // Document validation (JPEG/JPG format required)
    if (!payload.document_url?.trim()) {
      errors.document = 'Shop registration document in JPEG/JPG format is required';
    } else {
      const isJpeg = payload.document_url.startsWith('data:image/jpeg') || 
                     payload.document_url.startsWith('data:image/jpg') ||
                     /\.(jpg|jpeg)(\?.*)?$/i.test(payload.document_url);
      if (!isJpeg) {
        errors.document = 'Document must be in JPEG or JPG format';
      }
    }

    if (Object.keys(errors).length > 0) {
      res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Validation failed', fields: errors });
      return;
    }

    const db = await getDatabase();

    // Check if user already has a shop in v1
    const existingUser = await db.findUserByFirebaseUid(firebaseUid);
    if (existingUser && existingUser.shop_id) {
      res.status(400).json({
        code: 'SHOP_ALREADY_EXISTS',
        message: 'This user account already has a registered shop.'
      });
      return;
    }

    // Check GSTIN uniqueness
    const existingGstinShop = await db.findShopByGstin(payload.gstin);
    if (existingGstinShop) {
      res.status(409).json({
        code: 'DUPLICATE_GSTIN',
        message: `GSTIN ${payload.gstin.toUpperCase()} is already registered with another shop.`,
        fields: { gstin: 'GSTIN is already registered' }
      });
      return;
    }

    const result = await db.createShopAndUser(payload, firebaseUid);

    res.status(201).json({
      message: 'Shop registered successfully. Verification is pending admin review.',
      shop: result.shop,
      user: result.user
    });
  } catch (err: any) {
    console.error('Shop registration error:', err);
    res.status(500).json({ code: 'SERVER_ERROR', message: err.message || 'Internal server error' });
  }
});

// GET /api/v1/auth/me
authRouter.get('/me', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const db = await getDatabase();
    let shop = req.shop || null;
    let latestVerification = null;

    if (req.user?.shop_id && !shop) {
      shop = await db.findShopById(req.user.shop_id);
    }

    if (shop) {
      latestVerification = await db.getLatestVerification(shop.id);
    }

    res.json({
      user: req.user || null,
      shop: shop || null,
      latest_verification: latestVerification
    });
  } catch (err: any) {
    console.error('Error fetching user profile:', err);
    res.status(500).json({ code: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/v1/auth/resubmit
authRouter.post('/resubmit', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.shop) {
      res.status(404).json({ code: 'NOT_FOUND', message: 'No registered shop found for this account' });
      return;
    }

    if (req.shop.status !== 'REJECTED') {
      res.status(400).json({
        code: 'INVALID_STATUS',
        message: `Only rejected shops can resubmit details. Current status is ${req.shop.status}`
      });
      return;
    }

    const payload: ResubmitShopPayload = req.body;
    const errors: Record<string, string> = {};

    if (payload.mobile) {
      const normalized = normalizePhone(payload.mobile);
      if (!normalized) errors.mobile = 'Mobile number must be a valid 10-digit Indian phone number';
      else payload.mobile = normalized;
    }

    if (payload.gstin) {
      const gstinRes = validateGSTIN(payload.gstin, true);
      if (!gstinRes.valid) errors.gstin = gstinRes.error || 'Invalid GSTIN';
      else if (payload.state_code && gstinRes.stateCode !== payload.state_code) {
        errors.state_code = 'State code does not match GSTIN prefix';
      }
    }

    if (payload.document_url) {
      const isJpeg = payload.document_url.startsWith('data:image/jpeg') || 
                     payload.document_url.startsWith('data:image/jpg') ||
                     /\.(jpg|jpeg)(\?.*)?$/i.test(payload.document_url);
      if (!isJpeg) {
        errors.document = 'Document must be in JPEG or JPG format';
      }
    }

    if (Object.keys(errors).length > 0) {
      res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Validation failed', fields: errors });
      return;
    }

    const db = await getDatabase();
    const updatedShop = await db.resubmitShopDetails(req.shop.id, payload);

    res.json({
      message: 'Shop details resubmitted for admin review.',
      shop: updatedShop
    });
  } catch (err: any) {
    console.error('Resubmit error:', err);
    res.status(500).json({ code: 'SERVER_ERROR', message: err.message });
  }
});

