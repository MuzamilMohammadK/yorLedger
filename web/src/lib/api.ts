// YorLedger data API used by every screen.
//
// Backed directly by Firestore (Spark plan, no server). Access control lives in
// firestore.rules; the active shop always comes from the signed-in session,
// never from the URL, a request body or localStorage.
import {
  RegisterShopPayload, ResubmitShopPayload, AdminDecisionPayload, Shop, PartyType,
  CreatePartyPayload, UpdatePartyPayload, HistoryFilterOptions, DuesFilterOptions,
  ReportFilterOptions, InvoiceSettings, NotificationSettings, AppPreferences,
  UpdateShopProfilePayload, UpdateGSTSettingsPayload, DateRangeOption, LedgerFilterOptions,
  CreateBillPayload, PaymentPayload, ReturnPayload, ShopSettingsData, ShopDocumentType,
  DashboardPeriod, DashBill, dashboardFigures, dashboardSeries,
  ReportBill, purchaseLedger, salesLedger, jobWorkLedger, gstDashboard,
  TallyFilter, TallyMovementKind, buildTally, computeHsnBalances, summarizePolishing,
  allocatePolishPayments
} from '@yorbalance/shared';
import { collection, getDocs, limit as firestoreLimit, orderBy, query } from 'firebase/firestore';
import { db } from './firebase';
import { cache } from './data/cache';
import { compute } from './data/compute';
import * as session from './data/session';
import * as ledger from './data/ledger';
import { AppError, todayIST, toIso } from './data/util';

/** Kept as the public error type for screens (code, message, fields, status). */
export { AppError as ApiError };

let activeShop: Shop | null = null;
let settingsCache: ShopSettingsData | null = null;

/** Called by AuthContext whenever the session's shop changes. */
export function setActiveShop(shop: Shop | null) {
  if (shop?.id !== activeShop?.id) settingsCache = null;
  activeShop = shop;
  if (shop && shop.status === 'APPROVED') cache.start(shop.id);
  else cache.stop();
}

async function shopReady(): Promise<Shop> {
  if (!activeShop) throw new AppError('No shop is linked to this account', 'NO_SHOP', undefined, 403);
  if (activeShop.status !== 'APPROVED') {
    throw new AppError('Your shop is waiting for approval', 'SHOP_NOT_APPROVED', undefined, 403);
  }
  await cache.ready(activeShop.id);
  return activeShop;
}

const GST_DISCLAIMER =
  'These are accounting summaries, not a filed GST return. Figures use bills after returns (credit notes). ' +
  'Eligible ITC counts GST on purchase bills from suppliers with a GSTIN, after returns; job-work GST is shown separately. ' +
  'Please have your accountant check the figures before filing GSTR-1 / GSTR-3B.';

/** Bills in the shape the §11 report functions need (effective values after returns). */
function reportBills(): ReportBill[] {
  const rets = new Map<string, ReportBill['returns']>();
  for (const r of cache.returns()) {
    const list = rets.get(r.transaction_id) ?? [];
    list.push({
      id: r.id,
      return_date: r.return_date,
      reason: r.reason ?? null,
      taxable: r.taxable_paise ?? 0,
      cgst: r.cgst_paise ?? 0,
      sgst: r.sgst_paise ?? 0,
      igst: r.igst_paise ?? 0,
      total: r.amount_paise ?? 0
    });
    rets.set(r.transaction_id, list);
  }
  return cache.rawBills().map(b => {
    const p = cache.rawParty(b.party_id);
    const billDate = toIso(b.bill_date)?.slice(0, 10) ?? (typeof b.bill_date === 'string' ? b.bill_date.slice(0, 10) : '');
    return {
      id: b.id,
      kind: b.kind,
      invoice_no: b.invoice_prefix ? `${b.invoice_prefix}${b.invoice_no}` : String(b.invoice_no ?? ''),
      bill_date: billDate,
      due_date: b.remind_on ?? null,
      party_id: b.party_id ?? '',
      party_name: p?.name ?? b.party_name ?? b.customer_name ?? 'Party',
      party_gstin: p?.gstin ?? null,
      tax_mode: b.tax_mode === 'INTER' ? 'INTER' : 'INTRA',
      items: Array.isArray(b.items) ? b.items.map((i: any) => ({ name: String(i?.name ?? ''), qty: Number(i?.qty ?? 0) })) : [],
      subtotal: Number(b.subtotal ?? 0),
      cgst: Number(b.cgst ?? 0),
      sgst: Number(b.sgst ?? 0),
      igst: Number(b.igst ?? 0),
      grand_total: Number(b.grand_total ?? 0),
      paid_total: Number(b.paid_total ?? 0),
      returns: rets.get(b.id) ?? []
    };
  });
}

async function report<T>(fn: (bills: ReportBill[], f: ReportFilterOptions, today: string) => T, options?: ReportFilterOptions) {
  const shop = await shopReady();
  return { shop_id: shop.id, shop_name: shop.name, gstin: shop.gstin, report: fn(reportBills(), options ?? {}, todayIST()) };
}

export const api = {
  // ---------- Auth, registration, admin ----------
  getMe: () => session.getMe(),
  registerShop: async (payload: RegisterShopPayload) => {
    const r = await session.registerShop(payload);
    return { message: 'Shop registered', ...r };
  },
  resubmitShop: async (payload: ResubmitShopPayload) => {
    if (!activeShop) throw new AppError('No shop is linked to this account', 'NO_SHOP');
    return { message: 'Resubmitted for review', shop: await session.resubmitShop(activeShop.id, payload) };
  },
  getMyShopDocuments: async () => {
    if (!activeShop) throw new AppError('No shop is linked to this account', 'NO_SHOP');
    return session.listShopDocuments(activeShop.id);
  },
  adminReviewDocument: (shopId: string, type: ShopDocumentType, status: 'APPROVED' | 'REJECTED', comment: string | null) =>
    session.adminReviewDocument(shopId, type, status, comment),
  watchAdminNotifications: session.watchAdminNotifications,
  markAdminNotificationRead: session.markAdminNotificationRead,
  getAdminShops: async (status?: string) => ({ shops: await session.adminListShops(status) }),
  getAdminShopDetails: (id: string) => session.adminShopDetails(id),
  recordAdminDecision: async (id: string, payload: AdminDecisionPayload) => {
    const r = await session.adminDecide(id, payload);
    return { message: `Shop ${payload.decision.toLowerCase()}`, shop: r.shop, verification: r.latest_verification! };
  },

  // ---------- Dashboard ----------
  getDashboardSummary: async (period?: string) => {
    const s = await shopReady();
    return { summary: compute.getDashboardSummary(s.id, period as DateRangeOption) };
  },
  getDashboardCharts: async (period?: string) => {
    const s = await shopReady();
    return { charts: compute.getDashboardCharts(s.id, period as DateRangeOption) };
  },
  getRecentTransactions: async (limit = 5, search?: string) => {
    const s = await shopReady();
    if (!search?.trim()) {
      try {
        const snap = await getDocs(
          query(
            collection(db, 'shops', s.id, 'bills'),
            orderBy('bill_date', 'desc'),
            orderBy('created_at', 'desc'),
            firestoreLimit(limit)
          )
        );
        const transactions = snap.docs
          .map(d => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) } as Record<string, any> & { id: string }))
          .filter(b => !b.deleted_at)
          .map(b => cache.mapRawBill(b));
        return { transactions, count: transactions.length };
      } catch {
        // Fallback when composite index is still building
      }
    }
    const transactions = compute.getRecentTransactions(s.id, limit, search);
    return { transactions, count: transactions.length };
  },

  // ---------- Ledger / bills ----------
  getLedgerTransactions: async (options?: { party_id?: string; type?: string; search?: string; limit?: number }) => {
    const s = await shopReady();
    const opts: LedgerFilterOptions = { partyId: options?.party_id, type: options?.type as any, search: options?.search, limit: options?.limit };
    const { transactions, summary } = compute.getLedgerTransactions(s.id, opts);
    const party = options?.party_id ? compute.getPartyById(s.id, options.party_id) : null;
    return { transactions, summary, party, count: transactions.length };
  },
  getTransactionDetails: async (id: string) => {
    const s = await shopReady();
    const transaction = compute.getTransactionHistoryDetails(s.id, id);
    if (!transaction) throw new AppError('Bill not found', 'NOT_FOUND', undefined, 404);
    return { transaction };
  },
  createBill: async (payload: CreateBillPayload) => {
    const s = await shopReady();
    const bill = await ledger.createBill(s, payload);
    await cache.waitForBill(bill.id);
    return { message: 'Bill saved', transaction: compute.getTransactionHistoryDetails(s.id, bill.id)! };
  },
  /** Next free SALE number: one above the highest used, or the "suggested next number" setting if higher (§12.5). */
  nextSaleInvoiceNo: async () => {
    await shopReady();
    const suggested = (await api.getShopSettings()).invoice_settings.suggested_next_number || 1;
    return Math.max(ledger.nextSaleInvoiceNo(), suggested);
  },
  isSaleInvoiceFree: async (raw: string) => {
    const s = await shopReady();
    return ledger.isSaleInvoiceFree(s.id, raw);
  },
  updateBillReminder: async (billId: string, remindOn: string | null, leadDays: number | null, notes?: string | null) => {
    const s = await shopReady();
    await ledger.updateBillReminder(s.id, billId, remindOn, leadDays, notes);
  },
  deleteBill: async (billId: string) => {
    const s = await shopReady();
    await ledger.deleteBill(s.id, billId);
  },

  // ---------- Parties ----------
  getParties: async (type?: PartyType, search?: string) => {
    const s = await shopReady();
    const parties = compute.getParties(s.id, type, search);
    return { parties, count: parties.length };
  },
  getPartyDetails: async (id: string) => {
    const s = await shopReady();
    const party = compute.getPartyById(s.id, id);
    if (!party) throw new AppError('Party not found', 'NOT_FOUND', undefined, 404);
    return { party };
  },
  checkDuplicateParty: async (payload: { phone: string; gstin?: string; excludePartyId?: string }) => {
    const s = await shopReady();
    return compute.checkDuplicateParty(s.id, payload.phone, payload.gstin, payload.excludePartyId);
  },
  createParty: async (payload: CreatePartyPayload) => {
    const s = await shopReady();
    return { message: 'Party added', party: await ledger.createParty(s.id, payload) };
  },
  updateParty: async (id: string, payload: UpdatePartyPayload) => {
    const s = await shopReady();
    return { message: 'Party updated', party: await ledger.updateParty(s.id, id, payload) };
  },
  deleteParty: async (id: string) => {
    const s = await shopReady();
    await ledger.deleteParty(s.id, id);
  },

  // ---------- History, dues, payments, returns ----------
  getHistory: async (options?: HistoryFilterOptions) => {
    const s = await shopReady();
    const r = compute.getHistory(s.id, options);
    return { summary: r.summary, total: r.total, count: r.transactions.length, transactions: r.transactions };
  },
  getHistoryDetails: async (transactionId: string) => {
    const s = await shopReady();
    const transaction = compute.getTransactionHistoryDetails(s.id, transactionId);
    if (!transaction) throw new AppError('Bill not found', 'NOT_FOUND', undefined, 404);
    return { transaction };
  },
  getDuesSummary: async () => {
    const s = await shopReady();
    return { summary: compute.getDuesSummary(s.id) };
  },
  getDues: async (options?: DuesFilterOptions) => {
    const s = await shopReady();
    const r = compute.getDues(s.id, options);
    return { summary: r.summary, total: r.total, count: r.dues.length, dues: r.dues };
  },
  getDueDetails: async (transactionId: string) => {
    const s = await shopReady();
    const due = compute.getDueById(s.id, transactionId);
    if (!due) throw new AppError('Due not found', 'NOT_FOUND', undefined, 404);
    return { due };
  },
  recordPayment: async (payload: PaymentPayload) => {
    const s = await shopReady();
    const before = cache.rawBill(payload.bill_id)?.paid_total ?? 0;
    const id = await ledger.recordPayment(s.id, payload);
    await cache.waitForBill(payload.bill_id, b => b.paid_total >= before + payload.amount);
    return { message: 'Payment saved', paymentId: id, transaction: compute.getTransactionHistoryDetails(s.id, payload.bill_id) };
  },
  updateChequeStatus: async (paymentId: string, patch: Parameters<typeof ledger.updateChequeStatus>[2]) => {
    const s = await shopReady();
    await ledger.updateChequeStatus(s.id, paymentId, patch);
  },
  recordReturn: async (payload: ReturnPayload) => {
    const s = await shopReady();
    const before = cache.rawBill(payload.bill_id)?.returned_total ?? 0;
    const id = await ledger.recordReturn(s.id, payload);
    await cache.waitForBill(payload.bill_id, b => b.returned_total > before);
    return { message: 'Return saved', returnId: id, transaction: compute.getTransactionHistoryDetails(s.id, payload.bill_id)! };
  },

  // ---------- Reports & GST ----------
  getPurchaseLedger: (options?: ReportFilterOptions) => report(purchaseLedger, options),
  getSalesLedger: (options?: ReportFilterOptions) => report(salesLedger, options),
  getJobWorkLedger: (options?: ReportFilterOptions) => report(jobWorkLedger, options),
  getGSTDashboard: async (options?: ReportFilterOptions) => {
    const s = await shopReady();
    return { shop_id: s.id, shop_name: s.name, gstin: s.gstin, gst_data: gstDashboard(reportBills(), options ?? {}, todayIST()), disclaimer: GST_DISCLAIMER };
  },

  // ---------- Settings ----------
  getShopSettings: async (): Promise<ShopSettingsData> => {
    const s = await shopReady();
    if (!settingsCache) settingsCache = await ledger.getShopSettings(s.id);
    return { ...settingsCache, shop: activeShop ?? settingsCache.shop };
  },
  updateShopProfile: async (payload: UpdateShopProfilePayload) => {
    const s = await shopReady();
    const shop = await ledger.updateShopProfile(s.id, payload);
    activeShop = shop;
    return { message: 'Profile saved', shop };
  },
  updateGSTSettings: async (payload: UpdateGSTSettingsPayload) => {
    const s = await shopReady();
    const shop = await ledger.updateGSTSettings(s.id, payload);
    activeShop = shop;
    return { message: 'GST settings saved', shop };
  },
  updateInvoiceSettings: async (payload: Partial<InvoiceSettings>) => {
    const s = await shopReady();
    settingsCache = await ledger.saveSettings(s.id, 'invoice', payload);
    return { message: 'Saved', invoice_settings: settingsCache.invoice_settings };
  },
  updateNotificationSettings: async (payload: Partial<NotificationSettings>) => {
    const s = await shopReady();
    settingsCache = await ledger.saveSettings(s.id, 'notifications', payload);
    return { message: 'Saved', notification_settings: settingsCache.notification_settings };
  },
  updateAppPreferences: async (payload: Partial<AppPreferences>) => {
    const s = await shopReady();
    settingsCache = await ledger.saveSettings(s.id, 'preferences', payload);
    return { message: 'Saved', app_preferences: settingsCache.app_preferences };
  },
  exportShopData: async (type: 'transactions' | 'parties' | 'reports') => {
    const s = await shopReady();
    return compute.exportShopData(s.id, type).data;
  },

  /** §6 dashboard: figures + chart series for a period, exact paise. */
  getDashboard: async (period: DashboardPeriod) => {
    await shopReady();
    const today = todayIST();
    const bills: DashBill[] = cache.rawBills().map(b => ({
      id: b.id, kind: b.kind, bill_date: b.bill_date, grand_total: b.grand_total,
      returned_total: b.returned_total, paid_total: b.paid_total, amount_due: b.amount_due
    }));
    const pays = cache.payments().map(p => ({ date: p.payment_date }));
    const rets = cache.returns().map(r => ({ date: r.return_date }));
    return { figures: dashboardFigures(period, today, bills, pays, rets), series: dashboardSeries(period, today, bills, pays, rets) };
  },

  /** Every live bill (exact paise), newest first. */
  getAllBills: async () => {
    const s = await shopReady();
    return compute.getRecentTransactions(s.id, Number.MAX_SAFE_INTEGER);
  },

  /** Home screen numbers, exact in paise. SALE = money to collect; PURCHASE / JOB_WORK = money to pay. */
  getHomeSummary: async () => {
    await shopReady();
    const today = todayIST();
    const month = today.slice(0, 7);
    let to_collect = 0, to_pay = 0, late_collect = 0, late_pay = 0, credit = 0;
    let today_sales = 0, month_sales = 0, month_purchases = 0;
    for (const b of cache.rawBills()) {
      const due: number = b.amount_due;
      const isSale = b.kind === 'SALE';
      const late = !!b.remind_on && b.remind_on < today && due > 0;
      if (due > 0) {
        if (isSale) { to_collect += due; if (late) late_collect += due; }
        else { to_pay += due; if (late) late_pay += due; }
      } else if (due < 0) credit += -due;
      const net = b.grand_total - b.returned_total;
      if (isSale && b.bill_date === today) today_sales += net;
      if (b.bill_date.startsWith(month)) {
        if (isSale) month_sales += net; else if (b.kind === 'PURCHASE') month_purchases += net;
      }
    }
    return { to_collect, to_pay, late_collect, late_pay, credit, today_sales, month_sales, month_purchases,
             bill_count: cache.rawBills().length };
  },

  /** Bills whose reminder date (minus lead days) has arrived and still have money due. */
  getRemindersDue: async () => {
    const s = await shopReady();
    const { dueReminders } = await import('./useLiveData');
    return dueReminders(compute.getRecentTransactions(s.id, 100000), id => cache.rawBill(id)?.remind_lead_days ?? 0);
  },

  // ---------- Stock & Production ----------
  getStockTally: async (search?: string) => {
    const s = await shopReady();
    return compute.getStockTally(s.id, search);
  },
  getItemLedger: async (itemName: string, includeVoided = false) => {
    const s = await shopReady();
    return compute.getItemLedger(s.id, itemName, includeVoided);
  },
  voidStockMovement: async (id: string, reason: string, overrideNegative = false) => {
    const s = await shopReady();
    return ledger.voidStockMovement(s.id, id, reason, overrideNegative);
  },
  editStockMovement: async (id: string, patch: { date?: string; qty?: number; notes?: string | null; rate_paise?: number }) => {
    const s = await shopReady();
    return ledger.editStockMovement(s.id, id, patch);
  },
  addRawStockPurchase: async (payload: Parameters<typeof ledger.addRawStockPurchase>[1]) => {
    const s = await shopReady();
    return ledger.addRawStockPurchase(s, payload);
  },
  sellRawMaterial: async (payload: Parameters<typeof ledger.sellRawMaterial>[1]) => {
    const s = await shopReady();
    return ledger.sellRawMaterial(s, payload);
  },
  voidRawMaterialTx: async (id: string, reason: string) => {
    const s = await shopReady();
    return ledger.voidRawMaterialTx(s.id, id, reason);
  },
  editRawMaterialTx: async (id: string, patch: { date?: string; qty_kg?: number; rate_per_kg_paise?: number; notes?: string | null }) => {
    const s = await shopReady();
    return ledger.editRawMaterialTx(s.id, id, patch);
  },
  getRawMaterialHistory: async (includeVoided = false) => {
    await shopReady();
    return cache.rawRawMaterialTx()
      .filter(t => includeVoided || t.status !== 'VOID')
      .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')));
  },
  issueYarnToWeaver: async (payload: Parameters<typeof ledger.issueYarnToWeaver>[1]) => {
    const s = await shopReady();
    return ledger.issueYarnToWeaver(s.id, payload);
  },
  receiveSareesFromWeaver: async (payload: Parameters<typeof ledger.receiveSareesFromWeaver>[1]) => {
    const s = await shopReady();
    return ledger.receiveSareesFromWeaver(s.id, payload);
  },
  voidWeaverTx: async (id: string, reason: string) => {
    const s = await shopReady();
    return ledger.voidWeaverTx(s.id, id, reason);
  },
  getOwnLoomsList: async () => {
    await shopReady();
    return (cache.rawOwnLoomsDoc()?.looms ?? []) as Array<{
      id: string;
      loom_no: string;
      loom_type: 'HANDLOOM' | 'POWERLOOM';
      status: 'RUNNING' | 'IDLE' | 'REPAIR';
      assigned_worker?: string | null;
    }>;
  },
  saveOwnLoomsList: async (looms: Parameters<typeof ledger.saveOwnLoomsList>[1]) => {
    const s = await shopReady();
    return ledger.saveOwnLoomsList(s.id, looms);
  },
  recordPolishPayment: async (payload: Parameters<typeof ledger.recordPolishPayment>[1]) => {
    const s = await shopReady();
    return ledger.recordPolishPayment(s.id, payload);
  },
  voidPolishingEntry: async (id: string, reason: string) => {
    const s = await shopReady();
    return ledger.voidPolishingEntry(s.id, id, reason);
  },
  getPolishingAccounts: async (includeVoided = false) => {
    const s = await shopReady();
    const all = cache.rawPolishing().filter(p => includeVoided || p.record_status !== 'VOID');
    const batches = all
      .filter(p => p.entry_kind !== 'PAYMENT')
      .map(p => ({
        id: p.id,
        shop_id: s.id,
        person_name: String(p.person_name ?? ''),
        party_id: p.party_id ?? null,
        item_name: String(p.item_name ?? 'Silk Saree'),
        hsn_code: p.hsn_code ?? null,
        sent_date: String(p.sent_date ?? ''),
        received_date: p.received_date ?? null,
        sarees_sent: Number(p.sarees_sent ?? 0),
        sarees_received: Number(p.sarees_received ?? 0),
        unit_price_paise: Number(p.unit_price_paise ?? 0),
        notes: p.notes ?? null,
        status: (p.record_status === 'VOID' ? 'VOID' : 'ACTIVE') as 'ACTIVE' | 'VOID'
      }));
    const payments = all
      .filter(p => p.entry_kind === 'PAYMENT')
      .map(p => ({
        id: p.id,
        shop_id: s.id,
        person_name: String(p.person_name ?? ''),
        party_id: p.party_id ?? null,
        date: String(p.sent_date ?? ''),
        amount_paise: Number(p.amount_paise ?? 0),
        mode: String(p.payment_mode ?? 'CASH'),
        is_advance: Boolean(p.is_advance),
        notes: p.notes ?? null,
        status: (p.record_status === 'VOID' ? 'VOID' : 'ACTIVE') as 'ACTIVE' | 'VOID'
      }));
    const allocated = allocatePolishPayments({ shopId: s.id, batches, payments });
    return {
      ...allocated,
      payments: payments.sort((a, b) => b.date.localeCompare(a.date))
    };
  },
  recordStockMovement: async (payload: { item_name: string; movement_type: any; qty: number; rate_paise?: number; date?: string; notes?: string | null }) => {
    const s = await shopReady();
    return ledger.recordStockMovement(s.id, payload);
  },
  mergeStockItems: async (sourceItemName: string, targetItemName: string) => {
    const s = await shopReady();
    return ledger.mergeStockItems(s.id, sourceItemName, targetItemName);
  },
  getRawMaterials: async () => {
    const s = await shopReady();
    return compute.getRawMaterialsSummary(s.id);
  },
  createRawMaterial: async (payload: { name: string; unit?: string; unit_price_paise: number; low_stock_threshold_kg?: number }) => {
    const s = await shopReady();
    return ledger.createRawMaterial(s.id, payload);
  },
  updateRawMaterial: async (id: string, payload: { name?: string; unit_price_paise?: number; low_stock_threshold_kg?: number }) => {
    const s = await shopReady();
    return ledger.updateRawMaterial(s.id, id, payload);
  },
  recordRawMaterialTx: async (payload: { material_id: string; tx_type: any; qty_kg: number; rate_per_kg_paise: number; weaver_id?: string | null; date?: string; ref_no?: string | null; notes?: string | null }) => {
    const s = await shopReady();
    return ledger.recordRawMaterialTx(s.id, payload);
  },
  getWeavers: async () => {
    const s = await shopReady();
    return compute.getWeaversSummary(s.id);
  },
  getOwnLooms: async () => {
    await shopReady();
    return cache.ownLooms();
  },
  updateOwnLooms: async (payload: { handloom_running: number; handloom_idle: number; handloom_repair: number; powerloom_running: number; powerloom_idle: number; powerloom_repair: number }) => {
    const s = await shopReady();
    return ledger.updateOwnLooms(s.id, payload);
  },
  createWeaver: async (payload: { name: string; phone: string; additional_phones?: string[]; address: string; type: any; looms_count: number; notes?: string | null }) => {
    const s = await shopReady();
    return ledger.createWeaver(s.id, payload);
  },
  updateWeaver: async (id: string, payload: Partial<{ name: string; phone: string; additional_phones?: string[]; address: string; type: any; looms_count: number; notes: string | null }>) => {
    const s = await shopReady();
    return ledger.updateWeaver(s.id, id, payload as any);
  },
  deleteWeaver: async (id: string) => {
    const s = await shopReady();
    return ledger.deleteWeaver(s.id, id);
  },
  recordWeaverTx: async (payload: any) => {
    const s = await shopReady();
    return ledger.recordWeaverTx(s.id, payload);
  },
  getStaff: async () => {
    const s = await shopReady();
    return compute.getStaffSummary(s.id);
  },
  createStaff: async (payload: { name: string; role: string; phone: string; wage_type: any; wage_amount_paise: number; joining_date?: string }) => {
    const s = await shopReady();
    return ledger.createStaff(s.id, payload);
  },
  updateStaff: async (id: string, payload: any) => {
    const s = await shopReady();
    return ledger.updateStaff(s.id, id, payload);
  },
  recordStaffRecord: async (payload: any) => {
    const s = await shopReady();
    return ledger.recordStaffRecord(s.id, payload);
  },
  getPolishing: async (filter?: { from?: string; to?: string }) => {
    const s = await shopReady();
    return compute.getPolishingSummary(s.id, filter);
  },
  createPolishingBatch: async (payload: { person_name: string; item_name: string; sarees_sent: number; unit_price_paise: number; sent_date?: string; notes?: string | null }) => {
    const s = await shopReady();
    return ledger.createPolishingBatch(s.id, payload);
  },
  updatePolishingBatch: async (id: string, payload: { sarees_received: number; received_date?: string; notes?: string | null }) => {
    const s = await shopReady();
    return ledger.updatePolishingBatch(s.id, id, payload);
  },
  getStockProductionAnalysis: async (dateRange?: { from?: string; to?: string }) => {
    const s = await shopReady();
    return compute.getStockProductionAnalysis(s.id, dateRange);
  },
  clearRemovedStockData: async () => {
    const s = await shopReady();
    return ledger.clearRemovedStockData(s.id);
  },

  // ---------- Tally & HSN Balance ----------
  getTally: async (filter?: TallyFilter) => {
    const s = await shopReady();
    const bills = cache.rawBills().map(b => {
      const p = cache.rawParty(b.party_id);
      const legacyHsn = b.kind !== 'JOB_WORK' ? (b.hsn_code ?? null) : null;
      return {
        id: b.id,
        shop_id: s.id,
        kind: b.kind,
        invoice_no: b.invoice_prefix ? `${b.invoice_prefix}${b.invoice_no}` : String(b.invoice_no ?? ''),
        bill_date: toIso(b.bill_date)?.slice(0, 10) ?? String(b.bill_date ?? ''),
        party_id: b.party_id ?? '',
        party_name: p?.name ?? b.party_name ?? b.customer_name ?? 'Party',
        subtotal: Number(b.subtotal ?? 0),
        cgst: Number(b.cgst ?? 0),
        sgst: Number(b.sgst ?? 0),
        igst: Number(b.igst ?? 0),
        items: (b.items ?? []).map((i: any) => ({
          name: String(i.name ?? ''),
          qty: Number(i.qty ?? 0),
          rate: Number(i.rate ?? 0),
          line_total: Number(i.line_total ?? 0),
          hsn_code: b.kind === 'JOB_WORK' ? null : (i.hsn_code ?? legacyHsn)
        }))
      };
    });
    const returns = cache.returns().map(r => {
      const bill = cache.rawBill(r.transaction_id);
      return {
        id: r.id,
        shop_id: s.id,
        bill_id: r.transaction_id,
        kind: (bill?.kind ?? 'SALE') as 'SALE' | 'PURCHASE' | 'JOB_WORK',
        returned_on: r.return_date,
        party_id: r.party_id,
        items: (r.items ?? []).map((it: any) => ({
          name: it.name,
          qty: it.qty,
          hsn_code: bill?.items?.[it.index]?.hsn_code ?? bill?.hsn_code ?? null
        }))
      };
    });
    const allMovements = cache.rawStockMovements().filter(m => m.status !== 'VOID');
    const movements = allMovements
      .filter(m => m.kind !== 'COUNT_SNAPSHOT')
      .map(m => ({
        id: m.id,
        shop_id: s.id,
        item_name: String(m.item_name ?? ''),
        hsn_code: m.hsn_code ?? null,
        date: String(m.date ?? ''),
        kind: (m.kind ?? (m.movement_type === 'OPENING' ? 'OPENING' : m.movement_type === 'PRODUCTION' ? 'PRODUCTION' : m.movement_type === 'ADJUSTMENT' ? 'COUNT_ADJUST' : m.movement_type === 'PURCHASE' ? 'PURCHASE' : m.movement_type === 'SALE' ? 'SALE' : 'COUNT_ADJUST')) as TallyMovementKind,
        qty: Number(m.qty ?? 0),
        bill_id: m.bill_id ?? null,
        party_id: m.party_id ?? null
      }));
    const polishEntries = cache.rawPolishing()
      .filter(p => p.record_status !== 'VOID' && p.entry_kind !== 'PAYMENT')
      .map(p => ({
      id: p.id,
      shop_id: s.id,
      date: String(p.sent_date ?? ''),
      party_id: p.party_id ?? null,
      person_name: String(p.person_name ?? ''),
      item_name: String(p.item_name ?? ''),
      hsn_code: p.hsn_code ?? null,
      qty: Number(p.sarees_sent ?? 0),
      unit_price_paise: Number(p.unit_price_paise ?? 0),
      total_paise: Number(p.total_amount_paise ?? 0),
      received_qty: Number(p.sarees_received ?? 0),
      bill_id: p.bill_id ?? null
    }));
    const counts = allMovements
      .filter(m => m.kind === 'COUNT_SNAPSHOT')
      .map(c => ({
        shop_id: s.id,
        hsn_code: String(c.hsn_code ?? ''),
        counted_qty: Number(c.counted_qty ?? 0),
        counted_on: String(c.date ?? '')
      }));
    const result = buildTally({ shopId: s.id, bills, returns, movements, polishEntries, counts, filter });
    const polishSummary = summarizePolishing(s.id, polishEntries, filter);
    return {
      ...result,
      polish_summary: polishSummary,
      polish_entries: polishEntries.filter(e =>
        (!filter?.from || e.date >= filter.from) &&
        (!filter?.to || e.date <= filter.to) &&
        (!filter?.partyId || e.party_id === filter.partyId || e.person_name === filter.partyId) &&
        (!filter?.hsn?.trim() || (e.hsn_code ?? '').startsWith(filter.hsn.trim()))
      )
    };
  },
  getTallyBalance: async (hsnPrefix?: string) => {
    const t = await api.getTally({ hsn: hsnPrefix });
    return t.hsn_balances;
  },
  postStockCount: async (payload: { hsn_code: string; item_name?: string; counted_qty: number; book_balance: number; date?: string; notes?: string | null }) => {
    const s = await shopReady();
    return ledger.postStockCount(s.id, payload);
  },
  postStockAdjust: async (payload: { item_name: string; hsn_code?: string | null; kind: TallyMovementKind; qty: number; date?: string; notes?: string | null }) => {
    const s = await shopReady();
    return ledger.postStockAdjust(s.id, payload);
  },
  getPolishSummary: async (filter?: { from?: string; to?: string; partyId?: string; hsn?: string }) => {
    const s = await shopReady();
    const entries = cache.rawPolishing()
      .filter(p => p.record_status !== 'VOID' && p.entry_kind !== 'PAYMENT')
      .map(p => ({
      id: p.id,
      shop_id: s.id,
      date: String(p.sent_date ?? ''),
      party_id: p.party_id ?? null,
      person_name: String(p.person_name ?? ''),
      item_name: String(p.item_name ?? ''),
      hsn_code: p.hsn_code ?? null,
      qty: Number(p.sarees_sent ?? 0),
      unit_price_paise: Number(p.unit_price_paise ?? 0),
      total_paise: Number(p.total_amount_paise ?? 0),
      received_qty: Number(p.sarees_received ?? 0),
      bill_id: p.bill_id ?? null
    }));
    return {
      summary: summarizePolishing(s.id, entries, filter),
      entries
    };
  },
  givePolish: async (payload: Parameters<typeof ledger.givePolish>[1]) => {
    const s = await shopReady();
    return ledger.givePolish(s, payload);
  },
  receivePolish: async (batchId: string, payload: Parameters<typeof ledger.receivePolish>[2]) => {
    const s = await shopReady();
    return ledger.receivePolish(s.id, batchId, payload);
  },

  /** Re-render hook: fires on any live data change for the active shop. */
  onDataChange: (fn: () => void) => cache.subscribe(fn)
};
