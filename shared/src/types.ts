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
  document_url?: string | null; // Document in JPEG/JPG format
  document_name?: string | null;
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
  document_url?: string | null; // JPEG/JPG document data URL or link
  document_name?: string | null;
}

export interface ResubmitShopPayload {
  shop_name?: string;
  owner_name?: string;
  gstin?: string;
  mobile?: string;
  address?: string;
  state_code?: string;
  default_gst_bp?: number;
  document_url?: string | null;
  document_name?: string | null;
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

// -------------------------------------------------------------
// Phase 2 & 3: Ledger, Parties, Dues, and Dashboard Analytics
// -------------------------------------------------------------

export type PartyType = 'CUSTOMER' | 'SUPPLIER' | 'ARTISAN';
export type TransactionType = 'SALE' | 'PURCHASE' | 'JOB_WORK' | 'RETURN';
export type PaymentStatus = 'PENDING' | 'PARTIAL' | 'SETTLED';
export type PaymentMode = 'CASH' | 'CHEQUE' | 'NEFT' | 'UPI';

export interface Party {
  id: string;
  shop_id: string;
  name: string;
  type: PartyType;
  owner_name?: string | null;
  gstin?: string | null;
  phone: string;
  alt_phone?: string | null;
  address?: string | null;
  state_code?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface TransactionItem {
  id: string;
  transaction_id: string;
  item_name: string;
  quantity: number;
  rate_paise: number;
  gst_rate_bp: number;
  amount_paise: number;
}

export interface Transaction {
  id: string;
  shop_id: string;
  party_id: string;
  party_name: string;
  party_type: PartyType;
  type: TransactionType;
  invoice_number: string;
  invoice_date: string;
  subtotal_paise: number;
  tax_paise: number;
  cgst_paise: number;
  sgst_paise: number;
  igst_paise: number;
  grand_total_paise: number;
  paid_paise: number;
  pending_paise: number;
  status: PaymentStatus;
  items?: TransactionItem[];
  notes?: string | null;
  created_at: string;
  updated_at?: string;
}

export type DateRangeOption = 'this_month' | 'last_30_days' | 'this_quarter' | 'this_fy' | 'all_time';

export interface DashboardSummary {
  total_transactions: number;
  pending_amount: number; // in Rupees
  settled_amount: number; // in Rupees
  total_value: number; // in Rupees
  net_balance: number; // in Rupees (sales - purchases)
  total_sales: number; // in Rupees
  total_purchases: number; // in Rupees
  period: DateRangeOption;
  period_label: string;
}

export interface MonthlyComparisonPoint {
  month: string;
  sales: number;
  purchases: number;
}

export interface SalesTrendPoint {
  date: string;
  sales: number;
  invoices: number;
}

export interface PendingSettledPoint {
  name: string;
  value: number;
  count: number;
}

export interface DashboardCharts {
  sales_vs_purchases: MonthlyComparisonPoint[];
  sales_trend: SalesTrendPoint[];
  pending_vs_settled: PendingSettledPoint[];
  summary: {
    total_sales: number;
    total_purchases: number;
    net_balance: number;
  };
}
