// Write side: parties, bills, payments, returns, settings — Firestore implementation.
// Every financial change is one Firestore transaction: the bill's cached totals,
// the payment/return record and an audit row are written together, and
// firestore.rules re-checks the arithmetic.
import {
  collection, deleteDoc, doc, getDoc, getDocs, runTransaction, serverTimestamp, setDoc, updateDoc, writeBatch
} from 'firebase/firestore';
import {
  CreateBillPayload, CreatePartyPayload, InvoiceSettings, NotificationSettings, AppPreferences,
  Party, PaymentPayload, ReturnPayload, Shop, ShopSettingsData, UpdatePartyPayload,
  UpdateShopProfilePayload, UpdateGSTSettingsPayload, computeTax, computeReturn,
  normalizeInvoice, normalizePhone, validateGSTIN, getStateCodeByName, validatePayment,
  validatePolishReceive, wouldVoidCauseNegative, allocatePolishPayments, TallyMovementKind,
  StockMovementType, RawMaterialTxType, LoomType, WeaverTxType, StaffWageType, StaffRecordType, PolishingStatus
} from '@yorbalance/shared';
import { auth, db } from '../firebase';
import { cache } from './cache';
import { AppError, todayIST } from './util';
import { shopFromDoc } from './session';

const col = (shopId: string, name: string) => collection(db, 'shops', shopId, name);
const ref = (shopId: string, name: string, id: string) => doc(db, 'shops', shopId, name, id);

type Setter = { set(r: ReturnType<typeof doc>, data: Record<string, unknown>): unknown };
function audit(tx: Setter, shopId: string, entity: string, entityId: string,
  action: string, before: unknown, after: unknown) {
  tx.set(doc(col(shopId, 'audit')), {
    actor_uid: auth.currentUser!.uid, entity, entity_id: entityId, action,
    before: before ?? null, after: after ?? null, at: serverTimestamp()
  });
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function requireDate(v: string | null | undefined, field: string) {
  if (!v || !DATE_RE.test(v)) throw new AppError('Please pick a date', 'VALIDATION_ERROR', { [field]: 'Date is required' });
}

// ---------------- Parties ----------------

function cleanParty(p: CreatePartyPayload | UpdatePartyPayload, partial: boolean) {
  const fields: Record<string, string> = {};
  const out: Record<string, unknown> = {};
  if (!partial || p.name !== undefined) {
    if (!p.name?.trim()) fields.name = 'Shop / business name is required'; else out.name = p.name.trim();
  }
  if (!partial || p.owner_name !== undefined) {
    if (!p.owner_name?.trim()) {
      if (p.type === 'ARTISAN' && p.name?.trim()) {
        out.owner_name = p.name.trim();
      } else {
        fields.owner_name = 'Owner name is required';
      }
    } else {
      out.owner_name = p.owner_name.trim();
    }
  }
  if (!partial || p.type !== undefined) out.type = p.type;
  if (!partial || p.phone !== undefined) {
    const ph = normalizePhone(p.phone ?? '');
    if (!ph) fields.phone = 'Enter a 10-digit mobile number'; else out.phone = ph;
  }
  if (p.additional_phones !== undefined) {
    const extra: string[] = [];
    p.additional_phones.filter(x => x.trim()).forEach((x, i) => {
      const n = normalizePhone(x);
      if (!n) fields[`additional_phones.${i}`] = 'Enter a 10-digit mobile number'; else extra.push(n);
    });
    out.additional_phones = extra;
  }
  if (p.gstin !== undefined) {
    const g = (p.gstin ?? '').trim().toUpperCase();
    if (g) {
      const v = validateGSTIN(g);
      if (!v.valid) fields.gstin = v.error ?? 'GSTIN is not valid';
      else { out.gstin = g; out.state_code = v.stateCode; }
    } else out.gstin = null;
  }
  if (p.address !== undefined) {
    if (p.type === 'ARTISAN' && !p.address.trim()) {
      fields.address = 'Address is required for weavers';
    } else {
      out.address = p.address.trim();
    }
  } else if (!partial && p.type === 'ARTISAN') {
    fields.address = 'Address is required for weavers';
  }
  if (p.state !== undefined) {
    out.state = p.state.trim();
    if (!out.state_code) out.state_code = p.state_code || getStateCodeByName(p.state) || '';
  }
  if (p.pin_code !== undefined) out.pin_code = p.pin_code.trim();
  if (p.notes !== undefined) out.notes = p.notes?.trim() || null;
  if (!partial || p.loom_type !== undefined) out.loom_type = p.loom_type || 'HANDLOOM';
  if (!partial || p.looms_count !== undefined) out.looms_count = Math.max(1, Math.floor(p.looms_count || 1));
  if (Object.keys(fields).length) throw new AppError('Please correct the highlighted fields', 'VALIDATION_ERROR', fields);
  return out;
}

export async function createParty(shopId: string, payload: CreatePartyPayload): Promise<Party> {
  const data = cleanParty(payload, false);
  const r = doc(col(shopId, 'parties'));
  const batch = writeBatch(db);
  batch.set(r, { ...data, joined_on: todayIST(), created_at: serverTimestamp(), updated_at: serverTimestamp() });
  audit(batch, shopId, 'party', r.id, 'CREATE', null, data);
  await batch.commit();
  await cache.ready(shopId);
  return cache.parties().find(p => p.id === r.id)!;
}

export async function updateParty(shopId: string, partyId: string, payload: UpdatePartyPayload): Promise<Party> {
  const before = cache.rawParty(partyId);
  if (!before) throw new AppError('Party not found', 'NOT_FOUND', undefined, 404);
  const data = cleanParty(payload, true);
  const batch = writeBatch(db);
  batch.update(ref(shopId, 'parties', partyId), { ...data, updated_at: serverTimestamp() });
  audit(batch, shopId, 'party', partyId, 'UPDATE', before, data);
  await batch.commit();
  return cache.parties().find(p => p.id === partyId)!;
}

/**
 * Soft delete (§7.5): allowed only when no bill of this party has money open
 * (amount due > 0, or a credit < 0). Financial history is never deleted: bills keep
 * the party name and stay in History and reports.
 */
export async function deleteParty(shopId: string, partyId: string) {
  const p = cache.rawParty(partyId);
  const open = cache.rawBills().filter(b => b.party_id === partyId && b.amount_due !== 0);
  if (open.length) {
    throw new AppError('This party still has money pending or a credit. Settle it first.', 'PARTY_HAS_OPEN_DUES', undefined, 409);
  }
  const hasBills = cache.rawBills().some(b => b.party_id === partyId);
  const hasYarn = cache.rawMaterialTx().some(t => t.weaver_id === partyId);
  const hasWeaverTx = cache.weaverTx().some(t => t.weaver_id === partyId);
  if (p?.type === 'ARTISAN' && (hasBills || hasYarn || hasWeaverTx)) {
    throw new AppError('Cannot delete this weaver: they have recorded bills or yarn/stock transactions. Clear them before removing.', 'WEAVER_HAS_TRANSACTIONS', undefined, 409);
  }
  const batch = writeBatch(db);
  batch.update(ref(shopId, 'parties', partyId), { deleted_at: serverTimestamp(), updated_at: serverTimestamp() });
  audit(batch, shopId, 'party', partyId, 'DELETE', null, null);
  await batch.commit();
}

// ---------------- Bills ----------------

export function nextSaleInvoiceNo(): number {
  const max = cache.rawBills().filter(b => b.kind === 'SALE').reduce((m, b) => Math.max(m, b.invoice_no), 0);
  return max + 1;
}

export async function isSaleInvoiceFree(shopId: string, raw: string): Promise<boolean> {
  const n = normalizeInvoice(raw);
  if (!n) return false;
  return !(await getDoc(ref(shopId, 'saleInvoices', String(n)))).exists();
}

export async function createBill(shop: Shop, payload: CreateBillPayload) {
  const fields: Record<string, string> = {};
  const invoiceNo = normalizeInvoice(payload.invoice_no);
  if (!invoiceNo) fields.invoice_no = 'Invoice number must be digits and not zero';
  requireDate(payload.bill_date, 'bill_date');
  const isJobWork = payload.kind === 'JOB_WORK';
  const items = payload.items.filter(i => i.name.trim() || i.qty || i.rate || i.hsn_code?.trim());
  if (!items.length) fields.items = 'Add at least one item';
  items.forEach((it, i) => {
    if (!it.name.trim()) fields[`items.${i}.name`] = 'Item name is required';
    if (!(it.qty > 0) || !Number.isInteger(it.qty)) fields[`items.${i}.qty`] = 'Quantity must be 1 or more';
    if (!(it.rate >= 0) || !Number.isInteger(it.rate)) fields[`items.${i}.rate`] = 'Enter a valid rate';
    if (!isJobWork && it.hsn_code && it.hsn_code.trim()) {
      const h = it.hsn_code.trim();
      if (!/^\d{4,8}$/.test(h)) fields[`items.${i}.hsn_code`] = 'HSN / SAC must be 4 to 8 digits';
    }
  });
  if (!Number.isInteger(payload.gst_bp) || payload.gst_bp < 0 || payload.gst_bp > 2800) fields.gst_bp = 'Invalid GST rate';
  let party = payload.party_id ? cache.rawParty(payload.party_id) : undefined;
  let customerName = party?.name ?? '';
  let customerPhone = party?.phone ?? '';

  if (isJobWork) {
    customerName = (payload.customer_name || '').trim();
    if (!customerName) fields.customer_name = 'Customer name is required';
    const cleanPhone = (payload.customer_phone || '').replace(/\D/g, '');
    if (cleanPhone.length !== 10) fields.customer_phone = 'Phone number must be 10 digits';
    customerPhone = cleanPhone;
  } else {
    if (!party) fields.party_id = 'Choose a party';
  }

  if (Object.keys(fields).length) throw new AppError('Please correct the highlighted fields', 'VALIDATION_ERROR', fields);

  // Party without GSTIN is treated as same-state (spec §8.6); manual override allowed.
  const partyState = party?.gstin ? party.state_code : shop.state_code;
  const effectiveGstBp = isJobWork ? (payload.gst_bp ?? 0) : payload.gst_bp;
  const tax = computeTax(items.map(i => ({ name: i.name, qty: i.qty, rate: i.rate })), effectiveGstBp, shop.state_code,
    payload.tax_mode_override === 'INTER' ? '__other__' : payload.tax_mode_override === 'INTRA' ? shop.state_code : partyState);

  const billRef = doc(col(shop.id, 'bills'));
  const finalPartyId = isJobWork ? (payload.party_id || `jw_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`) : party!.id;
  const bill = {
    kind: payload.kind,
    party_id: finalPartyId,
    party_name: isJobWork ? customerName : party!.name,
    party_phone: isJobWork ? customerPhone : (party?.phone ?? null),
    customer_name: isJobWork ? customerName : null,
    customer_phone: isJobWork ? customerPhone : null,
    party_type: 'CUSTOMER',
    invoice_no: invoiceNo!,
    invoice_prefix: payload.invoice_prefix ?? null,
    bill_date: payload.bill_date,
    gst_bp: effectiveGstBp,
    tax_mode: tax.taxMode,
    items: items.map(i => ({
      name: i.name.trim(),
      qty: i.qty,
      rate: i.rate,
      line_total: i.qty * i.rate,
      hsn_code: isJobWork ? null : (i.hsn_code?.trim() || null)
    })),
    hsn_code: null,
    subtotal: tax.subtotal,
    cgst: tax.cgst,
    sgst: tax.sgst,
    igst: tax.igst,
    grand_total: tax.grandTotal,
    paid_total: 0,
    returned_total: 0,
    returned_qty: {},
    amount_due: tax.grandTotal,
    status: 'PENDING',
    remind_on: payload.remind_on || null,
    remind_lead_days: payload.remind_lead_days ?? null,
    notes: payload.notes?.trim() || null,
    source: payload.source ?? 'MANUAL',
    created_at: serverTimestamp(),
    updated_at: serverTimestamp()
  };

  await runTransaction(db, async tx => {
    if (payload.kind === 'SALE') {
      const lock = ref(shop.id, 'saleInvoices', String(invoiceNo));
      if ((await tx.get(lock)).exists()) {
        throw new AppError(`Invoice ${invoiceNo} is already used. Next free number: ${nextSaleInvoiceNo()}`,
          'DUPLICATE_INVOICE', { invoice_no: 'Already used' }, 409);
      }
      tx.set(lock, { bill_id: billRef.id });
    }
    tx.set(billRef, bill);
    if (payload.kind === 'SALE' || payload.kind === 'PURCHASE') {
      const movKind: TallyMovementKind = payload.kind === 'SALE' ? 'SALE' : 'PURCHASE';
      const sign = payload.kind === 'SALE' ? -1 : 1;
      const refNo = bill.invoice_prefix ? `${bill.invoice_prefix}${bill.invoice_no}` : String(bill.invoice_no);
      for (const it of bill.items) {
        const movRef = doc(col(shop.id, 'stockMovements'));
        tx.set(movRef, {
          item_name: it.name,
          hsn_code: it.hsn_code ?? null,
          date: bill.bill_date,
          kind: movKind,
          movement_type: payload.kind,
          qty: sign * it.qty,
          rate_paise: it.rate,
          bill_id: billRef.id,
          party_id: bill.party_id,
          party_name: bill.party_name,
          ref_no: refNo,
          status: 'ACTIVE',
          created_at: serverTimestamp()
        });
      }
    }
    audit(tx, shop.id, 'bill', billRef.id, 'CREATE', null, { kind: bill.kind, invoice_no: bill.invoice_no, grand_total: bill.grand_total });
  });
  return { id: billRef.id, ...bill };
}

export async function updateBillReminder(shopId: string, billId: string, remind_on: string | null,
  remind_lead_days: number | null, notes?: string | null) {
  const batch = writeBatch(db);
  const patch: Record<string, unknown> = { remind_on, remind_lead_days, updated_at: serverTimestamp() };
  if (notes !== undefined) patch.notes = notes;
  batch.update(ref(shopId, 'bills', billId), patch);
  audit(batch, shopId, 'bill', billId, 'UPDATE_REMINDER', null, patch);
  await batch.commit();
}

/** Soft delete only; bills with payments or returns can never be deleted (spec §17.4). */
export async function deleteBill(shopId: string, billId: string) {
  const b = cache.rawBill(billId);
  if (!b) throw new AppError('Bill not found', 'NOT_FOUND', undefined, 404);
  if (b.paid_total > 0 || b.returned_total > 0) {
    throw new AppError('This bill has payments or returns, so it cannot be deleted.', 'BILL_LOCKED', undefined, 409);
  }
  const batch = writeBatch(db);
  batch.update(ref(shopId, 'bills', billId), { deleted_at: serverTimestamp(), updated_at: serverTimestamp() });
  // Reverse any linked stock movements so Finished Stock & Tally stay in sync
  for (const m of cache.rawStockMovements()) {
    if (m.bill_id === billId && m.status !== 'VOID') {
      batch.update(ref(shopId, 'stockMovements', m.id), {
        status: 'VOID',
        void_reason: 'Bill deleted',
        voided_at: serverTimestamp(),
        voided_by: auth.currentUser?.uid ?? null
      });
    }
  }
  audit(batch, shopId, 'bill', billId, 'DELETE', { invoice_no: b.invoice_no, grand_total: b.grand_total }, null);
  await batch.commit();
}

// ---------------- Payments ----------------

export async function recordPayment(shopId: string, p: PaymentPayload) {
  // Same validation as the form (shared), checked again against the live due inside the transaction.
  const pre = validatePayment(p, Number.MAX_SAFE_INTEGER);
  if (Object.keys(pre).length) throw new AppError('Please correct the highlighted fields', 'VALIDATION_ERROR', pre);

  const billRef = ref(shopId, 'bills', p.bill_id);
  const payRef = doc(col(shopId, 'payments'));
  await runTransaction(db, async tx => {
    const b = await tx.get(billRef);
    if (!b.exists() || b.data().deleted_at) throw new AppError('Bill not found', 'NOT_FOUND', undefined, 404);
    const bill = b.data();
    if (validatePayment(p, bill.amount_due).amount) {
      throw new AppError(`Amount is more than the due (₹${(bill.amount_due / 100).toLocaleString('en-IN')})`,
        'AMOUNT_EXCEEDS_DUE', { amount: 'More than due' });
    }
    const base = {
      bill_id: p.bill_id, party_id: bill.party_id, amount: p.amount, mode: p.mode,
      notes: p.notes?.trim() || null, created_at: serverTimestamp()
    };
    let record: Record<string, unknown>;
    const payDate = p.mode === 'CASH' ? p.paid_on : p.mode === 'CHEQUE' ? p.cheque_date : p.txn_date;
    if (p.mode === 'CASH') {
      record = { ...base, payment_date: payDate, paid_on: p.paid_on, collected_by: p.collected_by.trim() };
    } else if (p.mode === 'CHEQUE') {
      record = {
        ...base, payment_date: payDate, paid_on: p.cheque_date, cheque_no: p.cheque_no?.trim() || null, cheque_date: p.cheque_date,
        deposit_date: p.deposit_date || null, clearing_date: p.clearing_date || null,
        clearing_status: p.clearing_date ? 'CLEARED' : 'PENDING'
      };
    } else {
      const utr = p.utr_no.trim().toUpperCase();
      const utrRef = ref(shopId, 'utrs', utr);
      if ((await tx.get(utrRef)).exists()) {
        throw new AppError('This UTR number is already recorded', 'DUPLICATE_UTR', { utr_no: 'Already used' }, 409);
      }
      tx.set(utrRef, { payment_id: payRef.id });
      record = { ...base, payment_date: payDate, paid_on: p.txn_date, utr_no: utr, txn_date: p.txn_date };
    }
    const paid_total = bill.paid_total + p.amount;
    const amount_due = bill.grand_total - paid_total - bill.returned_total;
    tx.set(payRef, record);
    tx.update(billRef, {
      paid_total, amount_due, status: amount_due <= 0 ? 'SETTLED' : 'PENDING',
      last_op: payRef.id, updated_at: serverTimestamp()
    });
    audit(tx, shopId, 'payment', payRef.id, 'CREATE', { amount_due: bill.amount_due }, { amount: p.amount, mode: p.mode, amount_due });
  });
  return payRef.id;
}

export async function updateChequeStatus(shopId: string, paymentId: string,
  patch: { deposit_date?: string | null; clearing_date?: string | null; clearing_status?: 'PENDING' | 'CLEARED' | 'BOUNCED' }) {
  const batch = writeBatch(db);
  batch.update(ref(shopId, 'payments', paymentId), { ...patch, updated_at: serverTimestamp() });
  audit(batch, shopId, 'payment', paymentId, 'UPDATE_CHEQUE', null, patch);
  await batch.commit();
}

// ---------------- Returns ----------------

export async function recordReturn(shopId: string, p: ReturnPayload) {
  requireDate(p.returned_on, 'returned_on');
  const billRef = ref(shopId, 'bills', p.bill_id);
  const retRef = doc(col(shopId, 'returns'));
  await runTransaction(db, async tx => {
    const b = await tx.get(billRef);
    if (!b.exists() || b.data().deleted_at) throw new AppError('Bill not found', 'NOT_FOUND', undefined, 404);
    const bill = b.data();
    let calc;
    try {
      calc = computeReturn({
        items: bill.items, gstBp: bill.gst_bp, taxMode: bill.tax_mode, grandTotal: bill.grand_total,
        returnedTotal: bill.returned_total, returnedQty: bill.returned_qty ?? {}
      }, p.lines);
    } catch (e: any) {
      throw new AppError(e.message, 'INVALID_RETURN', { lines: e.message });
    }
    const returned_total = bill.returned_total + calc.totalReduction;
    const amount_due = bill.grand_total - bill.paid_total - returned_total;
    tx.set(retRef, {
      bill_id: p.bill_id, party_id: bill.party_id, returned_on: p.returned_on, reason: p.reason?.trim() || null,
      items: p.lines.filter(l => l.qty > 0).map(l => ({ index: l.index, name: bill.items[l.index].name, qty: l.qty })),
      taxable_reduction: calc.taxableReduction, cgst: calc.cgst, sgst: calc.sgst, igst: calc.igst,
      total_reduction: calc.totalReduction, created_at: serverTimestamp()
    });
    tx.update(billRef, {
      returned_total, returned_qty: calc.newReturnedQty, amount_due,
      status: amount_due <= 0 ? 'SETTLED' : 'PENDING', last_op: retRef.id, updated_at: serverTimestamp()
    });
    if (bill.kind === 'SALE' || bill.kind === 'PURCHASE') {
      const movKind: TallyMovementKind = bill.kind === 'SALE' ? 'SALE_RETURN' : 'PURCHASE_RETURN';
      const sign = bill.kind === 'SALE' ? 1 : -1;
      const refNo = bill.invoice_prefix ? `${bill.invoice_prefix}${bill.invoice_no}` : String(bill.invoice_no);
      const party = bill.party_id ? cache.rawParty(bill.party_id) : undefined;
      const partyName = party?.name ?? bill.party_name ?? 'Party';
      for (const l of p.lines) {
        if (l.qty <= 0) continue;
        const item = bill.items[l.index];
        const movRef = doc(col(shopId, 'stockMovements'));
        tx.set(movRef, {
          item_name: item.name,
          hsn_code: item.hsn_code ?? null,
          date: p.returned_on,
          kind: movKind,
          movement_type: movKind,
          qty: sign * l.qty,
          bill_id: p.bill_id,
          party_id: bill.party_id,
          party_name: partyName,
          ref_no: refNo,
          status: 'ACTIVE',
          created_at: serverTimestamp()
        });
      }
    }
    audit(tx, shopId, 'return', retRef.id, 'CREATE', { amount_due: bill.amount_due },
      { total_reduction: calc.totalReduction, amount_due });
  });
  return retRef.id;
}

// ---------------- Settings ----------------

export const DEFAULT_INVOICE: InvoiceSettings = {
  invoice_prefix: '', suggested_next_number: 1, date_format: 'DD/MM/YYYY', show_logo: true, show_gstin: true,
  show_tax_breakdown: true, invoice_footer: 'Thank you for your business.', terms_and_conditions: ''
};
export const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  push_notifications: true, in_app_notifications: true, due_reminders: true,
  reminder_lead_time_days: 3, daily_reminder_time: '08:00 IST'
};
export const DEFAULT_PREFERENCES: AppPreferences = {
  currency: 'INR', time_zone: 'Asia/Kolkata', date_format: 'DD/MM/YYYY', theme: 'system',
  language: 'en', default_landing_page: '/dashboard', item_hsn_map: {}
};

export async function getShopSettings(shopId: string): Promise<ShopSettingsData> {
  const [s, inv, notif, pref] = await Promise.all([
    getDoc(doc(db, 'shops', shopId)),
    getDoc(ref(shopId, 'settings', 'invoice')),
    getDoc(ref(shopId, 'settings', 'notifications')),
    getDoc(ref(shopId, 'settings', 'preferences'))
  ]);
  return {
    shop: shopFromDoc(s.id, s.data()!),
    invoice_settings: { ...DEFAULT_INVOICE, ...(inv.data() ?? {}) } as InvoiceSettings,
    notification_settings: { ...DEFAULT_NOTIFICATIONS, ...(notif.data() ?? {}) } as NotificationSettings,
    app_preferences: { ...DEFAULT_PREFERENCES, ...(pref.data() ?? {}) } as AppPreferences
  };
}

export async function saveSettings<T extends object>(shopId: string, docId: 'invoice' | 'notifications' | 'preferences', patch: Partial<T>) {
  await setDoc(ref(shopId, 'settings', docId), patch, { merge: true });
  return (await getShopSettings(shopId));
}

export async function updateShopProfile(shopId: string, payload: UpdateShopProfilePayload): Promise<Shop> {
  const s = await getDoc(doc(db, 'shops', shopId));
  const cur = s.data()!;
  if (payload.name !== undefined && payload.name.trim() !== cur.name) {
    throw new AppError('Changing the registered shop name needs admin review. Please contact support.',
      'NEEDS_REVIEW', { name: 'Needs admin review' }, 403);
  }
  const patch: Record<string, unknown> = { updated_at: serverTimestamp() };
  if (payload.owner_name !== undefined) patch.owner_name = payload.owner_name.trim();
  if (payload.phone !== undefined) {
    const ph = normalizePhone(payload.phone);
    if (!ph) throw new AppError('Enter a 10-digit mobile number', 'VALIDATION_ERROR', { phone: 'Invalid' });
    patch.phone = ph;
  }
  if (payload.email !== undefined) patch.email = payload.email.trim().toLowerCase();
  if (payload.address !== undefined) patch.address = payload.address.trim();
  if (payload.state !== undefined) patch.state = payload.state.trim();
  if (payload.pin_code !== undefined) patch.pin_code = payload.pin_code.trim();
  if (payload.logo_url !== undefined) patch.logo_url = payload.logo_url;
  await updateDoc(doc(db, 'shops', shopId), patch);
  const after = await getDoc(doc(db, 'shops', shopId));
  return shopFromDoc(after.id, after.data()!);
}

export async function updateGSTSettings(shopId: string, payload: UpdateGSTSettingsPayload): Promise<Shop> {
  const s = await getDoc(doc(db, 'shops', shopId));
  if (payload.gstin !== undefined && payload.gstin.trim().toUpperCase() !== s.data()!.gstin) {
    throw new AppError('Changing GSTIN needs admin review. Please contact support.', 'NEEDS_REVIEW', { gstin: 'Needs admin review' }, 403);
  }
  if (payload.default_gst_bp !== undefined) {
    // Only new bills use the new default; existing bills keep their snapshot.
    await updateDoc(doc(db, 'shops', shopId), { default_gst_bp: payload.default_gst_bp, updated_at: serverTimestamp() });
  }
  const after = await getDoc(doc(db, 'shops', shopId));
  return shopFromDoc(after.id, after.data()!);
}

// ---------------- Stock & Production ----------------

export async function recordStockMovement(shopId: string, payload: {
  item_name: string;
  movement_type: StockMovementType;
  qty: number;
  rate_paise?: number;
  date?: string;
  notes?: string | null;
}) {
  if (!payload.item_name?.trim()) throw new AppError('Item name is required', 'VALIDATION_ERROR', { item_name: 'Required' });
  if (!payload.qty || payload.qty <= 0) throw new AppError('Quantity must be greater than zero', 'VALIDATION_ERROR', { qty: 'Must be > 0' });

  const r = doc(col(shopId, 'stockMovements'));
  await setDoc(r, {
    item_name: payload.item_name.trim(),
    movement_type: payload.movement_type,
    qty: Math.floor(payload.qty),
    rate_paise: payload.rate_paise != null ? Math.floor(payload.rate_paise) : null,
    date: payload.date || todayIST(),
    notes: payload.notes?.trim() || null,
    created_at: serverTimestamp()
  });
  return r.id;
}

export async function createRawMaterial(shopId: string, payload: {
  name: string;
  unit?: string;
  unit_price_paise: number;
  low_stock_threshold_kg?: number;
}) {
  if (!payload.name?.trim()) throw new AppError('Material name is required', 'VALIDATION_ERROR', { name: 'Required' });
  if (payload.unit_price_paise < 0) throw new AppError('Unit price cannot be negative', 'VALIDATION_ERROR', { unit_price_paise: 'Invalid' });

  const r = doc(col(shopId, 'rawMaterials'));
  await setDoc(r, {
    name: payload.name.trim(),
    unit: payload.unit?.trim() || 'kg',
    unit_price_paise: Math.floor(payload.unit_price_paise),
    low_stock_threshold_kg: payload.low_stock_threshold_kg != null ? Number(payload.low_stock_threshold_kg) : 5,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp()
  });
  return r.id;
}

export async function updateRawMaterial(shopId: string, materialId: string, payload: Partial<{
  name: string;
  unit_price_paise: number;
  low_stock_threshold_kg: number;
}>) {
  const patch: Record<string, unknown> = { updated_at: serverTimestamp() };
  if (payload.name !== undefined) patch.name = payload.name.trim();
  if (payload.unit_price_paise !== undefined) patch.unit_price_paise = Math.floor(payload.unit_price_paise);
  if (payload.low_stock_threshold_kg !== undefined) patch.low_stock_threshold_kg = Number(payload.low_stock_threshold_kg);

  await updateDoc(ref(shopId, 'rawMaterials', materialId), patch);
}

export async function recordRawMaterialTx(shopId: string, payload: {
  material_id: string;
  tx_type: RawMaterialTxType;
  qty_kg: number;
  rate_per_kg_paise: number;
  weaver_id?: string | null;
  date?: string;
  ref_no?: string | null;
  notes?: string | null;
}) {
  if (!payload.material_id) throw new AppError('Material is required', 'VALIDATION_ERROR', { material_id: 'Required' });
  if (!payload.qty_kg || payload.qty_kg <= 0) throw new AppError('Quantity must be greater than zero', 'VALIDATION_ERROR', { qty_kg: 'Must be > 0' });

  const mat = cache.rawMaterials().find(m => m.id === payload.material_id);
  const total_amount_paise = Math.round(payload.qty_kg * payload.rate_per_kg_paise);

  const r = doc(col(shopId, 'rawMaterialTx'));
  await setDoc(r, {
    material_id: payload.material_id,
    material_name: mat?.name ?? 'Material',
    tx_type: payload.tx_type,
    qty_kg: payload.qty_kg,
    rate_per_kg_paise: Math.floor(payload.rate_per_kg_paise),
    total_amount_paise,
    weaver_id: payload.weaver_id || null,
    date: payload.date || todayIST(),
    ref_no: payload.ref_no?.trim() || null,
    notes: payload.notes?.trim() || null,
    created_at: serverTimestamp()
  });
  return r.id;
}

export async function createWeaver(shopId: string, payload: {
  name: string;
  phone: string;
  additional_phones?: string[];
  address: string;
  type: LoomType;
  looms_count: number;
  notes?: string | null;
}) {
  if (!payload.name?.trim()) throw new AppError('Weaver name is required', 'VALIDATION_ERROR', { name: 'Required' });
  const ph = normalizePhone(payload.phone);
  if (!ph) throw new AppError('Enter a 10-digit mobile number', 'VALIDATION_ERROR', { phone: '10-digit mobile required' });
  if (!payload.address?.trim()) throw new AppError('Address is required for weavers', 'VALIDATION_ERROR', { address: 'Required' });

  const extra: string[] = [];
  (payload.additional_phones || []).filter(x => x.trim()).forEach((x, i) => {
    const n = normalizePhone(x);
    if (n) extra.push(n);
  });

  const r = doc(col(shopId, 'weavers'));
  await setDoc(r, {
    name: payload.name.trim(),
    phone: ph,
    additional_phones: extra,
    address: payload.address.trim(),
    type: payload.type || 'HANDLOOM',
    looms_count: Math.max(1, Math.floor(payload.looms_count || 1)),
    notes: payload.notes?.trim() || null,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp()
  });
  return r.id;
}

export async function updateWeaver(shopId: string, weaverId: string, payload: Partial<{
  name: string;
  phone: string;
  additional_phones: string[];
  address: string;
  type: LoomType;
  looms_count: number;
  notes: string | null;
}>) {
  const patch: Record<string, unknown> = { updated_at: serverTimestamp() };
  if (payload.name !== undefined) {
    if (!payload.name.trim()) throw new AppError('Weaver name is required', 'VALIDATION_ERROR', { name: 'Required' });
    patch.name = payload.name.trim();
  }
  if (payload.phone !== undefined) {
    const ph = normalizePhone(payload.phone);
    if (!ph) throw new AppError('Enter a 10-digit mobile number', 'VALIDATION_ERROR', { phone: '10-digit mobile required' });
    patch.phone = ph;
  }
  if (payload.additional_phones !== undefined) {
    patch.additional_phones = payload.additional_phones.map(x => normalizePhone(x)).filter(Boolean);
  }
  if (payload.address !== undefined) {
    if (!payload.address.trim()) throw new AppError('Address is required for weavers', 'VALIDATION_ERROR', { address: 'Required' });
    patch.address = payload.address.trim();
  }
  if (payload.type !== undefined) patch.type = payload.type;
  if (payload.looms_count !== undefined) patch.looms_count = Math.max(1, Math.floor(payload.looms_count || 1));
  if (payload.notes !== undefined) patch.notes = payload.notes?.trim() || null;

  // Check if existing doc is in `weavers` collection or `parties` collection
  const existingWeaver = cache.weavers().find(w => w.id === weaverId);
  const isInParties = !cache.weavers().some(w => w.id === weaverId && (cache as any).raw.weavers.has(weaverId));

  if (isInParties) {
    // Migrate to `weavers` collection and delete from `parties`
    const r = doc(col(shopId, 'weavers'), weaverId);
    await setDoc(r, {
      name: existingWeaver?.name ?? '',
      phone: existingWeaver?.phone ?? '',
      additional_phones: existingWeaver?.additional_phones ?? [],
      address: existingWeaver?.address ?? '',
      type: existingWeaver?.type ?? 'HANDLOOM',
      looms_count: existingWeaver?.looms_count ?? 1,
      notes: existingWeaver?.notes ?? null,
      ...patch
    });
    try {
      await deleteDoc(ref(shopId, 'parties', weaverId));
    } catch { /* ignore if already gone */ }
  } else {
    await updateDoc(ref(shopId, 'weavers', weaverId), patch);
  }
}

export async function deleteWeaver(shopId: string, weaverId: string) {
  // Block delete when weaver has yarn or wage entries
  const hasYarn = cache.rawMaterialTx().some(t => t.weaver_id === weaverId);
  const hasWeaverTx = cache.weaverTx().some(t => t.weaver_id === weaverId);
  if (hasYarn || hasWeaverTx) {
    throw new AppError('Cannot delete this weaver: they have recorded yarn issues or wage transactions. Clear them before removing.', 'WEAVER_HAS_TRANSACTIONS', undefined, 400);
  }

  // Delete from weavers subcollection, and also cleanup from parties if it existed there
  try {
    await deleteDoc(ref(shopId, 'weavers', weaverId));
  } catch { /* ignore */ }
  try {
    await deleteDoc(ref(shopId, 'parties', weaverId));
  } catch { /* ignore */ }
}

export async function updateOwnLooms(shopId: string, payload: {
  handloom_running: number;
  handloom_idle: number;
  handloom_repair: number;
  powerloom_running: number;
  powerloom_idle: number;
  powerloom_repair: number;
}) {
  const r = ref(shopId, 'ownLooms', 'current');
  await setDoc(r, {
    handloom_running: Math.max(0, Math.floor(payload.handloom_running || 0)),
    handloom_idle: Math.max(0, Math.floor(payload.handloom_idle || 0)),
    handloom_repair: Math.max(0, Math.floor(payload.handloom_repair || 0)),
    powerloom_running: Math.max(0, Math.floor(payload.powerloom_running || 0)),
    powerloom_idle: Math.max(0, Math.floor(payload.powerloom_idle || 0)),
    powerloom_repair: Math.max(0, Math.floor(payload.powerloom_repair || 0)),
    updated_at: serverTimestamp()
  }, { merge: true });
}

export async function recordWeaverTx(shopId: string, payload: {
  weaver_id: string;
  action_type: WeaverTxType;
  date?: string;
  material_id?: string | null;
  qty_kg?: number;
  unit_price_paise?: number;
  finished_item_name?: string;
  sarees_count?: number;
  wastage_kg?: number;
  wage_amount_paise?: number;
  payment_amount_paise?: number;
  payment_mode?: 'CASH' | 'CHEQUE' | 'NEFT' | 'UPI';
  notes?: string | null;
}) {
  if (!payload.weaver_id) throw new AppError('Weaver is required', 'VALIDATION_ERROR', { weaver_id: 'Required' });

  const w = cache.weavers().find(x => x.id === payload.weaver_id);
  const data: Record<string, unknown> = {
    weaver_id: payload.weaver_id,
    weaver_name: w?.name ?? 'Weaver',
    action_type: payload.action_type,
    date: payload.date || todayIST(),
    notes: payload.notes?.trim() || null,
    created_at: serverTimestamp()
  };

  if (payload.action_type === 'ISSUE') {
    if (!payload.material_id) throw new AppError('Material is required for issue', 'VALIDATION_ERROR', { material_id: 'Required' });
    if (!payload.qty_kg || payload.qty_kg <= 0) throw new AppError('Quantity must be > 0', 'VALIDATION_ERROR', { qty_kg: 'Must be > 0' });
    const mat = cache.rawMaterials().find(m => m.id === payload.material_id);
    const unitPrice = payload.unit_price_paise != null ? Math.floor(payload.unit_price_paise) : (mat?.unit_price_paise ?? 0);
    data.material_id = payload.material_id;
    data.material_name = mat?.name ?? 'Material';
    data.qty_kg = payload.qty_kg;
    data.unit_price_paise = unitPrice;
    data.total_material_paise = Math.round(payload.qty_kg * unitPrice);

    // Also mirror to rawMaterialTx as ISSUE_WEAVER
    await recordRawMaterialTx(shopId, {
      material_id: payload.material_id,
      tx_type: 'ISSUE_WEAVER',
      qty_kg: payload.qty_kg,
      rate_per_kg_paise: unitPrice,
      weaver_id: payload.weaver_id,
      date: payload.date,
      notes: payload.notes
    });
  } else if (payload.action_type === 'RECEIVE') {
    if (!payload.sarees_count || payload.sarees_count <= 0) throw new AppError('Sarees count must be > 0', 'VALIDATION_ERROR', { sarees_count: 'Must be > 0' });
    data.finished_item_name = payload.finished_item_name?.trim() || 'Silk Saree';
    data.sarees_count = Math.floor(payload.sarees_count);
    data.wastage_kg = payload.wastage_kg != null ? Number(payload.wastage_kg) : 0;
    data.wage_amount_paise = payload.wage_amount_paise != null ? Math.floor(payload.wage_amount_paise) : 0;
  } else if (payload.action_type === 'WAGE_PAYMENT') {
    if (!payload.payment_amount_paise || payload.payment_amount_paise <= 0) throw new AppError('Payment amount must be > 0', 'VALIDATION_ERROR', { payment_amount_paise: 'Must be > 0' });
    data.payment_amount_paise = Math.floor(payload.payment_amount_paise);
    data.payment_mode = payload.payment_mode || 'CASH';
  }

  const r = doc(col(shopId, 'weaverTx'));
  await setDoc(r, data);
  return r.id;
}

export async function createStaff(shopId: string, payload: {
  name: string;
  role: string;
  phone: string;
  wage_type: StaffWageType;
  wage_amount_paise: number;
  joining_date?: string;
}) {
  if (!payload.name?.trim()) throw new AppError('Staff name is required', 'VALIDATION_ERROR', { name: 'Required' });

  const r = doc(col(shopId, 'staff'));
  await setDoc(r, {
    name: payload.name.trim(),
    role: payload.role?.trim() || 'Staff',
    phone: payload.phone?.trim() || '',
    wage_type: payload.wage_type || 'MONTHLY',
    wage_amount_paise: Math.max(0, Math.floor(payload.wage_amount_paise || 0)),
    joining_date: payload.joining_date || todayIST(),
    status: 'ACTIVE',
    created_at: serverTimestamp(),
    updated_at: serverTimestamp()
  });
  return r.id;
}

export async function updateStaff(shopId: string, staffId: string, payload: Partial<{
  name: string;
  role: string;
  phone: string;
  wage_type: StaffWageType;
  wage_amount_paise: number;
  status: 'ACTIVE' | 'INACTIVE';
}>) {
  const patch: Record<string, unknown> = { updated_at: serverTimestamp() };
  if (payload.name !== undefined) patch.name = payload.name.trim();
  if (payload.role !== undefined) patch.role = payload.role.trim();
  if (payload.phone !== undefined) patch.phone = payload.phone.trim();
  if (payload.wage_type !== undefined) patch.wage_type = payload.wage_type;
  if (payload.wage_amount_paise !== undefined) patch.wage_amount_paise = Math.floor(payload.wage_amount_paise);
  if (payload.status !== undefined) patch.status = payload.status;

  await updateDoc(ref(shopId, 'staff', staffId), patch);
}

export async function recordStaffRecord(shopId: string, payload: {
  staff_id: string;
  record_type: StaffRecordType;
  date?: string;
  attendance_status?: 'PRESENT' | 'ABSENT' | 'HALF_DAY';
  amount_paise?: number;
  notes?: string | null;
}) {
  if (!payload.staff_id) throw new AppError('Staff is required', 'VALIDATION_ERROR', { staff_id: 'Required' });
  const s = cache.staff().find(x => x.id === payload.staff_id);

  const r = doc(col(shopId, 'staffRecords'));
  await setDoc(r, {
    staff_id: payload.staff_id,
    staff_name: s?.name ?? 'Staff',
    record_type: payload.record_type,
    date: payload.date || todayIST(),
    attendance_status: payload.attendance_status ?? null,
    amount_paise: payload.amount_paise != null ? Math.floor(payload.amount_paise) : null,
    notes: payload.notes?.trim() || null,
    created_at: serverTimestamp()
  });
  return r.id;
}

export async function createPolishingBatch(shopId: string, payload: {
  person_name: string;
  item_name: string;
  sarees_sent: number;
  unit_price_paise: number;
  sent_date?: string;
  notes?: string | null;
}) {
  if (!payload.person_name?.trim()) throw new AppError('Person name is required', 'VALIDATION_ERROR', { person_name: 'Required' });
  if (!payload.sarees_sent || payload.sarees_sent <= 0) throw new AppError('Number of sarees must be > 0', 'VALIDATION_ERROR', { sarees_sent: 'Must be > 0' });

  const total_amount_paise = Math.round(payload.sarees_sent * payload.unit_price_paise);
  const r = doc(col(shopId, 'polishing'));
  await setDoc(r, {
    person_name: payload.person_name.trim(),
    item_name: payload.item_name?.trim() || 'Silk Saree',
    sarees_sent: Math.floor(payload.sarees_sent),
    sarees_received: 0,
    unit_price_paise: Math.floor(payload.unit_price_paise),
    total_amount_paise,
    sent_date: payload.sent_date || todayIST(),
    received_date: null,
    status: 'PENDING',
    notes: payload.notes?.trim() || null,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp()
  });
  return r.id;
}

export async function updatePolishingBatch(shopId: string, batchId: string, payload: {
  sarees_received: number;
  received_date?: string;
  notes?: string | null;
}) {
  const cur = cache.polishing().find(p => p.id === batchId);
  if (!cur) throw new AppError('Polishing batch not found', 'NOT_FOUND');

  const newReceived = Math.min(cur.sarees_sent, Math.max(0, Math.floor(payload.sarees_received)));
  const status: PolishingStatus = newReceived >= cur.sarees_sent ? 'RECEIVED' : (newReceived > 0 ? 'PARTIAL' : 'PENDING');

  await updateDoc(ref(shopId, 'polishing', batchId), {
    sarees_received: newReceived,
    received_date: payload.received_date || (newReceived > 0 ? todayIST() : null),
    status,
    notes: payload.notes !== undefined ? (payload.notes?.trim() || null) : cur.notes,
    updated_at: serverTimestamp()
  });
}

export async function postStockCount(shopId: string, payload: {
  hsn_code: string;
  item_name?: string;
  counted_qty: number;
  book_balance: number;
  date?: string;
  notes?: string | null;
}) {
  const hsn = payload.hsn_code.trim() || 'UNSPECIFIED';
  const counted = Math.floor(payload.counted_qty);
  if (counted < 0) throw new AppError('Counted quantity cannot be negative', 'VALIDATION_ERROR', { counted_qty: 'Invalid' });
  const date = payload.date || todayIST();
  const diff = counted - Math.floor(payload.book_balance);
  const batch = writeBatch(db);
  batch.set(doc(col(shopId, 'stockMovements')), {
    item_name: payload.item_name?.trim() || `HSN ${hsn}`,
    hsn_code: hsn,
    date,
    kind: 'COUNT_SNAPSHOT',
    movement_type: 'COUNT_SNAPSHOT',
    qty: 0,
    counted_qty: counted,
    created_at: serverTimestamp()
  });
  if (diff !== 0) {
    batch.set(doc(col(shopId, 'stockMovements')), {
      item_name: payload.item_name?.trim() || `HSN ${hsn}`,
      hsn_code: hsn === 'UNSPECIFIED' ? null : hsn,
      date,
      kind: 'COUNT_ADJUST',
      movement_type: 'ADJUSTMENT',
      qty: diff,
      notes: payload.notes?.trim() || `Physical count variance (${diff > 0 ? '+' : ''}${diff})`,
      created_at: serverTimestamp()
    });
  }
  await batch.commit();
}

export async function postStockAdjust(shopId: string, payload: {
  item_name: string;
  hsn_code?: string | null;
  kind: TallyMovementKind;
  qty: number;
  date?: string;
  notes?: string | null;
}) {
  if (!payload.item_name?.trim()) throw new AppError('Item name is required', 'VALIDATION_ERROR', { item_name: 'Required' });
  if (!Number.isInteger(payload.qty) || payload.qty === 0) throw new AppError('Quantity must be non-zero', 'VALIDATION_ERROR', { qty: 'Non-zero integer required' });
  const r = doc(col(shopId, 'stockMovements'));
  await setDoc(r, {
    item_name: payload.item_name.trim(),
    hsn_code: payload.hsn_code?.trim() || null,
    date: payload.date || todayIST(),
    kind: payload.kind,
    movement_type: payload.kind,
    qty: payload.qty,
    notes: payload.notes?.trim() || null,
    created_at: serverTimestamp()
  });
  return r.id;
}

export async function givePolish(shop: Shop, payload: {
  date?: string;
  party_id?: string | null;
  person_name: string;
  item_name: string;
  hsn_code?: string | null;
  qty: number;
  unit_price_paise: number;
  create_job_work_bill?: boolean;
  notes?: string | null;
}) {
  const qty = Math.floor(payload.qty);
  const unit = Math.floor(payload.unit_price_paise);
  if (!payload.person_name?.trim()) throw new AppError('Polisher name is required', 'VALIDATION_ERROR', { person_name: 'Required' });
  if (!(qty > 0)) throw new AppError('Number of sarees must be > 0', 'VALIDATION_ERROR', { qty: 'Must be > 0' });
  if (unit < 0) throw new AppError('Unit price cannot be negative', 'VALIDATION_ERROR', { unit_price_paise: 'Invalid' });

  const date = payload.date || todayIST();
  const total_paise = qty * unit;
  let bill_id: string | null = null;

  if (payload.create_job_work_bill && payload.party_id) {
    const created = await createBill(shop, {
      kind: 'JOB_WORK',
      party_id: payload.party_id,
      invoice_no: `JW-${Date.now().toString().slice(-6)}`,
      bill_date: date,
      gst_bp: 0,
      items: [{ name: `${payload.item_name.trim()} (Polish)`, qty, rate: unit, hsn_code: null }],
      notes: payload.notes?.trim() || 'Polishing job work',
      source: 'MANUAL'
    });
    bill_id = created.id;
  }

  const r = doc(col(shop.id, 'polishing'));
  const batch = writeBatch(db);
  batch.set(r, {
    party_id: payload.party_id ?? null,
    person_name: payload.person_name.trim(),
    item_name: payload.item_name.trim() || 'Silk Saree',
    hsn_code: payload.hsn_code?.trim() || null,
    sarees_sent: qty,
    sarees_received: 0,
    unit_price_paise: unit,
    total_amount_paise: total_paise,
    sent_date: date,
    received_date: null,
    status: 'PENDING',
    bill_id,
    notes: payload.notes?.trim() || null,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp()
  });
  batch.set(doc(col(shop.id, 'stockMovements')), {
    item_name: payload.item_name.trim() || 'Silk Saree',
    hsn_code: payload.hsn_code?.trim() || null,
    date,
    kind: 'POLISH_OUT',
    movement_type: 'POLISH_OUT',
    qty: -qty,
    party_id: payload.party_id ?? null,
    bill_id,
    created_at: serverTimestamp()
  });
  await batch.commit();
  return { id: r.id, bill_id };
}

export async function receivePolish(shopId: string, batchId: string, payload: {
  receive_qty: number;
  received_date?: string;
  notes?: string | null;
}) {
  const raw = cache.rawPolishing().find(p => p.id === batchId);
  if (!raw) throw new AppError('Polishing entry not found', 'NOT_FOUND', undefined, 404);
  const sent = Number(raw.sarees_sent ?? 0);
  const already = Number(raw.sarees_received ?? 0);
  const err = validatePolishReceive(sent, already, Math.floor(payload.receive_qty));
  if (err) throw new AppError(err, 'VALIDATION_ERROR', { receive_qty: err });

  const receiveNow = Math.floor(payload.receive_qty);
  const newReceived = already + receiveNow;
  const status: PolishingStatus = newReceived >= sent ? 'RECEIVED' : 'PARTIAL';
  const date = payload.received_date || todayIST();

  const batch = writeBatch(db);
  batch.update(ref(shopId, 'polishing', batchId), {
    sarees_received: newReceived,
    received_date: date,
    status,
    notes: payload.notes !== undefined ? (payload.notes?.trim() || null) : (raw.notes ?? null),
    updated_at: serverTimestamp()
  });
  batch.set(doc(col(shopId, 'stockMovements')), {
    item_name: raw.item_name || 'Silk Saree',
    hsn_code: raw.hsn_code ?? null,
    date,
    kind: 'POLISH_IN',
    movement_type: 'POLISH_IN',
    qty: receiveNow,
    party_id: raw.party_id ?? null,
    created_at: serverTimestamp()
  });
  await batch.commit();
}

// ---------------- Stock Rework: Void, Edit, Raw Yarn, Looms, Polishing Payments ----------------

export async function voidStockMovement(
  shopId: string,
  movementId: string,
  reason: string,
  overrideNegative = false
) {
  if (!reason?.trim()) throw new AppError('Void reason is required', 'VALIDATION_ERROR', { reason: 'Required' });
  const raw = cache.rawStockMovements().find(m => m.id === movementId);
  if (!raw) throw new AppError('Stock entry not found', 'NOT_FOUND', undefined, 404);
  if (raw.bill_id || raw.source_id) {
    throw new AppError('This entry was created by another document. Void it from the source document.', 'SOURCE_LINKED', undefined, 409);
  }

  const targetKey = String(raw.item_name ?? '').trim().toLowerCase();
  if (!overrideNegative) {
    const entries = cache.rawStockMovements()
      .filter(m => String(m.item_name ?? '').trim().toLowerCase() === targetKey && m.kind !== 'COUNT_SNAPSHOT')
      .map(m => ({
        id: m.id,
        date: String(m.date ?? ''),
        qty: Number(m.qty ?? 0),
        status: (m.status === 'VOID' ? 'VOID' : 'ACTIVE') as 'ACTIVE' | 'VOID'
      }));
    const conflict = wouldVoidCauseNegative(entries, movementId);
    if (conflict) {
      throw new AppError(
        `Voiding would push stock to ${conflict.balanceAfter} on ${conflict.date}. Override with reason if intentional.`,
        'NEGATIVE_STOCK_BLOCK',
        { balance: String(conflict.balanceAfter), date: conflict.date },
        409
      );
    }
  }

  const batch = writeBatch(db);
  batch.update(ref(shopId, 'stockMovements', movementId), {
    status: 'VOID',
    voided_by: auth.currentUser?.uid ?? null,
    voided_at: serverTimestamp(),
    void_reason: reason.trim(),
    updated_at: serverTimestamp()
  });
  audit(batch, shopId, 'stock_movement', movementId, 'VOID', raw, { status: 'VOID', void_reason: reason.trim() });
  await batch.commit();
}

export async function editStockMovement(
  shopId: string,
  movementId: string,
  patch: { date?: string; qty?: number; notes?: string | null; rate_paise?: number }
) {
  const raw = cache.rawStockMovements().find(m => m.id === movementId);
  if (!raw) throw new AppError('Stock entry not found', 'NOT_FOUND', undefined, 404);
  const next: Record<string, unknown> = { updated_at: serverTimestamp() };
  if (patch.date !== undefined) next.date = patch.date;
  if (patch.qty !== undefined) {
    if (!Number.isInteger(patch.qty) || patch.qty === 0) {
      throw new AppError('Quantity must be a non-zero integer', 'VALIDATION_ERROR', { qty: 'Invalid' });
    }
    next.qty = patch.qty;
  }
  if (patch.notes !== undefined) next.notes = patch.notes?.trim() || null;
  if (patch.rate_paise !== undefined) next.rate_paise = Math.floor(patch.rate_paise);

  const batch = writeBatch(db);
  batch.update(ref(shopId, 'stockMovements', movementId), next);
  audit(batch, shopId, 'stock_movement', movementId, 'EDIT', raw, next);
  await batch.commit();
}

export async function addRawStockPurchase(
  shop: Shop,
  payload: {
    date: string;
    material_id: string;
    supplier_id?: string | null;
    qty_kg: number;
    rate_per_kg_paise: number;
    bill_no?: string | null;
    create_payable_bill?: boolean;
    notes?: string | null;
  }
) {
  if (!(payload.qty_kg > 0)) throw new AppError('Quantity must be > 0', 'VALIDATION_ERROR', { qty_kg: 'Must be > 0' });
  const totalAmount = Math.round(payload.qty_kg * payload.rate_per_kg_paise);
  let billId: string | null = null;
  if (payload.create_payable_bill && payload.supplier_id) {
    const mat = cache.rawMaterials().find(m => m.id === payload.material_id);
    const created = await createBill(shop, {
      kind: 'PURCHASE',
      party_id: payload.supplier_id,
      invoice_no: payload.bill_no?.trim() || `RM-${Date.now().toString().slice(-6)}`,
      bill_date: payload.date,
      gst_bp: 0,
      items: [{
        name: mat?.name ?? 'Raw Yarn',
        qty: Math.max(1, Math.round(payload.qty_kg)),
        rate: Math.round(totalAmount / Math.max(1, Math.round(payload.qty_kg))),
        hsn_code: null
      }],
      notes: payload.notes?.trim() || 'Raw material purchase',
      source: 'MANUAL'
    });
    billId = created.id;
  }

  const r = doc(col(shop.id, 'rawMaterialTx'));
  const batch = writeBatch(db);
  batch.set(r, {
    material_id: payload.material_id,
    tx_type: 'PURCHASE',
    qty_kg: payload.qty_kg,
    rate_per_kg_paise: Math.floor(payload.rate_per_kg_paise),
    total_amount_paise: totalAmount,
    party_id: payload.supplier_id ?? null,
    ref_no: payload.bill_no?.trim() || null,
    bill_id: billId,
    date: payload.date || todayIST(),
    notes: payload.notes?.trim() || null,
    status: 'ACTIVE',
    created_by: auth.currentUser?.uid ?? null,
    created_at: serverTimestamp()
  });
  audit(batch, shop.id, 'raw_movement', r.id, 'CREATE', null, { tx_type: 'PURCHASE', qty_kg: payload.qty_kg });
  await batch.commit();
  return r.id;
}

export async function sellRawMaterial(
  shop: Shop,
  payload: {
    date: string;
    party_id: string;
    material_id: string;
    qty_kg: number;
    rate_per_kg_paise: number;
    create_sale_bill?: boolean;
    notes?: string | null;
  }
) {
  if (!payload.party_id) throw new AppError('Buyer is required', 'VALIDATION_ERROR', { party_id: 'Required' });
  if (!(payload.qty_kg > 0)) throw new AppError('Quantity must be > 0', 'VALIDATION_ERROR', { qty_kg: 'Must be > 0' });
  const totalAmount = Math.round(payload.qty_kg * payload.rate_per_kg_paise);
  const mat = cache.rawMaterials().find(m => m.id === payload.material_id);

  let billId: string | null = null;
  if (payload.create_sale_bill) {
    const created = await createBill(shop, {
      kind: 'SALE',
      party_id: payload.party_id,
      invoice_no: String(nextSaleInvoiceNo()),
      bill_date: payload.date,
      gst_bp: 0,
      items: [{
        name: `${mat?.name ?? 'Yarn'} (${payload.qty_kg} kg)`,
        qty: Math.max(1, Math.round(payload.qty_kg)),
        rate: Math.round(totalAmount / Math.max(1, Math.round(payload.qty_kg))),
        hsn_code: null
      }],
      notes: payload.notes?.trim() || 'Yarn sale',
      source: 'MANUAL'
    });
    billId = created.id;
  }

  const r = doc(col(shop.id, 'rawMaterialTx'));
  const batch = writeBatch(db);
  batch.set(r, {
    material_id: payload.material_id,
    tx_type: 'SOLD',
    qty_kg: payload.qty_kg,
    rate_per_kg_paise: Math.floor(payload.rate_per_kg_paise),
    total_amount_paise: totalAmount,
    party_id: payload.party_id,
    bill_id: billId,
    date: payload.date || todayIST(),
    notes: payload.notes?.trim() || null,
    status: 'ACTIVE',
    created_by: auth.currentUser?.uid ?? null,
    created_at: serverTimestamp()
  });
  audit(batch, shop.id, 'raw_movement', r.id, 'CREATE', null, { tx_type: 'SOLD', qty_kg: payload.qty_kg });
  await batch.commit();
  return r.id;
}

export async function voidRawMaterialTx(shopId: string, txId: string, reason: string) {
  if (!reason?.trim()) throw new AppError('Void reason is required', 'VALIDATION_ERROR', { reason: 'Required' });
  const cur = cache.rawMaterialTx().find(t => t.id === txId);
  if (!cur) throw new AppError('Raw material movement not found', 'NOT_FOUND', undefined, 404);
  const batch = writeBatch(db);
  batch.update(ref(shopId, 'rawMaterialTx', txId), {
    status: 'VOID',
    voided_by: auth.currentUser?.uid ?? null,
    voided_at: serverTimestamp(),
    void_reason: reason.trim()
  });
  audit(batch, shopId, 'raw_movement', txId, 'VOID', cur, { status: 'VOID', void_reason: reason.trim() });
  await batch.commit();
}

export async function editRawMaterialTx(
  shopId: string,
  txId: string,
  patch: { date?: string; qty_kg?: number; rate_per_kg_paise?: number; notes?: string | null }
) {
  const cur = cache.rawMaterialTx().find(t => t.id === txId);
  if (!cur) throw new AppError('Raw material movement not found', 'NOT_FOUND', undefined, 404);
  const qty = patch.qty_kg ?? cur.qty_kg;
  const rate = patch.rate_per_kg_paise ?? cur.rate_per_kg_paise;
  const next: Record<string, unknown> = {
    qty_kg: qty,
    rate_per_kg_paise: Math.floor(rate),
    total_amount_paise: Math.round(qty * rate),
    updated_at: serverTimestamp()
  };
  if (patch.date !== undefined) next.date = patch.date;
  if (patch.notes !== undefined) next.notes = patch.notes?.trim() || null;

  const batch = writeBatch(db);
  batch.update(ref(shopId, 'rawMaterialTx', txId), next);
  audit(batch, shopId, 'raw_movement', txId, 'EDIT', cur, next);
  await batch.commit();
}

export async function issueYarnToWeaver(
  shopId: string,
  payload: {
    weaver_id: string;
    material_id: string;
    qty_kg: number;
    mode: 'JOBWORK' | 'SOLD';
    rate_per_kg_paise?: number;
    date?: string;
    notes?: string | null;
  }
) {
  if (!(payload.qty_kg > 0)) throw new AppError('Quantity must be > 0', 'VALIDATION_ERROR', { qty_kg: 'Must be > 0' });
  const date = payload.date || todayIST();
  const rate = Math.floor(payload.rate_per_kg_paise ?? 0);
  const totalAmount = Math.round(payload.qty_kg * rate);
  const w = cache.weavers().find(x => x.id === payload.weaver_id);
  const mat = cache.rawMaterials().find(m => m.id === payload.material_id);

  const rawRef = doc(col(shopId, 'rawMaterialTx'));
  const wRef = doc(col(shopId, 'weaverTx'));
  const batch = writeBatch(db);

  batch.set(rawRef, {
    material_id: payload.material_id,
    material_name: mat?.name ?? 'Yarn',
    tx_type: payload.mode === 'SOLD' ? 'SOLD' : 'ISSUE_WEAVER',
    qty_kg: payload.qty_kg,
    rate_per_kg_paise: rate,
    total_amount_paise: totalAmount,
    weaver_id: payload.weaver_id,
    weaver_name: w?.name ?? 'Weaver',
    date,
    notes: payload.notes?.trim() || null,
    status: 'ACTIVE',
    source_type: 'WEAVER_ISSUE',
    source_id: wRef.id,
    created_by: auth.currentUser?.uid ?? null,
    created_at: serverTimestamp()
  });

  batch.set(wRef, {
    weaver_id: payload.weaver_id,
    weaver_name: w?.name ?? 'Weaver',
    action_type: payload.mode === 'SOLD' ? 'YARN_SOLD' : 'ISSUE',
    material_id: payload.material_id,
    material_name: mat?.name ?? 'Yarn',
    qty_kg: payload.qty_kg,
    rate_per_kg_paise: rate,
    payment_amount_paise: payload.mode === 'SOLD' ? totalAmount : 0,
    date,
    notes: payload.notes?.trim() || null,
    status: 'ACTIVE',
    created_by: auth.currentUser?.uid ?? null,
    created_at: serverTimestamp()
  });

  audit(batch, shopId, 'weaver_tx', wRef.id, 'CREATE', null, { mode: payload.mode, qty_kg: payload.qty_kg });
  await batch.commit();
  return wRef.id;
}

export async function receiveSareesFromWeaver(
  shopId: string,
  payload: {
    weaver_id: string;
    finished_item_name: string;
    sarees_count: number;
    wastage_kg?: number;
    leftover_kg?: number;
    material_id?: string | null;
    wage_amount_paise: number;
    date?: string;
    notes?: string | null;
  }
) {
  if (!(payload.sarees_count > 0)) throw new AppError('Sarees count must be > 0', 'VALIDATION_ERROR', { sarees_count: 'Must be > 0' });
  const date = payload.date || todayIST();
  const w = cache.weavers().find(x => x.id === payload.weaver_id);
  const wRef = doc(col(shopId, 'weaverTx'));
  const smRef = doc(col(shopId, 'stockMovements'));
  const batch = writeBatch(db);

  batch.set(wRef, {
    weaver_id: payload.weaver_id,
    weaver_name: w?.name ?? 'Weaver',
    action_type: 'RECEIVE',
    finished_item_name: payload.finished_item_name.trim(),
    sarees_count: Math.floor(payload.sarees_count),
    wastage_kg: payload.wastage_kg ?? 0,
    leftover_kg: payload.leftover_kg ?? 0,
    wage_amount_paise: Math.floor(payload.wage_amount_paise),
    date,
    notes: payload.notes?.trim() || null,
    status: 'ACTIVE',
    created_by: auth.currentUser?.uid ?? null,
    created_at: serverTimestamp()
  });

  batch.set(smRef, {
    item_name: payload.finished_item_name.trim(),
    movement_type: 'PRODUCTION',
    kind: 'PRODUCTION',
    qty: Math.floor(payload.sarees_count),
    date,
    source_type: 'WEAVER_RECEIVE',
    source_id: wRef.id,
    party_id: payload.weaver_id,
    notes: `From weaver ${w?.name ?? ''}`.trim(),
    status: 'ACTIVE',
    created_at: serverTimestamp()
  });

  if ((payload.leftover_kg ?? 0) > 0 && payload.material_id) {
    batch.set(doc(col(shopId, 'rawMaterialTx')), {
      material_id: payload.material_id,
      tx_type: 'RETURN',
      qty_kg: payload.leftover_kg,
      rate_per_kg_paise: 0,
      total_amount_paise: 0,
      weaver_id: payload.weaver_id,
      date,
      source_type: 'WEAVER_RECEIVE',
      source_id: wRef.id,
      status: 'ACTIVE',
      created_at: serverTimestamp()
    });
  }

  audit(batch, shopId, 'weaver_tx', wRef.id, 'CREATE', null, { sarees_count: payload.sarees_count });
  await batch.commit();
  return wRef.id;
}

export async function voidWeaverTx(shopId: string, txId: string, reason: string) {
  if (!reason?.trim()) throw new AppError('Void reason is required', 'VALIDATION_ERROR', { reason: 'Required' });
  const batch = writeBatch(db);
  batch.update(ref(shopId, 'weaverTx', txId), {
    status: 'VOID',
    voided_by: auth.currentUser?.uid ?? null,
    voided_at: serverTimestamp(),
    void_reason: reason.trim()
  });
  // Also void any linked stockMovements or rawMaterialTx with source_id === txId
  for (const sm of cache.rawStockMovements()) {
    if (sm.source_id === txId) {
      batch.update(ref(shopId, 'stockMovements', sm.id), {
        status: 'VOID',
        voided_by: auth.currentUser?.uid ?? null,
        voided_at: serverTimestamp(),
        void_reason: reason.trim()
      });
    }
  }
  for (const rtx of cache.rawMaterialTx()) {
    if ((rtx as any).source_id === txId) {
      batch.update(ref(shopId, 'rawMaterialTx', rtx.id), {
        status: 'VOID',
        voided_by: auth.currentUser?.uid ?? null,
        voided_at: serverTimestamp(),
        void_reason: reason.trim()
      });
    }
  }
  audit(batch, shopId, 'weaver_tx', txId, 'VOID', null, { status: 'VOID', void_reason: reason.trim() });
  await batch.commit();
}

export async function saveOwnLoomsList(
  shopId: string,
  looms: Array<{ id: string; loom_no: string; loom_type: LoomType; status: 'RUNNING' | 'IDLE' | 'REPAIR'; assigned_worker?: string | null }>
) {
  const counts = {
    handloom_running: looms.filter(l => l.loom_type === 'HANDLOOM' && l.status === 'RUNNING').length,
    handloom_idle: looms.filter(l => l.loom_type === 'HANDLOOM' && l.status === 'IDLE').length,
    handloom_repair: looms.filter(l => l.loom_type === 'HANDLOOM' && l.status === 'REPAIR').length,
    powerloom_running: looms.filter(l => l.loom_type === 'POWERLOOM' && l.status === 'RUNNING').length,
    powerloom_idle: looms.filter(l => l.loom_type === 'POWERLOOM' && l.status === 'IDLE').length,
    powerloom_repair: looms.filter(l => l.loom_type === 'POWERLOOM' && l.status === 'REPAIR').length
  };
  await setDoc(ref(shopId, 'ownLooms', 'register'), {
    ...counts,
    looms,
    updated_at: serverTimestamp()
  });
}

export async function recordPolishPayment(
  shopId: string,
  payload: {
    person_name: string;
    party_id?: string | null;
    amount_paise: number;
    date?: string;
    mode: string;
    is_advance?: boolean;
    notes?: string | null;
  }
) {
  if (!payload.person_name?.trim()) throw new AppError('Person name is required', 'VALIDATION_ERROR', { person_name: 'Required' });
  if (!(payload.amount_paise > 0)) throw new AppError('Amount must be > 0', 'VALIDATION_ERROR', { amount_paise: 'Must be > 0' });
  const r = doc(col(shopId, 'polishing'));
  const batch = writeBatch(db);
  batch.set(r, {
    entry_kind: 'PAYMENT',
    person_name: payload.person_name.trim(),
    party_id: payload.party_id ?? null,
    amount_paise: Math.floor(payload.amount_paise),
    sent_date: payload.date || todayIST(),
    payment_mode: payload.mode || 'CASH',
    is_advance: Boolean(payload.is_advance),
    notes: payload.notes?.trim() || null,
    status: 'ACTIVE',
    created_by: auth.currentUser?.uid ?? null,
    created_at: serverTimestamp()
  });
  audit(batch, shopId, 'polish_payment', r.id, 'CREATE', null, { person_name: payload.person_name, amount_paise: payload.amount_paise });
  await batch.commit();
  return r.id;
}

export async function voidPolishingEntry(shopId: string, id: string, reason: string) {
  if (!reason?.trim()) throw new AppError('Void reason is required', 'VALIDATION_ERROR', { reason: 'Required' });
  const raw = cache.rawPolishing();
  const cur = raw.find(p => p.id === id);
  if (!cur) throw new AppError('Polishing entry not found', 'NOT_FOUND', undefined, 404);

  // Block voiding if this entry has allocated payments
  const batches = raw
    .filter(p => p.entry_kind !== 'PAYMENT')
    .map(p => ({
      id: p.id,
      shop_id: shopId,
      person_name: String(p.person_name ?? ''),
      party_id: p.party_id ?? null,
      sent_date: String(p.sent_date ?? ''),
      sarees_sent: Number(p.sarees_sent ?? 0),
      sarees_received: Number(p.sarees_received ?? 0),
      unit_price_paise: Number(p.unit_price_paise ?? 0),
      status: (p.record_status === 'VOID' ? 'VOID' : 'ACTIVE') as 'ACTIVE' | 'VOID'
    }));
  const payments = raw
    .filter(p => p.entry_kind === 'PAYMENT')
    .map(p => ({
      id: p.id,
      shop_id: shopId,
      person_name: String(p.person_name ?? ''),
      party_id: p.party_id ?? null,
      date: String(p.sent_date ?? ''),
      amount_paise: Number(p.amount_paise ?? 0),
      status: (p.record_status === 'VOID' ? 'VOID' : 'ACTIVE') as 'ACTIVE' | 'VOID'
    }));
  const allocated = allocatePolishPayments({ shopId, batches, payments });
  const target = allocated.entries.find(e => e.id === id);
  if (target && target.paid_paise > 0) {
    throw new AppError('Cannot void: this entry has payments recorded.', 'HAS_PAYMENTS', undefined, 409);
  }

  const batch = writeBatch(db);
  batch.update(ref(shopId, 'polishing', id), {
    record_status: 'VOID',
    voided_by: auth.currentUser?.uid ?? null,
    voided_at: serverTimestamp(),
    void_reason: reason.trim()
  });
  audit(batch, shopId, 'polishing', id, 'VOID', cur, { record_status: 'VOID', void_reason: reason.trim() });
  await batch.commit();
}

/** Merge duplicate stock item names into a single canonical target item across movements, bills, and polishing. */
export async function mergeStockItems(shopId: string, sourceItemName: string, targetItemName: string) {
  const src = sourceItemName.trim();
  const dst = targetItemName.trim();
  if (!src || !dst) throw new AppError('Both source and target item names are required', 'VALIDATION_ERROR');
  const srcKey = src.toLowerCase();
  if (srcKey === dst.toLowerCase()) {
    throw new AppError('Source and target items must be different', 'VALIDATION_ERROR');
  }

  let batch = writeBatch(db);
  let ops = 0;
  let movementsUpdated = 0;
  let billsUpdated = 0;
  let polishingUpdated = 0;

  const flushIfNeeded = async () => {
    if (ops >= 400) {
      await batch.commit();
      batch = writeBatch(db);
      ops = 0;
    }
  };

  for (const m of cache.rawStockMovements()) {
    if (String(m.item_name ?? '').trim().toLowerCase() === srcKey) {
      batch.update(ref(shopId, 'stockMovements', m.id), { item_name: dst });
      movementsUpdated++;
      ops++;
      await flushIfNeeded();
    }
  }

  for (const b of cache.rawBills()) {
    const items = (b.items || []) as Array<Record<string, unknown>>;
    let changed = false;
    const nextItems = items.map(it => {
      if (String(it.name ?? '').trim().toLowerCase() === srcKey) {
        changed = true;
        return { ...it, name: dst };
      }
      return it;
    });
    if (changed) {
      batch.update(ref(shopId, 'bills', b.id), { items: nextItems, updated_at: serverTimestamp() });
      billsUpdated++;
      ops++;
      await flushIfNeeded();
    }
  }

  for (const p of cache.rawPolishing()) {
    if (String(p.item_name ?? '').trim().toLowerCase() === srcKey) {
      batch.update(ref(shopId, 'polishing', p.id), { item_name: dst });
      polishingUpdated++;
      ops++;
      await flushIfNeeded();
    }
  }

  audit(batch, shopId, 'stock_item', dst, 'MERGE', { source: src }, { target: dst, movementsUpdated, billsUpdated, polishingUpdated });
  ops++;
  await batch.commit();

  return { movementsUpdated, billsUpdated, polishingUpdated };
}

const REMOVED_STOCK_COLLECTIONS = [
  'rawMaterials', 'rawMaterialTx', 'weavers', 'ownLooms', 'weaverTx', 'staff', 'staffRecords'
] as const;

/** Delete all Firestore docs in the removed Raw Materials, Weavers & Looms, and Staff collections. */
export async function clearRemovedStockData(shopId: string) {
  for (const name of REMOVED_STOCK_COLLECTIONS) {
    const snap = await getDocs(col(shopId, name));
    if (snap.empty) continue;
    let batch = writeBatch(db);
    let ops = 0;
    for (const d of snap.docs) {
      batch.delete(d.ref);
      ops++;
      if (ops >= 400) {
        await batch.commit();
        batch = writeBatch(db);
        ops = 0;
      }
    }
    if (ops > 0) await batch.commit();
  }
}
