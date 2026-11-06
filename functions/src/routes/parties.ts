import { Router, Request, Response } from 'express';
import { getDatabase } from '../db/index.js';
import { requireAuth, requireApprovedShop } from '../middleware/auth.js';
import { PartyType, CreatePartyPayload, UpdatePartyPayload, validateGSTIN, normalizePhone, validatePinCode, getStateCodeByName } from '@yorbalance/shared';

export const partiesRouter = Router();

// Protect all party routes with strict tenant authentication and approved shop check
partiesRouter.use(requireAuth, requireApprovedShop);

// GET /api/v1/parties/overview - Quick verification endpoint
partiesRouter.get('/overview', (req: Request, res: Response): void => {
  res.json({ message: 'Approved merchant access verified', shop: req.shop });
});

// GET /api/v1/parties - List parties for authenticated shop
partiesRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.shop) {
      res.status(403).json({ code: 'FORBIDDEN', message: 'Shop access not verified' });
      return;
    }

    const type = req.query.type as PartyType | undefined;
    const search = req.query.search as string | undefined;

    const db = await getDatabase();
    const parties = await db.getParties(req.shop.id, type, search);

    res.json({
      shop_id: req.shop.id,
      count: parties.length,
      parties
    });
  } catch (err: any) {
    console.error('Fetch parties error:', err);
    res.status(500).json({ code: 'SERVER_ERROR', message: err.message || 'Failed to fetch parties' });
  }
});

// POST /api/v1/parties/check-duplicate - Check for duplicate mobile or GSTIN
partiesRouter.post('/check-duplicate', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.shop) {
      res.status(403).json({ code: 'FORBIDDEN', message: 'Shop access not verified' });
      return;
    }

    const { phone, gstin, excludePartyId } = req.body;
    if (!phone && !gstin) {
      res.json({ isDuplicate: false });
      return;
    }

    const db = await getDatabase();
    const result = await db.checkDuplicateParty(req.shop.id, phone || '', gstin, excludePartyId);
    res.json(result);
  } catch (err: any) {
    console.error('Check duplicate party error:', err);
    res.status(500).json({ code: 'SERVER_ERROR', message: err.message || 'Duplicate check failed' });
  }
});

// GET /api/v1/parties/:id - Get specific party details with balance
partiesRouter.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.shop) {
      res.status(403).json({ code: 'FORBIDDEN', message: 'Shop access not verified' });
      return;
    }

    const db = await getDatabase();
    const party = await db.getPartyById(req.shop.id, req.params.id);

    if (!party) {
      res.status(404).json({ code: 'NOT_FOUND', message: 'Party not found or does not belong to this shop' });
      return;
    }

    res.json({ party });
  } catch (err: any) {
    console.error('Fetch party details error:', err);
    res.status(500).json({ code: 'SERVER_ERROR', message: err.message || 'Internal server error' });
  }
});

// POST /api/v1/parties - Add a new party with comprehensive validation
partiesRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.shop) {
      res.status(403).json({ code: 'FORBIDDEN', message: 'Shop access not verified' });
      return;
    }

    const {
      name,
      type,
      owner_name,
      phone,
      additional_phones,
      gstin,
      address,
      state,
      state_code,
      pin_code,
      notes
    } = req.body;

    const errors: Record<string, string> = {};

    // 1. Party Type Validation
    if (!type || !['CUSTOMER', 'SUPPLIER', 'ARTISAN'].includes(type)) {
      errors.type = 'Party type must be Customer, Supplier, or Artisan';
    }

    // 2. Shop / Business Name Validation
    if (!name || !name.trim()) {
      errors.name = 'Shop / Business name is required';
    }

    // 3. Owner Name Validation
    if (!owner_name || !owner_name.trim()) {
      errors.owner_name = 'Owner name is required';
    }

    // 4. Primary Mobile Validation
    const normalizedMobile = normalizePhone(phone);
    if (!normalizedMobile) {
      errors.phone = 'Valid 10-digit Indian mobile number is required';
    }

    // 5. Additional Mobile Numbers Validation
    let validAdditional: string[] = [];
    if (Array.isArray(additional_phones)) {
      for (let i = 0; i < additional_phones.length; i++) {
        const item = additional_phones[i];
        if (item && item.trim()) {
          const norm = normalizePhone(item);
          if (!norm) {
            errors[`additional_phones_${i}`] = `Additional mobile #${i + 1} is invalid`;
          } else {
            validAdditional.push(norm);
          }
        }
      }
    }

    // 6. GSTIN Validation (Optional)
    let validatedGstin: string | null = null;
    if (gstin && gstin.trim()) {
      const gstinResult = validateGSTIN(gstin.trim(), false);
      if (!gstinResult.valid) {
        errors.gstin = gstinResult.error || 'Invalid GSTIN format';
      } else {
        validatedGstin = gstin.trim().toUpperCase();
      }
    }

    // 7. Full Address Validation
    if (!address || !address.trim()) {
      errors.address = 'Full address is required';
    }

    // 8. State Validation
    if (!state || !state.trim()) {
      errors.state = 'State is required';
    }

    // 9. PIN Code Validation
    if (!pin_code || !validatePinCode(pin_code)) {
      errors.pin_code = 'Valid 6-digit Indian postal PIN code is required';
    }

    if (Object.keys(errors).length > 0) {
      res.status(400).json({
        code: 'VALIDATION_FAILED',
        message: 'Please resolve form validation errors',
        fields: errors
      });
      return;
    }

    const stateCodeResolved = state_code || getStateCodeByName(state) || '37';

    const payload: CreatePartyPayload = {
      name: name.trim(),
      type,
      owner_name: owner_name.trim(),
      phone: normalizedMobile!,
      additional_phones: validAdditional,
      gstin: validatedGstin,
      address: address.trim(),
      state: state.trim(),
      state_code: stateCodeResolved,
      pin_code: pin_code.trim(),
      notes: notes ? notes.trim() : null
    };

    const db = await getDatabase();
    const party = await db.createParty(req.shop.id, payload);

    res.status(201).json({
      message: 'Party successfully registered',
      party
    });
  } catch (err: any) {
    console.error('Create party error:', err);
    res.status(500).json({ code: 'SERVER_ERROR', message: err.message || 'Failed to create party' });
  }
});

// PATCH /api/v1/parties/:id - Update party details
partiesRouter.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.shop) {
      res.status(403).json({ code: 'FORBIDDEN', message: 'Shop access not verified' });
      return;
    }

    const {
      name,
      type,
      owner_name,
      phone,
      additional_phones,
      gstin,
      address,
      state,
      state_code,
      pin_code,
      notes
    } = req.body;

    const errors: Record<string, string> = {};

    if (type !== undefined && !['CUSTOMER', 'SUPPLIER', 'ARTISAN'].includes(type)) {
      errors.type = 'Party type must be Customer, Supplier, or Artisan';
    }

    let normalizedMobile: string | undefined = undefined;
    if (phone !== undefined) {
      const norm = normalizePhone(phone);
      if (!norm) {
        errors.phone = 'Valid 10-digit Indian mobile number is required';
      } else {
        normalizedMobile = norm;
      }
    }

    let validAdditional: string[] | undefined = undefined;
    if (additional_phones !== undefined) {
      if (Array.isArray(additional_phones)) {
        validAdditional = [];
        for (let i = 0; i < additional_phones.length; i++) {
          const item = additional_phones[i];
          if (item && item.trim()) {
            const norm = normalizePhone(item);
            if (!norm) {
              errors[`additional_phones_${i}`] = `Additional mobile #${i + 1} is invalid`;
            } else {
              validAdditional.push(norm);
            }
          }
        }
      }
    }

    let validatedGstin: string | null | undefined = undefined;
    if (gstin !== undefined) {
      if (gstin && gstin.trim()) {
        const gstinResult = validateGSTIN(gstin.trim(), false);
        if (!gstinResult.valid) {
          errors.gstin = gstinResult.error || 'Invalid GSTIN format';
        } else {
          validatedGstin = gstin.trim().toUpperCase();
        }
      } else {
        validatedGstin = null;
      }
    }

    if (pin_code !== undefined && !validatePinCode(pin_code)) {
      errors.pin_code = 'Valid 6-digit Indian postal PIN code is required';
    }

    if (Object.keys(errors).length > 0) {
      res.status(400).json({
        code: 'VALIDATION_FAILED',
        message: 'Please resolve form validation errors',
        fields: errors
      });
      return;
    }

    const payload: UpdatePartyPayload = {
      name,
      type,
      owner_name,
      phone: normalizedMobile,
      additional_phones: validAdditional,
      gstin: validatedGstin,
      address,
      state,
      state_code,
      pin_code,
      notes
    };

    const db = await getDatabase();
    const updatedParty = await db.updateParty(req.shop.id, req.params.id, payload);

    res.json({
      message: 'Party details updated successfully',
      party: updatedParty
    });
  } catch (err: any) {
    console.error('Update party error:', err);
    if (err.message === 'Party not found') {
      res.status(404).json({ code: 'NOT_FOUND', message: 'Party record not found' });
      return;
    }
    res.status(500).json({ code: 'SERVER_ERROR', message: err.message || 'Failed to update party' });
  }
});
