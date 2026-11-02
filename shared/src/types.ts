export type ShopStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type UserRole = 'OWNER' | 'ADMIN';

export interface Shop {
  id: string;
  gstin: string;
  name: string;
  owner_name: string;
  phone: string;
  email: string;
  address: string;
  state_code: string;
  status: ShopStatus;
  default_gst_bp: number; // In basis points (500 = 5%, 1200 = 12%, 1800 = 18%)
  verified_at?: string | null;
  verified_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  shop_id: string | null;
  firebase_uid: string;
  email: string;
  role: UserRole;
  created_at: string;
}

export interface ShopVerification {
  id: string;
  shop_id: string;
  submitted_details: Record<string, unknown>;
  decision: 'APPROVED' | 'REJECTED';
  reason?: string | null;
  decided_by: string;
  decided_at: string;
}

export interface RegisterShopPayload {
  shop_name: string;
  owner_name: string;
  gstin: string;
  mobile: string;
  email: string;
  address: string;
  state_code: string;
  default_gst_bp: number; // e.g. 500 for 5%
}

export interface ResubmitShopPayload {
  shop_name?: string;
  owner_name?: string;
  gstin?: string;
  mobile?: string;
  address?: string;
  state_code?: string;
  default_gst_bp?: number;
}

export interface AdminDecisionPayload {
  decision: 'APPROVED' | 'REJECTED';
  reason?: string;
}

export interface UserSession {
  user: User;
  shop: Shop | null;
  latest_verification?: ShopVerification | null;
}
