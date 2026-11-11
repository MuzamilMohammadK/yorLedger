// Write side: parties, bills, payments, returns, settings — Firestore implementation.
// Every financial change is one Firestore transaction: the bill's cached totals,
// the payment/return record and an audit row are written together, and
// firestore.rules re-checks the arithmetic.
import {
  collection, doc, getDoc, runTransaction, serverTimestamp, setDoc, updateDoc, writeBatch
} from 'firebase/firestore';
import {
  CreateBillPayload, CreatePartyPayload, InvoiceSettings, NotificationSettings, AppPreferences,
  Party, PaymentPayload, ReturnPayload, Shop, ShopSettingsData, UpdatePartyPayload,
  UpdateShopProfilePayload, UpdateGSTSettingsPayload, computeTax, computeReturn,
  normalizeInvoice, normalizePhone, validateGSTIN, getStateCodeByName, validatePayment
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
    if (!p.owner_name?.trim()) fields.owner_name = 'Owner name is required'; else out.owner_name = p.owner_name.trim();
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
  if (p.address !== undefined) out.address = p.address.trim();
  if (p.state !== undefined) {
    out.state = p.state.trim();
    if (!out.state_code) out.state_code = p.state_code || getStateCodeByName(p.state) || '';
  }
  if (p.pin_code !== undefined) out.pin_code = p.pin_code.trim();
  if (p.notes !== undefined) out.notes = p.notes?.trim() || null;
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
  const open = cache.rawBills().filter(b => b.party_id === partyId && b.amount_due !== 0);
  if (open.length) {
    throw new AppError('This party still has money pending or a credit. Settle it first.', 'PARTY_HAS_OPEN_DUES', undefined, 409);
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
  const items = payload.items.filter(i => i.name.trim() || i.qty || i.rate);
  if (!items.length) fields.items = 'Add at least one item';
  items.forEach((it, i) => {
    if (!it.name.trim()) fields[`items.${i}.name`] = 'Item name is required';
    if (!(it.qty > 0) || !Number.isInteger(it.qty)) fields[`items.${i}.qty`] = 'Quantity must be 1 or more';
    if (!(it.rate >= 0) || !Number.isInteger(it.rate)) fields[`items.${i}.rate`] = 'Enter a valid rate';
  });
  if (!Number.isInteger(payload.gst_bp) || payload.gst_bp < 0 || payload.gst_bp > 2800) fields.gst_bp = 'Invalid GST rate';
  const party = cache.rawParty(payload.party_id);
  if (!party) fields.party_id = 'Choose a party';
  if (Object.keys(fields).length) throw new AppError('Please correct the highlighted fields', 'VALIDATION_ERROR', fields);

  // Party without GSTIN is treated as same-state (spec §8.6); manual override allowed.
  const partyState = party!.gstin ? party!.state_code : shop.state_code;
  const tax = computeTax(items.map(i => ({ name: i.name, qty: i.qty, rate: i.rate })), payload.gst_bp, shop.state_code,
    payload.tax_mode_override === 'INTER' ? '__other__' : payload.tax_mode_override === 'INTRA' ? shop.state_code : partyState);

  const billRef = doc(col(shop.id, 'bills'));
  const bill = {
    kind: payload.kind,
    party_id: payload.party_id,
    party_name: party!.name,
    party_type: party!.type,
    invoice_no: invoiceNo!,
    bill_date: payload.bill_date,
    gst_bp: payload.gst_bp,
    tax_mode: tax.taxMode,
    items: items.map(i => ({ name: i.name.trim(), qty: i.qty, rate: i.rate, line_total: i.qty * i.rate })),
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
    const base = { bill_id: p.bill_id, party_id: bill.party_id, amount: p.amount, mode: p.mode,
                   notes: p.notes?.trim() || null, created_at: serverTimestamp() };
    let record: Record<string, unknown>;
    if (p.mode === 'CASH') {
      record = { ...base, paid_on: p.paid_on, collected_by: p.collected_by.trim() };
    } else if (p.mode === 'CHEQUE') {
      record = { ...base, paid_on: p.cheque_date, cheque_no: p.cheque_no?.trim() || null, cheque_date: p.cheque_date,
                 deposit_date: p.deposit_date || null, clearing_date: p.clearing_date || null,
                 clearing_status: p.clearing_date ? 'CLEARED' : 'PENDING' };
    } else {
      const utr = p.utr_no.trim().toUpperCase();
      const utrRef = ref(shopId, 'utrs', utr);
      if ((await tx.get(utrRef)).exists()) {
        throw new AppError('This UTR number is already recorded', 'DUPLICATE_UTR', { utr_no: 'Already used' }, 409);
      }
      tx.set(utrRef, { payment_id: payRef.id });
      record = { ...base, paid_on: p.txn_date, utr_no: utr, txn_date: p.txn_date };
    }
    const paid_total = bill.paid_total + p.amount;
    const amount_due = bill.grand_total - paid_total - bill.returned_total;
    tx.set(payRef, record);
    tx.update(billRef, { paid_total, amount_due, status: amount_due <= 0 ? 'SETTLED' : 'PENDING',
                         last_op: payRef.id, updated_at: serverTimestamp() });
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
    tx.update(billRef, { returned_total, returned_qty: calc.newReturnedQty, amount_due,
                         status: amount_due <= 0 ? 'SETTLED' : 'PENDING', last_op: retRef.id, updated_at: serverTimestamp() });
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
  language: 'en', default_landing_page: '/dashboard'
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
