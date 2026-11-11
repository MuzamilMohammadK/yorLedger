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
  DashboardPeriod, DashBill, dashboardFigures, dashboardSeries
} from '@yorbalance/shared';
import { cache } from './data/cache';
import { compute } from './data/compute';
import * as session from './data/session';
import * as ledger from './data/ledger';
import { AppError, todayIST } from './data/util';

/** Kept as the public error type for screens (code, message, fields, status). */
export { AppError as ApiError };

let activeShop: Shop | null = null;

/** Called by AuthContext whenever the session's shop changes. */
export function setActiveShop(shop: Shop | null) {
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
  'These are accounting summaries, not a filed GST return. Please have your accountant check the figures before filing GSTR-1 / GSTR-3B.';

async function report<K extends 'getPurchaseLedger' | 'getSalesLedger' | 'getJobWorkLedger'>(fn: K, options?: ReportFilterOptions) {
  const shop = await shopReady();
  return { shop_id: shop.id, shop_name: shop.name, gstin: shop.gstin, report: compute[fn](shop.id, options) as ReturnType<typeof compute[K]> };
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
  getRecentTransactions: async (limit = 10, search?: string) => {
    const s = await shopReady();
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
    return { message: 'Bill saved', transaction: compute.getTransactionHistoryDetails(s.id, bill.id)! };
  },
  nextSaleInvoiceNo: async () => {
    await shopReady();
    return ledger.nextSaleInvoiceNo();
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
    const id = await ledger.recordPayment(s.id, payload);
    return { message: 'Payment saved', paymentId: id, transaction: compute.getTransactionHistoryDetails(s.id, payload.bill_id) };
  },
  updateChequeStatus: async (paymentId: string, patch: Parameters<typeof ledger.updateChequeStatus>[2]) => {
    const s = await shopReady();
    await ledger.updateChequeStatus(s.id, paymentId, patch);
  },
  recordReturn: async (payload: ReturnPayload) => {
    const s = await shopReady();
    const id = await ledger.recordReturn(s.id, payload);
    return { message: 'Return saved', returnId: id, transaction: compute.getTransactionHistoryDetails(s.id, payload.bill_id)! };
  },

  // ---------- Reports & GST ----------
  getPurchaseLedger: (options?: ReportFilterOptions) => report('getPurchaseLedger', options),
  getSalesLedger: (options?: ReportFilterOptions) => report('getSalesLedger', options),
  getJobWorkLedger: (options?: ReportFilterOptions) => report('getJobWorkLedger', options),
  getGSTDashboard: async (options?: ReportFilterOptions) => {
    const s = await shopReady();
    return { shop_id: s.id, shop_name: s.name, gstin: s.gstin, gst_data: compute.getGSTDashboard(s.id, options), disclaimer: GST_DISCLAIMER };
  },

  // ---------- Settings ----------
  getShopSettings: async (): Promise<ShopSettingsData> => {
    const s = await shopReady();
    return ledger.getShopSettings(s.id);
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
    return { message: 'Saved', invoice_settings: (await ledger.saveSettings(s.id, 'invoice', payload)).invoice_settings };
  },
  updateNotificationSettings: async (payload: Partial<NotificationSettings>) => {
    const s = await shopReady();
    return { message: 'Saved', notification_settings: (await ledger.saveSettings(s.id, 'notifications', payload)).notification_settings };
  },
  updateAppPreferences: async (payload: Partial<AppPreferences>) => {
    const s = await shopReady();
    return { message: 'Saved', app_preferences: (await ledger.saveSettings(s.id, 'preferences', payload)).app_preferences };
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

  /** Re-render hook: fires on any live data change for the active shop. */
  onDataChange: (fn: () => void) => cache.subscribe(fn)
};
