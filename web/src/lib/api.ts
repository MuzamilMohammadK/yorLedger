import {
  RegisterShopPayload,
  ResubmitShopPayload,
  AdminDecisionPayload,
  UserSession,
  Shop,
  ShopVerification
} from '@yorbalance/shared';

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

  if (authTokenGetter) {
    const token = await authTokenGetter();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(
      data.message || `Request failed with status ${response.status}`,
      data.code || 'UNKNOWN_ERROR',
      response.status,
      data.fields
    );
  }

  return data as T;
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
    })
};

