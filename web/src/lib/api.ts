import {
  RegisterShopPayload,
  ResubmitShopPayload,
  AdminDecisionPayload,
  UserSession,
  Shop,
  ShopVerification,
  Party,
  PartyType,
  CreatePartyPayload,
  UpdatePartyPayload,
  DuplicatePartyCheckResult,
  CreateTransactionPayload,
  LedgerSummary,
  LedgerFilterOptions,
  Transaction,
  PaymentRecord,
  ReturnRecord,
  RecordPaymentPayload,
  RecordReturnPayload,
  HistorySummary,
  HistoryFilterOptions,
  DuesSummary,
  DueRecord,
  DuesFilterOptions,
  ReportFilterOptions,
  PurchaseLedgerReport,
  SalesLedgerReport,
  ArtisanJobWorkReport,
  GSTDashboardData,
  ShopSettingsData,
  InvoiceSettings,
  NotificationSettings,
  AppPreferences,
  UpdateShopProfilePayload,
  UpdateGSTSettingsPayload
} from '@yorbalance/shared';
import { clientStore } from './clientStore';

const API_BASE = '/api/v1';

let authTokenGetter: (() => Promise<string | null>) | null = null;

export function setAuthTokenGetter(getter: () => Promise<string | null>) {
  authTokenGetter = getter;
}

export class ApiError extends Error {
  code: string;
  fields?: Record<string, string>;
  status: number;

  constructor(message: string, code: string, status: number, fields?: Record<string, string>) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.fields = fields;
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');

  let token: string | null = null;
  if (authTokenGetter) {
    token = await authTokenGetter();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers
    });

    const text = await response.text();
    const isHtml = text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html');

    if (!isHtml && response.ok) {
      try {
        return JSON.parse(text) as T;
      } catch {
        // Fall through to fallback handler below
      }
    }

    if (!response.ok && !isHtml && response.status !== 404 && response.status !== 500) {
      let data: any = {};
      try { data = JSON.parse(text); } catch {}
      throw new ApiError(
        data.message || `Request failed with status ${response.status}`,
        data.code || 'UNKNOWN_ERROR',
        response.status,
        data.fields
      );
    }
  } catch (err: any) {
    if (err instanceof ApiError) throw err;
    // Otherwise fallback if network error / server unreachable
  }

  // Graceful clientStore fallback for static hosting / dev offline
  return fallbackHandler<T>(endpoint, options, token);
}

function fallbackHandler<T>(endpoint: string, options: RequestInit, token: string | null): T {
  // /auth/me
  if (endpoint === '/auth/me') {
    let email = '';
    let role: 'ADMIN' | 'OWNER' = 'OWNER';

    // 1. Decode real Firebase JWT
    if (token && token.includes('.')) {
      try {
        const parts = token.split('.');
        if (parts.length >= 2) {
          const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
          if (payload.email) email = payload.email.toLowerCase();
          if (payload.admin || email === 'muzamilmohammadk@gmail.com') {
            role = 'ADMIN';
          }
        }
      } catch {}
    }

    // 2. Dev token formats
    if (!email) {
      if (token && token.startsWith('dev-owner-')) {
        email = token.replace('dev-owner-', '').toLowerCase();
        role = 'OWNER';
      } else if (token === 'dev-admin') {
        email = 'muzamilmohammadk@gmail.com';
        role = 'ADMIN';
      }
    }

    // 3. Check dev session storage
    if (!email) {
      const saved = localStorage.getItem('yorbalance_dev_session');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed.email) email = parsed.email.toLowerCase();
          if (parsed.role) role = parsed.role;
        } catch {}
      }
    }

    // 4. Retrieve shop by active shop ID or user email
    const activeShopId = localStorage.getItem('yorbalance_active_shop_id');
    let shopDetails = activeShopId ? clientStore.getShopById(activeShopId) : null;

    if (!shopDetails && email) {
      const shop = clientStore.getShopByEmail(email);
      if (shop) {
        shopDetails = clientStore.getShopById(shop.id);
      }
    }

    if (!shopDetails && role === 'OWNER') {
      const allShops = clientStore.getShops();
      if (allShops.length > 0) {
        shopDetails = clientStore.getShopById(allShops[0].id);
      }
    }

    return {
      user: {
        id: shopDetails ? 'user-' + shopDetails.shop.id : 'user-' + (role === 'ADMIN' ? 'admin' : 'owner'),
        shop_id: shopDetails ? shopDetails.shop.id : null,
        firebase_uid: shopDetails ? 'uid-' + shopDetails.shop.id : 'uid-' + (role === 'ADMIN' ? 'admin' : 'owner'),
        email: email || 'merchant@yorbalance.com',
        role,
        created_at: new Date().toISOString()
      },
      shop: shopDetails ? shopDetails.shop : null,
      latest_verification: shopDetails ? shopDetails.latest_verification : null
    } as T;
  }

  // /auth/register-shop
  if (endpoint === '/auth/register-shop') {
    const payload: RegisterShopPayload = JSON.parse(options.body as string);
    const result = clientStore.registerShop(payload);
    return {
      message: 'Shop registration submitted successfully. Awaiting administrator verification.',
      shop: result.shop,
      user: result.user
    } as T;
  }

  // /auth/resubmit
  if (endpoint === '/auth/resubmit') {
    const payload: ResubmitShopPayload = JSON.parse(options.body as string);
    const shop = clientStore.resubmitShop('demo-shop-1', payload);
    return {
      message: 'Shop details and documents resubmitted successfully. Awaiting administrator review.',
      shop
    } as T;
  }

  // /admin/shops
  if (endpoint.startsWith('/admin/shops') && !endpoint.includes('/decision') && options.method !== 'POST') {
    const url = new URL(`http://dummy${endpoint}`);
    const status = url.searchParams.get('status') || undefined;
    const shops = clientStore.getShops(status);
    return { shops } as T;
  }

  // /admin/shops/:id/decision
  if (endpoint.includes('/decision') && options.method === 'POST') {
    const match = endpoint.match(/\/admin\/shops\/([^/]+)\/decision/);
    const shopId = match ? decodeURIComponent(match[1]) : '';
    const payload: AdminDecisionPayload = JSON.parse(options.body as string);
    const result = clientStore.recordDecision(shopId, payload.decision, payload.reason);
    return {
      message: `Shop registration ${payload.decision.toLowerCase()} successfully.`,
      shop: result.shop,
      verification: result.verification
    } as T;
  }

  // /admin/shops/:id
  if (endpoint.startsWith('/admin/shops/') && !endpoint.includes('/decision') && options.method !== 'POST') {
    const match = endpoint.match(/\/admin\/shops\/([^/?]+)/);
    const shopId = match ? decodeURIComponent(match[1]) : '';
    const details = clientStore.getShopById(shopId);
    if (!details) throw new ApiError('Shop not found', 'NOT_FOUND', 404);
    return details as T;
  }

  // Phase 2: /analytics/summary
  if (endpoint.startsWith('/analytics/summary')) {
    const url = new URL(`http://dummy${endpoint}`);
    const period = (url.searchParams.get('period') as any) || 'this_month';
    const activeShopId = localStorage.getItem('yorbalance_active_shop_id') || 'demo-shop-1';
    const summary = clientStore.getDashboardSummary(activeShopId, period);
    return {
      shop: { id: activeShopId },
      summary
    } as T;
  }

  // Phase 2: /analytics/charts
  if (endpoint.startsWith('/analytics/charts')) {
    const url = new URL(`http://dummy${endpoint}`);
    const period = (url.searchParams.get('period') as any) || 'this_month';
    const activeShopId = localStorage.getItem('yorbalance_active_shop_id') || 'demo-shop-1';
    const charts = clientStore.getDashboardCharts(activeShopId, period);
    return {
      shop_id: activeShopId,
      period,
      charts
    } as T;
  }

  // Phase 2: /ledger/recent
  if (endpoint.startsWith('/ledger/recent')) {
    const url = new URL(`http://dummy${endpoint}`);
    const limit = url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!, 10) : 10;
    const search = url.searchParams.get('search') || undefined;
    const activeShopId = localStorage.getItem('yorbalance_active_shop_id') || 'demo-shop-1';
    const transactions = clientStore.getRecentTransactions(activeShopId, limit, search);
    return {
      shop_id: activeShopId,
      count: transactions.length,
      transactions
    } as T;
  }

  // Phase 4: /ledger/transactions (List, Filters, Create)
  if (endpoint === '/ledger/transactions' || endpoint.startsWith('/ledger/transactions?')) {
    const activeShopId = localStorage.getItem('yorbalance_active_shop_id') || 'demo-shop-1';

    if (options.method === 'POST') {
      const body = options.body ? JSON.parse(options.body as string) : {};
      const newTx = clientStore.createTransaction(activeShopId, body);
      return { message: 'Transaction successfully recorded', transaction: newTx } as T;
    }

    const url = new URL(`http://dummy${endpoint}`);
    const partyId = url.searchParams.get('party_id') || undefined;
    const type = (url.searchParams.get('type') as any) || undefined;
    const search = url.searchParams.get('search') || undefined;
    const limit = url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!, 10) : 100;

    const { transactions, summary } = clientStore.getLedgerTransactions(activeShopId, {
      partyId,
      type,
      search,
      limit
    });

    let party = null;
    if (partyId) {
      party = clientStore.getPartyById(activeShopId, partyId);
    }

    return {
      shop_id: activeShopId,
      party,
      count: transactions.length,
      summary,
      transactions
    } as T;
  }

  // Phase 2: /ledger/transactions/:id
  if (endpoint.startsWith('/ledger/transactions/')) {
    const id = endpoint.replace('/ledger/transactions/', '');
    const activeShopId = localStorage.getItem('yorbalance_active_shop_id') || 'demo-shop-1';
    const transaction = clientStore.getTransactionById(activeShopId, id);
    if (!transaction) throw new ApiError('Transaction not found', 'NOT_FOUND', 404);
    return { transaction } as T;
  }

  // Phase 3: /parties/check-duplicate
  if (endpoint === '/parties/check-duplicate') {
    const body = options.body ? JSON.parse(options.body as string) : {};
    const activeShopId = localStorage.getItem('yorbalance_active_shop_id') || 'demo-shop-1';
    const res = clientStore.checkDuplicateParty(activeShopId, body.phone || '', body.gstin, body.excludePartyId);
    return res as T;
  }

  // Phase 3: /parties (GET & POST)
  if (endpoint.startsWith('/parties')) {
    const activeShopId = localStorage.getItem('yorbalance_active_shop_id') || 'demo-shop-1';

    // POST /parties
    if (options.method === 'POST') {
      const body = options.body ? JSON.parse(options.body as string) : {};
      const newParty = clientStore.createParty(activeShopId, body);
      return { message: 'Party successfully registered', party: newParty } as T;
    }

    // PATCH /parties/:id
    if (options.method === 'PATCH') {
      const partyId = endpoint.replace('/parties/', '').split('?')[0];
      const body = options.body ? JSON.parse(options.body as string) : {};
      const updatedParty = clientStore.updateParty(activeShopId, partyId, body);
      return { message: 'Party details updated successfully', party: updatedParty } as T;
    }

    // GET /parties/:id
    if (endpoint !== '/parties' && !endpoint.startsWith('/parties?')) {
      const partyId = endpoint.replace('/parties/', '').split('?')[0];
      const party = clientStore.getPartyById(activeShopId, partyId);
      if (!party) throw new ApiError('Party not found', 'NOT_FOUND', 404);
      return { party } as T;
    }

    // GET /parties (list)
    const url = new URL(`http://dummy${endpoint}`);
    const type = (url.searchParams.get('type') as any) || undefined;
    const search = url.searchParams.get('search') || undefined;
    const parties = clientStore.getParties(activeShopId, type, search);
    return {
      shop_id: activeShopId,
      count: parties.length,
      parties
    } as T;
  }

  // Phase 5: /history
  if (endpoint === '/history' || endpoint.startsWith('/history?')) {
    const url = new URL(`http://dummy${endpoint}`);
    const activeShopId = localStorage.getItem('yorbalance_active_shop_id') || 'demo-shop-1';
    const options: HistoryFilterOptions = {
      search: url.searchParams.get('search') || undefined,
      dateRange: url.searchParams.get('date_range') || url.searchParams.get('dateRange') || undefined,
      startDate: url.searchParams.get('start_date') || url.searchParams.get('startDate') || undefined,
      endDate: url.searchParams.get('end_date') || url.searchParams.get('endDate') || undefined,
      type: (url.searchParams.get('type') as any) || undefined,
      partyId: url.searchParams.get('party_id') || url.searchParams.get('partyId') || undefined,
      status: (url.searchParams.get('status') as any) || undefined,
      minAmount: url.searchParams.get('min_amount') ? parseFloat(url.searchParams.get('min_amount')!) : undefined,
      maxAmount: url.searchParams.get('max_amount') ? parseFloat(url.searchParams.get('max_amount')!) : undefined
    };
    const res = clientStore.getHistory(activeShopId, options);
    return {
      shop_id: activeShopId,
      summary: res.summary,
      total: res.total,
      count: res.transactions.length,
      transactions: res.transactions
    } as T;
  }

  if (endpoint.startsWith('/history/')) {
    const activeShopId = localStorage.getItem('yorbalance_active_shop_id') || 'demo-shop-1';
    const txId = endpoint.replace('/history/', '').split('?')[0];
    const tx = clientStore.getTransactionHistoryDetails(activeShopId, txId);
    if (!tx) throw new ApiError('Transaction not found', 'NOT_FOUND', 404);
    return { shop_id: activeShopId, transaction: tx } as T;
  }

  // Phase 5: /dues
  if (endpoint === '/dues/summary') {
    const activeShopId = localStorage.getItem('yorbalance_active_shop_id') || 'demo-shop-1';
    const summary = clientStore.getDuesSummary(activeShopId);
    return { shop_id: activeShopId, summary } as T;
  }

  if (endpoint === '/dues' || endpoint.startsWith('/dues?')) {
    const url = new URL(`http://dummy${endpoint}`);
    const activeShopId = localStorage.getItem('yorbalance_active_shop_id') || 'demo-shop-1';
    const options: DuesFilterOptions = {
      view: (url.searchParams.get('view') as any) || 'ALL',
      search: url.searchParams.get('search') || undefined,
      partyType: (url.searchParams.get('party_type') as any) || undefined,
      status: (url.searchParams.get('status') as any) || undefined,
      invoiceStartDate: url.searchParams.get('invoice_start_date') || undefined,
      invoiceEndDate: url.searchParams.get('invoice_end_date') || undefined,
      dueStartDate: url.searchParams.get('due_start_date') || undefined,
      dueEndDate: url.searchParams.get('due_end_date') || undefined,
      minAmount: url.searchParams.get('min_amount') ? parseFloat(url.searchParams.get('min_amount')!) : undefined,
      maxAmount: url.searchParams.get('max_amount') ? parseFloat(url.searchParams.get('max_amount')!) : undefined
    };
    const res = clientStore.getDues(activeShopId, options);
    return {
      shop_id: activeShopId,
      summary: res.summary,
      total: res.total,
      count: res.dues.length,
      dues: res.dues
    } as T;
  }

  if (endpoint.startsWith('/dues/')) {
    const activeShopId = localStorage.getItem('yorbalance_active_shop_id') || 'demo-shop-1';
    const txId = endpoint.replace('/dues/', '').split('?')[0];
    const due = clientStore.getDueById(activeShopId, txId);
    if (!due) throw new ApiError('Due record not found', 'NOT_FOUND', 404);
    return { shop_id: activeShopId, due } as T;
  }

  // Phase 5: /payments
  if (endpoint === '/payments' && options.method === 'POST') {
    const activeShopId = localStorage.getItem('yorbalance_active_shop_id') || 'demo-shop-1';
    const body = options.body ? JSON.parse(options.body as string) : {};
    const res = clientStore.recordPayment(activeShopId, body);
    return { message: 'Payment recorded successfully', payment: res.payment, transaction: res.transaction } as T;
  }

  if (endpoint === '/payments/returns' && options.method === 'POST') {
    const activeShopId = localStorage.getItem('yorbalance_active_shop_id') || 'demo-shop-1';
    const body = options.body ? JSON.parse(options.body as string) : {};
    const res = clientStore.recordReturn(activeShopId, body);
    return { message: 'Return recorded successfully', return: res.returnRecord, transaction: res.transaction } as T;
  }

  if (endpoint.startsWith('/payments/')) {
    const activeShopId = localStorage.getItem('yorbalance_active_shop_id') || 'demo-shop-1';
    const payId = endpoint.replace('/payments/', '').split('?')[0];
    const payments = (clientStore as any).loadPayments ? (clientStore as any).loadPayments(activeShopId) : [];
    const payment = payments.find((p: any) => p.id === payId);
    if (!payment) throw new ApiError('Payment not found', 'NOT_FOUND', 404);
    return { shop_id: activeShopId, payment } as T;
  }

  // Phase 6: Reports
  if (endpoint.startsWith('/reports/purchase-ledger')) {
    const url = new URL(`http://dummy${endpoint}`);
    const activeShopId = localStorage.getItem('yorbalance_active_shop_id') || 'demo-shop-1';
    const options: ReportFilterOptions = {
      from: url.searchParams.get('from') || undefined,
      to: url.searchParams.get('to') || undefined,
      financialYear: url.searchParams.get('financialYear') || undefined,
      month: url.searchParams.get('month') || undefined,
      quarter: url.searchParams.get('quarter') || undefined,
      partySearch: url.searchParams.get('partySearch') || undefined,
      partyId: url.searchParams.get('partyId') || undefined
    };
    const report = clientStore.getPurchaseLedger(activeShopId, options);
    const shopData = clientStore.getShopById(activeShopId);
    return {
      shop_id: activeShopId,
      shop_name: shopData?.shop.name || 'Silk Shop',
      gstin: shopData?.shop.gstin || '',
      report
    } as T;
  }

  if (endpoint.startsWith('/reports/sales-ledger')) {
    const url = new URL(`http://dummy${endpoint}`);
    const activeShopId = localStorage.getItem('yorbalance_active_shop_id') || 'demo-shop-1';
    const options: ReportFilterOptions = {
      from: url.searchParams.get('from') || undefined,
      to: url.searchParams.get('to') || undefined,
      financialYear: url.searchParams.get('financialYear') || undefined,
      month: url.searchParams.get('month') || undefined,
      quarter: url.searchParams.get('quarter') || undefined,
      partySearch: url.searchParams.get('partySearch') || undefined,
      partyId: url.searchParams.get('partyId') || undefined
    };
    const report = clientStore.getSalesLedger(activeShopId, options);
    const shopData = clientStore.getShopById(activeShopId);
    return {
      shop_id: activeShopId,
      shop_name: shopData?.shop.name || 'Silk Shop',
      gstin: shopData?.shop.gstin || '',
      report
    } as T;
  }

  if (endpoint.startsWith('/reports/job-work-ledger')) {
    const url = new URL(`http://dummy${endpoint}`);
    const activeShopId = localStorage.getItem('yorbalance_active_shop_id') || 'demo-shop-1';
    const options: ReportFilterOptions = {
      from: url.searchParams.get('from') || undefined,
      to: url.searchParams.get('to') || undefined,
      financialYear: url.searchParams.get('financialYear') || undefined,
      month: url.searchParams.get('month') || undefined,
      quarter: url.searchParams.get('quarter') || undefined,
      partySearch: url.searchParams.get('partySearch') || undefined,
      partyId: url.searchParams.get('partyId') || undefined
    };
    const report = clientStore.getJobWorkLedger(activeShopId, options);
    const shopData = clientStore.getShopById(activeShopId);
    return {
      shop_id: activeShopId,
      shop_name: shopData?.shop.name || 'Silk Shop',
      gstin: shopData?.shop.gstin || '',
      report
    } as T;
  }

  if (endpoint.startsWith('/reports/gst-dashboard')) {
    const url = new URL(`http://dummy${endpoint}`);
    const activeShopId = localStorage.getItem('yorbalance_active_shop_id') || 'demo-shop-1';
    const options: ReportFilterOptions = {
      from: url.searchParams.get('from') || undefined,
      to: url.searchParams.get('to') || undefined,
      financialYear: url.searchParams.get('financialYear') || undefined,
      month: url.searchParams.get('month') || undefined,
      quarter: url.searchParams.get('quarter') || undefined
    };
    const gst_data = clientStore.getGSTDashboard(activeShopId, options);
    const shopData = clientStore.getShopById(activeShopId);
    return {
      shop_id: activeShopId,
      shop_name: shopData?.shop.name || 'Silk Shop',
      gstin: shopData?.shop.gstin || '',
      gst_data,
      disclaimer: 'GST analytics are accounting summaries and must not be presented as proof that a GST return has been filed. Tax figures should be reviewed by the shop chartered accountant before filing GSTR-1, GSTR-3B, or CMP-08.'
    } as T;
  }

  // Phase 7: Settings
  if (endpoint === '/settings') {
    const activeShopId = localStorage.getItem('yorbalance_active_shop_id') || 'demo-shop-1';
    return clientStore.getShopSettings(activeShopId) as T;
  }

  if (endpoint === '/settings/profile' && options.method === 'PUT') {
    const activeShopId = localStorage.getItem('yorbalance_active_shop_id') || 'demo-shop-1';
    const body = options.body ? JSON.parse(options.body as string) : {};
    const updated = clientStore.updateShopProfile(activeShopId, body);
    return { message: 'Shop profile updated successfully', shop: updated } as T;
  }

  if (endpoint === '/settings/gst' && options.method === 'PUT') {
    const activeShopId = localStorage.getItem('yorbalance_active_shop_id') || 'demo-shop-1';
    const body = options.body ? JSON.parse(options.body as string) : {};
    const updated = clientStore.updateGSTSettings(activeShopId, body);
    return { message: 'GST settings updated successfully', shop: updated } as T;
  }

  if (endpoint === '/settings/invoice' && options.method === 'PUT') {
    const activeShopId = localStorage.getItem('yorbalance_active_shop_id') || 'demo-shop-1';
    const body = options.body ? JSON.parse(options.body as string) : {};
    const updated = clientStore.updateInvoiceSettings(activeShopId, body);
    return { message: 'Invoice settings updated successfully', invoice_settings: updated } as T;
  }

  if (endpoint === '/settings/notifications' && options.method === 'PUT') {
    const activeShopId = localStorage.getItem('yorbalance_active_shop_id') || 'demo-shop-1';
    const body = options.body ? JSON.parse(options.body as string) : {};
    const updated = clientStore.updateNotificationSettings(activeShopId, body);
    return { message: 'Notification settings updated successfully', notification_settings: updated } as T;
  }

  if (endpoint === '/settings/preferences' && options.method === 'PUT') {
    const activeShopId = localStorage.getItem('yorbalance_active_shop_id') || 'demo-shop-1';
    const body = options.body ? JSON.parse(options.body as string) : {};
    const updated = clientStore.updateAppPreferences(activeShopId, body);
    return { message: 'App preferences updated successfully', app_preferences: updated } as T;
  }

  if (endpoint.startsWith('/settings/export/')) {
    const activeShopId = localStorage.getItem('yorbalance_active_shop_id') || 'demo-shop-1';
    const type = endpoint.replace('/settings/export/', '').split('?')[0] as 'transactions' | 'parties' | 'reports';
    const res = clientStore.exportShopData(activeShopId, type);
    return res.data as T;
  }

  throw new ApiError(`Route ${endpoint} not implemented in fallback mode`, 'NOT_FOUND', 404);
}

export const api = {
  // Auth & Profile
  getMe: () => request<UserSession>('/auth/me'),
  registerShop: (payload: RegisterShopPayload) =>
    request<{ message: string; shop: Shop; user: any }>('/auth/register-shop', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  resubmitShop: (payload: ResubmitShopPayload) =>
    request<{ message: string; shop: Shop }>('/auth/resubmit', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  // Admin Portal
  getAdminShops: (status?: string) =>
    request<{ shops: Shop[] }>(`/admin/shops${status ? `?status=${status}` : ''}`),
  getAdminShopDetails: (id: string) =>
    request<{ shop: Shop; latest_verification: ShopVerification | null }>(`/admin/shops/${id}`),
  recordAdminDecision: (id: string, payload: AdminDecisionPayload) =>
    request<{ message: string; shop: Shop; verification: ShopVerification }>(`/admin/shops/${id}/decision`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  // Phase 2: Dashboard Analytics & Ledger
  getDashboardSummary: (period?: string) =>
    request<{ summary: any }>(`/analytics/summary${period ? `?period=${period}` : ''}`),
  getDashboardCharts: (period?: string) =>
    request<{ charts: any }>(`/analytics/charts${period ? `?period=${period}` : ''}`),
  getRecentTransactions: (limit = 10, search?: string) => {
    const params = new URLSearchParams();
    if (limit) params.set('limit', limit.toString());
    if (search) params.set('search', search);
    return request<{ transactions: any[]; count: number }>(`/ledger/recent?${params.toString()}`);
  },
  // Phase 4: Mobile Ledger & Transactions
  getLedgerTransactions: (options?: { party_id?: string; type?: string; search?: string; limit?: number }) => {
    const params = new URLSearchParams();
    if (options?.party_id) params.set('party_id', options.party_id);
    if (options?.type) params.set('type', options.type);
    if (options?.search) params.set('search', options.search);
    if (options?.limit) params.set('limit', options.limit.toString());
    const query = params.toString();
    return request<{ transactions: Transaction[]; summary: LedgerSummary; party?: Party | null; count: number }>(
      `/ledger/transactions${query ? `?${query}` : ''}`
    );
  },
  createTransaction: (payload: CreateTransactionPayload) =>
    request<{ message: string; transaction: Transaction }>('/ledger/transactions', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  getTransactionDetails: (id: string) =>
    request<{ transaction: any }>(`/ledger/transactions/${id}`),

  // Phase 3: Party Management
  getParties: (type?: PartyType, search?: string) => {
    const params = new URLSearchParams();
    if (type) params.set('type', type);
    if (search && search.trim()) params.set('search', search.trim());
    const query = params.toString();
    return request<{ parties: Party[]; count: number }>(`/parties${query ? `?${query}` : ''}`);
  },
  getPartyDetails: (id: string) =>
    request<{ party: Party }>(`/parties/${id}`),
  checkDuplicateParty: (payload: { phone: string; gstin?: string; excludePartyId?: string }) =>
    request<DuplicatePartyCheckResult>('/parties/check-duplicate', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  createParty: (payload: CreatePartyPayload) =>
    request<{ message: string; party: Party }>('/parties', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  updateParty: (id: string, payload: UpdatePartyPayload) =>
    request<{ message: string; party: Party }>(`/parties/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),

  // Phase 5: History, Dues & Payments
  getHistory: (options?: HistoryFilterOptions) => {
    const params = new URLSearchParams();
    if (options?.search) params.set('search', options.search);
    if (options?.dateRange) params.set('date_range', options.dateRange);
    if (options?.startDate) params.set('start_date', options.startDate);
    if (options?.endDate) params.set('end_date', options.endDate);
    if (options?.type) params.set('type', options.type);
    if (options?.partyId) params.set('party_id', options.partyId);
    if (options?.status) params.set('status', options.status);
    if (options?.minAmount !== undefined) params.set('min_amount', options.minAmount.toString());
    if (options?.maxAmount !== undefined) params.set('max_amount', options.maxAmount.toString());
    if (options?.limit) params.set('limit', options.limit.toString());
    if (options?.offset) params.set('offset', options.offset.toString());
    const query = params.toString();
    return request<{ summary: HistorySummary; total: number; count: number; transactions: any[] }>(
      `/history${query ? `?${query}` : ''}`
    );
  },
  getHistoryDetails: (transactionId: string) =>
    request<{ transaction: Transaction }>(`/history/${transactionId}`),

  getDuesSummary: () =>
    request<{ summary: DuesSummary }>('/dues/summary'),
  getDues: (options?: DuesFilterOptions) => {
    const params = new URLSearchParams();
    if (options?.view) params.set('view', options.view);
    if (options?.search) params.set('search', options.search);
    if (options?.partyType) params.set('party_type', options.partyType);
    if (options?.status) params.set('status', options.status);
    if (options?.invoiceStartDate) params.set('invoice_start_date', options.invoiceStartDate);
    if (options?.invoiceEndDate) params.set('invoice_end_date', options.invoiceEndDate);
    if (options?.dueStartDate) params.set('due_start_date', options.dueStartDate);
    if (options?.dueEndDate) params.set('due_end_date', options.dueEndDate);
    if (options?.minAmount !== undefined) params.set('min_amount', options.minAmount.toString());
    if (options?.maxAmount !== undefined) params.set('max_amount', options.maxAmount.toString());
    const query = params.toString();
    return request<{ summary: DuesSummary; total: number; count: number; dues: DueRecord[] }>(
      `/dues${query ? `?${query}` : ''}`
    );
  },
  getDueDetails: (transactionId: string) =>
    request<{ due: DueRecord }>(`/dues/${transactionId}`),

  recordPayment: (payload: RecordPaymentPayload) =>
    request<{ message: string; payment: PaymentRecord; transaction?: Transaction }>('/payments', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  recordReturn: (payload: RecordReturnPayload) =>
    request<{ message: string; return: ReturnRecord; transaction: Transaction }>('/payments/returns', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  // Phase 6: Reports & GST Analytics
  getPurchaseLedger: (options?: ReportFilterOptions) => {
    const params = new URLSearchParams();
    if (options?.from) params.set('from', options.from);
    if (options?.to) params.set('to', options.to);
    if (options?.financialYear) params.set('financialYear', options.financialYear);
    if (options?.month) params.set('month', options.month);
    if (options?.quarter) params.set('quarter', options.quarter);
    if (options?.partySearch) params.set('partySearch', options.partySearch);
    if (options?.partyId) params.set('partyId', options.partyId);
    const query = params.toString();
    return request<{ shop_id: string; shop_name: string; gstin: string; report: PurchaseLedgerReport }>(
      `/reports/purchase-ledger${query ? `?${query}` : ''}`
    );
  },
  getSalesLedger: (options?: ReportFilterOptions) => {
    const params = new URLSearchParams();
    if (options?.from) params.set('from', options.from);
    if (options?.to) params.set('to', options.to);
    if (options?.financialYear) params.set('financialYear', options.financialYear);
    if (options?.month) params.set('month', options.month);
    if (options?.quarter) params.set('quarter', options.quarter);
    if (options?.partySearch) params.set('partySearch', options.partySearch);
    if (options?.partyId) params.set('partyId', options.partyId);
    const query = params.toString();
    return request<{ shop_id: string; shop_name: string; gstin: string; report: SalesLedgerReport }>(
      `/reports/sales-ledger${query ? `?${query}` : ''}`
    );
  },
  getJobWorkLedger: (options?: ReportFilterOptions) => {
    const params = new URLSearchParams();
    if (options?.from) params.set('from', options.from);
    if (options?.to) params.set('to', options.to);
    if (options?.financialYear) params.set('financialYear', options.financialYear);
    if (options?.month) params.set('month', options.month);
    if (options?.quarter) params.set('quarter', options.quarter);
    if (options?.partySearch) params.set('partySearch', options.partySearch);
    if (options?.partyId) params.set('partyId', options.partyId);
    const query = params.toString();
    return request<{ shop_id: string; shop_name: string; gstin: string; report: ArtisanJobWorkReport }>(
      `/reports/job-work-ledger${query ? `?${query}` : ''}`
    );
  },
  getGSTDashboard: (options?: ReportFilterOptions) => {
    const params = new URLSearchParams();
    if (options?.from) params.set('from', options.from);
    if (options?.to) params.set('to', options.to);
    if (options?.financialYear) params.set('financialYear', options.financialYear);
    if (options?.month) params.set('month', options.month);
    if (options?.quarter) params.set('quarter', options.quarter);
    const query = params.toString();
    return request<{ shop_id: string; shop_name: string; gstin: string; gst_data: GSTDashboardData; disclaimer: string }>(
      `/reports/gst-dashboard${query ? `?${query}` : ''}`
    );
  },

  // Phase 7: Settings
  getShopSettings: () =>
    request<ShopSettingsData>('/settings'),
  updateShopProfile: (payload: UpdateShopProfilePayload) =>
    request<{ message: string; shop: Shop }>('/settings/profile', {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),
  updateGSTSettings: (payload: UpdateGSTSettingsPayload) =>
    request<{ message: string; shop: Shop }>('/settings/gst', {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),
  updateInvoiceSettings: (payload: Partial<InvoiceSettings>) =>
    request<{ message: string; invoice_settings: InvoiceSettings }>('/settings/invoice', {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),
  updateNotificationSettings: (payload: Partial<NotificationSettings>) =>
    request<{ message: string; notification_settings: NotificationSettings }>('/settings/notifications', {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),
  updateAppPreferences: (payload: Partial<AppPreferences>) =>
    request<{ message: string; app_preferences: AppPreferences }>('/settings/preferences', {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),
  exportShopData: async (type: 'transactions' | 'parties' | 'reports') => {
    return request<string>(`/settings/export/${type}`);
  }
};
