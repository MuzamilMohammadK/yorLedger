import { AdminRole, ShopStatus } from './types.js';

export function maskPhone(phone?: string | null): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length < 6) return digits ? '******' : '—';
  return `${digits.slice(0, 2)}****${digits.slice(-4)}`;
}

export function maskGstin(gstin?: string | null): string {
  const g = (gstin ?? '').trim().toUpperCase();
  if (g.length !== 15) return g ? '***************' : '—';
  return `${g.slice(0, 2)}*****${g.slice(10)}`;
}

export interface AdminOverviewData {
  total_shops: number;
  pending_verification: number;
  approved_shops: number;
  rejected_shops: number;
  suspended_shops: number;
  signups_today: number;
  signups_7d: number;
  signups_30d: number;
  active_daily: number;
  active_weekly: number;
  active_monthly: number;
  bills_today: number;
  bills_month: number;
  inactive_30d: number;
  prev_signups_30d: number;
  prev_bills_month: number;
  signups_series: Array<{ date: string; count: number }>;
  bills_series: Array<{ date: string; count: number }>;
  funnel: {
    submitted: number;
    approved: number;
    first_bill: number;
  };
}

export interface AdminShopSummary {
  id: string;
  name: string;
  owner_name: string;
  masked_phone: string;
  masked_gstin: string;
  email: string;
  state_code: string;
  state?: string;
  status: ShopStatus;
  is_test_shop: boolean;
  gstin_valid: boolean;
  gstin_error?: string | null;
  duplicate_gstin: boolean;
  plan: string;
  created_at: string;
  updated_at: string;
  last_active_at?: string | null;
  verified_at?: string | null;
  verified_by?: string | null;
}

export interface AdminShopDetail extends AdminShopSummary {
  address: string;
  pin_code?: string | null;
  default_gst_bp: number;
  rejection_reason?: string | null;
  suspension_reason?: string | null;
  admin_notes?: string | null;
  feature_flags: Record<string, boolean>;
  counts: {
    bills: number;
    parties: number;
    items: number;
  };
  documents: Array<{
    type: string;
    data_url: string;
    file_name: string;
    uploaded_at: string;
    verification_status: 'PENDING' | 'APPROVED' | 'REJECTED';
    admin_comment?: string | null;
  }>;
  history: Array<{
    id: string;
    decision: string;
    reason?: string | null;
    decided_by: string;
    decided_at: string;
  }>;
}

export interface AdminAuditRecord {
  id: string;
  admin_uid: string;
  admin_email: string;
  admin_role: AdminRole;
  action: string;
  target_shop_id?: string | null;
  target_shop_name?: string | null;
  reason?: string | null;
  meta?: Record<string, unknown> | null;
  created_at: string;
}

export type ServiceStatusLevel = 'OK' | 'DEGRADED' | 'DOWN';

export interface AdminHealthService {
  key: 'website' | 'login' | 'database' | 'functions' | 'storage' | 'backup';
  label: string;
  status: ServiceStatusLevel;
  latency_ms?: number | null;
  message?: string | null;
  last_checked: string;
}

export interface AdminHealthSnapshot {
  overall: ServiceStatusLevel;
  last_checked: string;
  services: AdminHealthService[];
  error_rate_24h: number;
  failed_logins_24h: number;
  recent_errors: Array<{
    id: string;
    message: string;
    count: number;
    first_seen: string;
    last_seen: string;
    shops_affected: number;
  }>;
  history_24h: Array<{ timestamp: string; overall: ServiceStatusLevel; latency_ms: number }>;
  history_7d: Array<{ date: string; uptime_pct: number; incidents: number }>;
}

export interface AdminUsageSnapshot {
  snapshot_date: string;
  collections: Array<{ name: string; count: number; estimated_kb: number }>;
  total_documents: number;
  estimated_db_mb: number;
  weekly_growth_pct: number;
  reads_today: number;
  writes_today: number;
  storage_used_mb: number;
  limits: {
    daily_reads_limit: number;
    daily_writes_limit: number;
    storage_limit_mb: number;
    db_limit_mb: number;
    warning_threshold_pct: number;
  };
  forecast_days_to_limit: number | null;
  top_shops: Array<{
    shop_id: string;
    shop_name: string;
    bills_count: number;
    parties_count: number;
    total_docs: number;
  }>;
}

export interface AdminDataQualityReport {
  checked_at: string;
  duplicate_items_count: number;
  duplicate_parties_count: number;
  negative_stock_count: number;
  mismatched_bills_count: number;
  tally_mismatch_count: number;
  issues: Array<{
    kind: 'DUPLICATE_ITEM' | 'DUPLICATE_PARTY' | 'NEGATIVE_STOCK' | 'BILL_TOTAL_MISMATCH' | 'TALLY_MISMATCH';
    shop_id: string;
    shop_name: string;
    detail: string;
  }>;
}

export interface AdminUserSummary {
  uid: string;
  email: string;
  shop_id: string | null;
  shop_name: string | null;
  role: string;
  admin_role?: AdminRole | null;
  last_login_at: string | null;
  disabled: boolean;
}

export interface AdminAnnouncementConfig {
  message: string;
  type: 'info' | 'warning' | 'critical';
  start_date: string;
  end_date: string;
  active: boolean;
  maintenance_mode: boolean;
  maintenance_message: string;
}

export interface AdminFeedbackItem {
  id: string;
  uid: string;
  shop_id?: string | null;
  shop_name?: string | null;
  email: string;
  subject: string;
  message: string;
  status: 'NEW' | 'IN_PROGRESS' | 'DONE';
  created_at: string;
  updated_at?: string;
}

export interface AdminSettingsConfig {
  limits: {
    daily_reads_limit: number;
    daily_writes_limit: number;
    storage_limit_mb: number;
    db_limit_mb: number;
    warning_threshold_pct: number;
  };
  alerts: {
    super_admin_email: string;
    whatsapp_number: string;
    whatsapp_webhook_url: string;
    pending_hours_threshold: number;
    quota_warning_pct: number;
    notify_on_service_down: boolean;
    notify_on_backup_fail: boolean;
  };
  security: {
    require_2step_for_admins: boolean;
  };
}

export interface AdminBackupStatus {
  last_backup_at: string | null;
  last_backup_status: ServiceStatusLevel;
  requests: Array<{
    id: string;
    shop_id: string;
    shop_name: string;
    action: 'EXPORT' | 'DELETE';
    status: 'PENDING' | 'COMPLETED' | 'REJECTED';
    requested_by: string;
    reason: string;
    created_at: string;
  }>;
}
