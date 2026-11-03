import {
  RegisterShopPayload,
  ResubmitShopPayload,
  AdminDecisionPayload,
  UserSession,
  Shop,
  ShopVerification
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

  // Phase 2: /ledger/transactions/:id
  if (endpoint.startsWith('/ledger/transactions/')) {
    const id = endpoint.replace('/ledger/transactions/', '');
    const activeShopId = localStorage.getItem('yorbalance_active_shop_id') || 'demo-shop-1';
    const transaction = clientStore.getTransactionById(activeShopId, id);
    if (!transaction) throw new ApiError('Transaction not found', 'NOT_FOUND', 404);
    return { transaction } as T;
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
  getTransactionDetails: (id: string) =>
    request<{ transaction: any }>(`/ledger/transactions/${id}`)
};
