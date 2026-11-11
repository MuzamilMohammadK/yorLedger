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
  state?: string;
  state_code: string;
  pin_code?: string;
  logo_url?: string | null;
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
  pin_code?: string;
  default_gst_bp: number; // e.g. 500 for 5%
  documents?: ShopDocumentUpload[];
  /** @deprecated single-document upload; use documents */
  document_url?: string | null;
  document_name?: string | null;
}

export interface ResubmitShopPayload {
  shop_name?: string;
  owner_name?: string;
  gstin?: string;
  mobile?: string;
  address?: string;
  state_code?: string;
  pin_code?: string;
  default_gst_bp?: number;
  documents?: ShopDocumentUpload[];
  removed_documents?: ShopDocumentType[];
  /** @deprecated single-document upload; use documents */
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
export type TransactionType = 'SALE' | 'PURCHASE' | 'JOB_WORK' | 'RETURN' | 'PAYMENT';
export type PaymentStatus = 'PENDING' | 'PARTIAL' | 'SETTLED' | 'OVERDUE';
export type PaymentMode = 'CASH' | 'CHEQUE' | 'NEFT' | 'UPI';

export interface Party {
  id: string;
  shop_id: string;
  name: string; // Shop / Business Name
  type: PartyType;
  owner_name: string;
  phone: string; // Primary Mobile Number
  additional_phones?: string[]; // Dynamic additional mobile numbers
  alt_phone?: string | null; // Backwards compatibility with Migration 002
  gstin?: string | null;
  address: string;
  state: string;
  state_code: string;
  pin_code: string;
  notes?: string | null;
  current_balance?: number; // Outstanding amount in Rupees
  balance_type?: 'RECEIVABLE' | 'PAYABLE' | 'SETTLED';
  created_at: string;
  updated_at?: string;
}

export interface CreatePartyPayload {
  name: string; // Shop / Business Name
  type: PartyType;
  owner_name: string;
  phone: string;
  additional_phones?: string[];
  gstin?: string | null;
  address: string;
  state: string;
  state_code?: string;
  pin_code: string;
  notes?: string | null;
}

export interface UpdatePartyPayload {
  name?: string;
  type?: PartyType;
  owner_name?: string;
  phone?: string;
  additional_phones?: string[];
  gstin?: string | null;
  address?: string;
  state?: string;
  state_code?: string;
  pin_code?: string;
  notes?: string | null;
}

export interface DuplicatePartyCheckResult {
  isDuplicate: boolean;
  field?: 'phone' | 'gstin';
  existingParty?: Party;
  message?: string;
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

export interface PaymentRecord {
  id: string;
  shop_id: string;
  transaction_id?: string | null;
  party_id: string;
  party_name?: string;
  party_type?: PartyType;
  amount_paise: number;
  amount_rupees: number;
  payment_mode: 'CASH' | 'CHEQUE' | 'NEFT';
  payment_date: string;
  reference_number?: string | null;
  cheque_number?: string | null;
  cheque_date?: string | null;
  deposit_date?: string | null;
  clearing_status?: 'PENDING' | 'CLEARED' | 'BOUNCED' | null;
  collected_by?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface ReturnRecord {
  id: string;
  shop_id: string;
  transaction_id: string;
  party_id: string;
  amount_paise: number;
  amount_rupees: number;
  reason?: string | null;
  return_date: string;
  created_at: string;
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
  due_date?: string | null;
  subtotal_paise: number;
  tax_paise: number;
  cgst_paise: number;
  sgst_paise: number;
  igst_paise: number;
  grand_total_paise: number;
  paid_paise: number;
  return_paise?: number;
  pending_paise: number;
  status: PaymentStatus;
  items?: TransactionItem[];
  payments?: PaymentRecord[];
  returns?: ReturnRecord[];
  notes?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface CreateTransactionPayload {
  party_id: string;
  type: TransactionType;
  invoice_number?: string;
  invoice_date?: string;
  due_date?: string | null;
  amount_rupees: number;
  paid_rupees?: number;
  gst_rate_bp?: number; // e.g. 500 for 5%
  is_inter_state?: boolean;
  notes?: string | null;
  item_name?: string;
}

export interface RecordPaymentPayload {
  party_id: string;
  transaction_id?: string | null;
  amount_rupees: number;
  payment_mode: 'CASH' | 'CHEQUE' | 'NEFT';
  payment_date?: string;
  reference_number?: string | null;
  cheque_number?: string | null;
  cheque_date?: string | null;
  deposit_date?: string | null;
  clearing_status?: 'PENDING' | 'CLEARED' | 'BOUNCED';
  notes?: string | null;
}

export interface RecordReturnPayload {
  transaction_id: string;
  amount_rupees: number;
  reason?: string | null;
  return_date?: string;
}

export interface HistorySummary {
  total_sales: number;      // In Rupees
  total_purchases: number;  // In Rupees
  total_job_work: number;   // In Rupees
  total_payments: number;   // In Rupees
  total_returns: number;    // In Rupees
}

export interface HistoryFilterOptions {
  search?: string;
  dateRange?: string; // 'all' | 'today' | 'this_week' | 'this_month' | 'this_fy'
  startDate?: string;
  endDate?: string;
  type?: 'ALL' | 'SALE' | 'PURCHASE' | 'JOB_WORK' | 'PAYMENT' | 'RETURN';
  partyId?: string;
  status?: 'ALL' | 'PENDING' | 'PARTIAL' | 'SETTLED' | 'OVERDUE';
  minAmount?: number;
  maxAmount?: number;
  limit?: number;
  offset?: number;
}

export interface DuesSummary {
  total_receivable: number;   // In Rupees
  total_payable: number;      // In Rupees
  overdue_receivable: number; // In Rupees
  overdue_payable: number;    // In Rupees
}

export interface DueRecord {
  id: string;
  party_id: string;
  party_name: string;
  party_type: PartyType;
  invoice_number: string;
  invoice_date: string;
  due_date?: string | null;
  original_amount: number; // In Rupees
  returns: number;         // In Rupees
  amount_paid: number;     // In Rupees
  remaining_due: number;   // In Rupees
  status: 'PENDING' | 'PARTIAL' | 'OVERDUE' | 'SETTLED';
  type: TransactionType;
}

export interface DuesFilterOptions {
  view?: 'ALL' | 'RECEIVABLE' | 'PAYABLE';
  search?: string;
  partyType?: 'ALL' | PartyType;
  status?: 'ALL' | 'PENDING' | 'PARTIAL' | 'OVERDUE' | 'SETTLED';
  invoiceStartDate?: string;
  invoiceEndDate?: string;
  dueStartDate?: string;
  dueEndDate?: string;
  minAmount?: number;
  maxAmount?: number;
}

export interface LedgerSummary {
  total_receivable: number; // in Rupees
  total_payable: number;    // in Rupees
  total_transactions: number;
}

export interface LedgerFilterOptions {
  partyId?: string;
  type?: 'ALL' | 'SALE' | 'PURCHASE' | 'JOB_WORK' | 'PAYMENT';
  search?: string;
  limit?: number;
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

// -------------------------------------------------------------
// Phase 6 & 7: Reports, GST Analytics, and Settings
// -------------------------------------------------------------

export interface ReportFilterOptions {
  from?: string; // YYYY-MM-DD
  to?: string;   // YYYY-MM-DD
  financialYear?: string; // e.g. "2025-2026", "2026-2027"
  month?: string; // e.g. "2026-04"
  quarter?: string; // e.g. "Q1", "Q2", "Q3", "Q4"
  partySearch?: string;
  partyId?: string;
}

export interface PurchaseLedgerItem {
  id: string;
  supplier_name: string;
  supplier_gstin?: string | null;
  has_gstin: boolean;
  invoice_number: string;
  bill_date: string;
  taxable_value: number; // In Rupees
  cgst: number;          // In Rupees
  sgst: number;          // In Rupees
  igst: number;          // In Rupees
  total_gst: number;     // In Rupees
  net_purchase_amount: number; // In Rupees (grand total minus returns)
  returns: number;       // In Rupees
  eligible_itc: number;  // In Rupees (ITC only for suppliers with GSTIN, minus return tax)
  payment_status: PaymentStatus;
}

export interface PurchaseLedgerReport {
  items: PurchaseLedgerItem[];
  totals: {
    total_purchase_value: number;
    total_taxable_value: number;
    total_cgst: number;
    total_sgst: number;
    total_igst: number;
    total_gst: number;
    total_returns: number;
    eligible_itc: number;
  };
  period: { from: string; to: string; label?: string };
}

export interface SalesLedgerItem {
  id: string;
  customer_name: string;
  customer_gstin?: string | null;
  invoice_number: string;
  bill_date: string;
  is_inter_state: boolean;
  sales_type: 'INTRA_STATE' | 'INTER_STATE';
  taxable_value: number; // In Rupees
  cgst: number;          // In Rupees
  sgst: number;          // In Rupees
  igst: number;          // In Rupees
  total_gst: number;     // In Rupees
  grand_total: number;   // In Rupees
  amount_paid: number;   // In Rupees
  remaining_due: number; // In Rupees
  payment_status: PaymentStatus;
}

export interface SalesLedgerReport {
  items: SalesLedgerItem[];
  totals: {
    total_taxable_sales: number;
    total_cgst: number;
    total_sgst: number;
    total_igst: number;
    total_output_gst: number;
    total_sales_value: number;
    total_paid: number;
    total_outstanding_due: number;
    intra_state_sales: number;
    inter_state_sales: number;
  };
  period: { from: string; to: string; label?: string };
}

export interface ArtisanJobWorkItem {
  id: string;
  artisan_name: string;
  artisan_id: string;
  job_work_reference: string;
  transaction_date: string;
  work_details: string;
  quantity?: number;
  job_work_amount: number; // Taxable in Rupees
  gst: number;             // In Rupees
  total_amount: number;    // In Rupees
  amount_paid: number;     // In Rupees
  outstanding_amount: number; // In Rupees
  payment_status: PaymentStatus;
}

export interface ArtisanSummary {
  artisan_id: string;
  artisan_name: string;
  total_job_work_value: number;
  total_gst: number;
  total_payments: number;
  outstanding_amount: number;
  transaction_count: number;
}

export interface ArtisanJobWorkReport {
  items: ArtisanJobWorkItem[];
  artisan_summaries: ArtisanSummary[];
  totals: {
    total_job_work_value: number;
    total_gst: number;
    total_payments: number;
    total_outstanding: number;
  };
  period: { from: string; to: string; label?: string };
}

export interface GSTDashboardData {
  summary: {
    total_taxable_sales: number;
    output_gst: number;
    eligible_itc: number;
    net_gst_payable: number; // Output Tax - Eligible ITC
  };
  tax_breakdown: {
    output_cgst: number;
    output_sgst: number;
    output_igst: number;
    input_cgst: number;
    input_sgst: number;
    input_igst: number;
  };
  charts: {
    monthly_sales_vs_purchases: Array<{ month: string; sales: number; purchases: number }>;
    monthly_output_gst_trend: Array<{ month: string; output_gst: number; cgst: number; sgst: number; igst: number }>;
    monthly_itc_trend: Array<{ month: string; eligible_itc: number }>;
    tax_component_comparison: Array<{ component: string; output: number; input: number }>;
    monthly_net_payable_trend: Array<{ month: string; net_payable: number }>;
  };
  period: { from: string; to: string; label?: string };
}

// Settings Models
export interface InvoiceSettings {
  invoice_prefix: string;
  suggested_next_number: number;
  date_format: string; // "DD/MM/YYYY" | "YYYY-MM-DD"
  show_logo: boolean;
  show_gstin: boolean;
  show_tax_breakdown: boolean;
  invoice_footer: string;
  terms_and_conditions: string;
}

export interface NotificationSettings {
  push_notifications: boolean;
  in_app_notifications: boolean;
  due_reminders: boolean;
  reminder_lead_time_days: 0 | 1 | 3 | 7;
  daily_reminder_time: string;
}

export interface AppPreferences {
  currency: string; // 'INR'
  time_zone: string; // 'Asia/Kolkata'
  date_format: string; // 'DD/MM/YYYY'
  theme: 'light' | 'dark' | 'system';
  language: string; // 'en' | 'te' | 'ta' | 'kn' | 'hi'
  default_landing_page: string; // '/dashboard' | '/ledger' | '/dues'
}

export interface ShopSettingsData {
  shop: Shop;
  invoice_settings: InvoiceSettings;
  notification_settings: NotificationSettings;
  app_preferences: AppPreferences;
}

export interface UpdateShopProfilePayload {
  name?: string;
  owner_name?: string;
  phone?: string;
  email?: string;
  address?: string;
  state?: string;
  pin_code?: string;
  logo_url?: string | null;
}

export interface UpdateGSTSettingsPayload {
  gstin?: string;
  default_gst_bp?: number; // In basis points (e.g. 500 = 5%, 1200 = 12%, 1800 = 18%)
  state_code?: string;
}


// ---------------------------------------------------------------------------
// Spec-aligned bill / payment / return payloads (Firestore data layer).
// Money in integer paise, GST in basis points.
// ---------------------------------------------------------------------------
export type BillKind = 'SALE' | 'PURCHASE' | 'JOB_WORK';

export interface BillItemPayload {
  name: string;
  qty: number;   // > 0
  rate: number;  // paise, >= 0
}

export interface CreateBillPayload {
  kind: BillKind;
  party_id: string;
  invoice_no: string;        // digits; normalized (leading zeros stripped)
  bill_date: string;         // YYYY-MM-DD (IST)
  gst_bp: number;            // copied onto the bill as a snapshot
  tax_mode_override?: 'INTRA' | 'INTER' | null; // manual override per bill (spec §8.6)
  items: BillItemPayload[];
  remind_on?: string | null;
  remind_lead_days?: 0 | 1 | 3 | 7 | null;
  notes?: string | null;
  source?: 'MANUAL' | 'SCAN';
}

export type PaymentPayload =
  | { mode: 'CASH'; bill_id: string; amount: number; paid_on: string; collected_by: string; notes?: string | null }
  | { mode: 'CHEQUE'; bill_id: string; amount: number; cheque_no?: string | null; cheque_date: string;
      deposit_date?: string | null; clearing_date?: string | null; notes?: string | null }
  | { mode: 'NEFT'; bill_id: string; amount: number; utr_no: string; txn_date: string; notes?: string | null };

export interface ReturnPayload {
  bill_id: string;
  returned_on: string;
  lines: { index: number; qty: number }[];
  reason?: string | null;
}

// ---------------------------------------------------------------------------
// §4.6 Shop verification documents (stored privately; owner + admin only).
// ---------------------------------------------------------------------------
export type ShopDocumentType = 'GST_CERTIFICATE' | 'ADDRESS_PROOF' | 'OWNERSHIP_PROOF' | 'SHOP_FRONT_PHOTO';
export const SHOP_DOCUMENT_TYPES: ShopDocumentType[] = ['GST_CERTIFICATE', 'ADDRESS_PROOF', 'OWNERSHIP_PROOF', 'SHOP_FRONT_PHOTO'];
/** Product decision (spec says confirm): GST certificate is mandatory, the rest optional. */
export const REQUIRED_SHOP_DOCUMENTS: ShopDocumentType[] = ['GST_CERTIFICATE'];

export interface ShopDocument {
  type: ShopDocumentType;
  data_url: string;          // compressed JPEG data URL
  file_name: string;
  uploaded_at: string;
  verification_status: 'PENDING' | 'APPROVED' | 'REJECTED';
  admin_comment: string | null;
}

/** New document chosen in the form, not yet saved. */
export interface ShopDocumentUpload { type: ShopDocumentType; data_url: string; file_name: string }
