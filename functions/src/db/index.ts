import pg from 'pg';
import { v4 as uuidv4 } from 'uuid';
import {
  Shop,
  User,
  ShopVerification,
  RegisterShopPayload,
  AdminDecisionPayload,
  ResubmitShopPayload,
  DashboardSummary,
  DashboardCharts,
  Transaction,
  Party,
  PartyType,
  CreatePartyPayload,
  UpdatePartyPayload,
  DuplicatePartyCheckResult,
  CreateTransactionPayload,
  LedgerSummary,
  LedgerFilterOptions,
  PaymentRecord,
  ReturnRecord,
  RecordPaymentPayload,
  RecordReturnPayload,
  HistorySummary,
  HistoryFilterOptions,
  DuesSummary,
  DueRecord,
  DuesFilterOptions,
  DateRangeOption,
  PaymentStatus,
  ReportFilterOptions,
  PurchaseLedgerItem,
  PurchaseLedgerReport,
  SalesLedgerItem,
  SalesLedgerReport,
  ArtisanJobWorkItem,
  ArtisanSummary,
  ArtisanJobWorkReport,
  GSTDashboardData,
  ShopSettingsData,
  InvoiceSettings,
  NotificationSettings,
  AppPreferences,
  UpdateShopProfilePayload,
  UpdateGSTSettingsPayload
} from '@yorbalance/shared';
import {
  createSeedParties,
  createSeedTransactions,
  calculateSummary,
  calculateCharts
} from './seedData.js';

const { Pool } = pg;

export interface DatabaseService {
  isPostgres(): boolean;
  findUserByFirebaseUid(uid: string): Promise<User | null>;
  findUserByEmail(email: string): Promise<User | null>;
  findShopById(shopId: string): Promise<Shop | null>;
  findShopByGstin(gstin: string): Promise<Shop | null>;
  createShopAndUser(payload: RegisterShopPayload, firebaseUid: string): Promise<{ shop: Shop; user: User }>;
  resubmitShopDetails(shopId: string, payload: ResubmitShopPayload): Promise<Shop>;
  getPendingShops(): Promise<Shop[]>;
  getAllShops(statusFilter?: string): Promise<Shop[]>;
  getLatestVerification(shopId: string): Promise<ShopVerification | null>;
  recordAdminDecision(shopId: string, adminEmail: string, decision: AdminDecisionPayload): Promise<{ shop: Shop; verification: ShopVerification }>;
  seedAdminUser(email: string, firebaseUid: string): Promise<User>;

  // Phase 2: Analytics & Transactions
  getDashboardSummary(shopId: string, period?: DateRangeOption): Promise<DashboardSummary>;
  getDashboardCharts(shopId: string, period?: DateRangeOption): Promise<DashboardCharts>;
  getRecentTransactions(shopId: string, limit?: number, search?: string): Promise<Transaction[]>;
  getTransactionById(shopId: string, transactionId: string): Promise<Transaction | null>;

  // Phase 3: Party Management
  getParties(shopId: string, type?: PartyType, search?: string): Promise<Party[]>;
  getPartyById(shopId: string, partyId: string): Promise<Party | null>;
  createParty(shopId: string, payload: CreatePartyPayload): Promise<Party>;
  updateParty(shopId: string, partyId: string, payload: UpdatePartyPayload): Promise<Party>;
  checkDuplicateParty(shopId: string, phone: string, gstin?: string | null, excludePartyId?: string): Promise<DuplicatePartyCheckResult>;

  // Phase 4: Mobile Ledger & Transactions
  getLedgerTransactions(shopId: string, options?: LedgerFilterOptions): Promise<{ transactions: Transaction[]; summary: LedgerSummary }>;
  createTransaction(shopId: string, payload: CreateTransactionPayload): Promise<Transaction>;

  // Phase 5: History, Dues & Payments
  getHistory(shopId: string, options?: HistoryFilterOptions): Promise<{ transactions: any[]; summary: HistorySummary; total: number }>;
  getTransactionHistoryDetails(shopId: string, transactionId: string): Promise<Transaction | null>;
  getDues(shopId: string, options?: DuesFilterOptions): Promise<{ dues: DueRecord[]; summary: DuesSummary; total: number }>;
  getDuesSummary(shopId: string): Promise<DuesSummary>;
  getDueById(shopId: string, transactionId: string): Promise<DueRecord | null>;
  recordPayment(shopId: string, payload: RecordPaymentPayload): Promise<{ payment: PaymentRecord; transaction?: Transaction }>;
  getPaymentById(shopId: string, paymentId: string): Promise<PaymentRecord | null>;
  recordReturn(shopId: string, payload: RecordReturnPayload): Promise<{ returnRecord: ReturnRecord; transaction: Transaction }>;

  // Phase 6: Reports & GST Analytics
  getPurchaseLedger(shopId: string, options?: ReportFilterOptions): Promise<PurchaseLedgerReport>;
  getSalesLedger(shopId: string, options?: ReportFilterOptions): Promise<SalesLedgerReport>;
  getJobWorkLedger(shopId: string, options?: ReportFilterOptions): Promise<ArtisanJobWorkReport>;
  getGSTDashboard(shopId: string, options?: ReportFilterOptions): Promise<GSTDashboardData>;

  // Phase 7: Settings
  getShopSettings(shopId: string): Promise<ShopSettingsData>;
  updateShopProfile(shopId: string, payload: UpdateShopProfilePayload): Promise<Shop>;
  updateGSTSettings(shopId: string, payload: UpdateGSTSettingsPayload): Promise<Shop>;
  updateInvoiceSettings(shopId: string, payload: Partial<InvoiceSettings>): Promise<InvoiceSettings>;
  updateNotificationSettings(shopId: string, payload: Partial<NotificationSettings>): Promise<NotificationSettings>;
  updateAppPreferences(shopId: string, payload: Partial<AppPreferences>): Promise<AppPreferences>;
  exportShopData(shopId: string, dataType: 'transactions' | 'parties' | 'reports'): Promise<{ filename: string; contentType: string; data: string }>;
}

function enrichPartyWithBalance(party: Party, transactions: Transaction[]): Party {
  const partyTxs = transactions.filter(t => t.party_id === party.id);
  const totalPendingPaise = partyTxs.reduce((sum, t) => sum + (t.pending_paise || 0), 0);
  const amountRupees = Math.round(totalPendingPaise / 100);

  let balance_type: 'RECEIVABLE' | 'PAYABLE' | 'SETTLED' = 'SETTLED';
  if (amountRupees > 0) {
    if (party.type === 'CUSTOMER') {
      balance_type = 'RECEIVABLE';
    } else {
      balance_type = 'PAYABLE';
    }
  }

  return {
    ...party,
    current_balance: amountRupees,
    balance_type
  };
}

function resolveReportDateRange(options?: ReportFilterOptions): { from: string; to: string; label: string } {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  if (options?.from && options?.to) {
    return { from: options.from, to: options.to, label: `${options.from} to ${options.to}` };
  }

  if (options?.month) {
    const [yStr, mStr] = options.month.split('-');
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10);
    const lastDay = new Date(y, m, 0).getDate();
    const from = `${yStr}-${mStr.padStart(2, '0')}-01`;
    const to = `${yStr}-${mStr.padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { from, to, label: `Month: ${options.month}` };
  }

  if (options?.quarter) {
    let fyStartYear = currentMonth >= 3 ? currentYear : currentYear - 1;
    if (options.financialYear) {
      const parts = options.financialYear.split('-');
      if (parts[0]) fyStartYear = parseInt(parts[0], 10);
    }

    if (options.quarter === 'Q1') {
      return { from: `${fyStartYear}-04-01`, to: `${fyStartYear}-06-30`, label: `Q1 (Apr - Jun ${fyStartYear})` };
    } else if (options.quarter === 'Q2') {
      return { from: `${fyStartYear}-07-01`, to: `${fyStartYear}-09-30`, label: `Q2 (Jul - Sep ${fyStartYear})` };
    } else if (options.quarter === 'Q3') {
      return { from: `${fyStartYear}-10-01`, to: `${fyStartYear}-12-31`, label: `Q3 (Oct - Dec ${fyStartYear})` };
    } else if (options.quarter === 'Q4') {
      return { from: `${fyStartYear + 1}-01-01`, to: `${fyStartYear + 1}-03-31`, label: `Q4 (Jan - Mar ${fyStartYear + 1})` };
    }
  }

  if (options?.financialYear) {
    const parts = options.financialYear.split('-');
    const fyStartYear = parseInt(parts[0], 10) || currentYear;
    return {
      from: `${fyStartYear}-04-01`,
      to: `${fyStartYear + 1}-03-31`,
      label: `FY ${options.financialYear}`
    };
  }

  if (options?.from) {
    return { from: options.from, to: '9999-12-31', label: `From ${options.from}` };
  }
  if (options?.to) {
    return { from: '1970-01-01', to: options.to, label: `Up to ${options.to}` };
  }

  const defaultFyStart = currentMonth >= 3 ? currentYear : currentYear - 1;
  return {
    from: `${defaultFyStart}-04-01`,
    to: `${defaultFyStart + 1}-03-31`,
    label: `FY ${defaultFyStart}-${defaultFyStart + 1}`
  };
}

// In-Memory Fallback Store for quick testing / development when Postgres is offline
class MemoryStore implements DatabaseService {
  private shops: Map<string, Shop> = new Map();
  private users: Map<string, User> = new Map();
  private verifications: ShopVerification[] = [];
  private parties: Map<string, Party[]> = new Map();
  private transactions: Map<string, Transaction[]> = new Map();
  private payments: Map<string, PaymentRecord[]> = new Map();
  private returns: Map<string, ReturnRecord[]> = new Map();
  private shopSettings: Map<string, {
    invoice_settings: InvoiceSettings;
    notification_settings: NotificationSettings;
    app_preferences: AppPreferences;
  }> = new Map();

  constructor() {
    // Seed default admin accounts
    const primaryAdmin: User = {
      id: uuidv4(),
      shop_id: null,
      firebase_uid: 'DHiaM4ITGIPoR9YgB3YJaHycOv13',
      email: 'muzamilmohammadk@gmail.com',
      role: 'ADMIN',
      created_at: new Date().toISOString()
    };
    this.users.set(primaryAdmin.id, primaryAdmin);

    const devAdminUser: User = {
      id: uuidv4(),
      shop_id: null,
      firebase_uid: 'admin-dev-uid',
      email: 'admin@yorbalance.com',
      role: 'ADMIN',
      created_at: new Date().toISOString()
    };
    this.users.set(devAdminUser.id, devAdminUser);

    // Seed default approved demo shop
    const demoShopId = 'demo-shop-1';
    const demoShop: Shop = {
      id: demoShopId,
      name: 'Sri Lakshmi Silks & Sarees',
      owner_name: 'Ramesh Kumar',
      gstin: '37AAACH7409R1ZZ',
      phone: '9848022338',
      email: 'ramesh@srilakshmisilks.com',
      address: 'Shop #14, Main Silk Bazaar, MG Road, Dharmavaram, Andhra Pradesh - 515671',
      state_code: '37',
      status: 'APPROVED',
      default_gst_bp: 500,
      verified_by: 'muzamilmohammadk@gmail.com',
      verified_at: new Date(Date.now() - 86400000).toISOString(),
      created_at: new Date(Date.now() - 3600000 * 48).toISOString(),
      updated_at: new Date().toISOString()
    };
    this.shops.set(demoShopId, demoShop);

    const demoUser: User = {
      id: 'demo-user-1',
      shop_id: demoShopId,
      firebase_uid: 'dev-uid-ramesh@srilakshmisilks.com',
      email: 'ramesh@srilakshmisilks.com',
      role: 'OWNER',
      created_at: new Date(Date.now() - 3600000 * 48).toISOString()
    };
    this.users.set(demoUser.id, demoUser);

    this.ensureSeedData(demoShopId);
  }

  private ensureSeedData(shopId: string) {
    if (!this.transactions.has(shopId)) {
      const parties = createSeedParties(shopId);
      this.parties.set(shopId, parties);
      const txs = createSeedTransactions(shopId, parties);
      this.transactions.set(shopId, txs);

      const seedPayments: PaymentRecord[] = [];
      for (const t of txs) {
        t.returns = [];
        if (t.paid_paise > 0) {
          const paymentMode: 'CASH' | 'CHEQUE' | 'NEFT' =
            t.type === 'SALE' ? 'NEFT' : t.type === 'PURCHASE' ? 'CHEQUE' : 'CASH';
          const pay: PaymentRecord = {
            id: `pay-seed-${t.id}`,
            shop_id: shopId,
            transaction_id: t.id,
            party_id: t.party_id,
            party_name: t.party_name,
            party_type: t.party_type,
            amount_paise: t.paid_paise,
            amount_rupees: Math.round(t.paid_paise / 100),
            payment_mode: paymentMode,
            payment_date: t.invoice_date,
            reference_number: paymentMode === 'NEFT' ? `UTR${Math.floor(100000000000 + Math.random() * 900000000000)}` : null,
            cheque_number: paymentMode === 'CHEQUE' ? `${Math.floor(100000 + Math.random() * 900000)}` : null,
            cheque_date: paymentMode === 'CHEQUE' ? t.invoice_date : null,
            clearing_status: 'CLEARED',
            notes: `Payment recorded against ${t.invoice_number}`,
            created_at: t.created_at
          };
          seedPayments.push(pay);
          t.payments = [pay];
        } else {
          t.payments = [];
        }
      }
      this.payments.set(shopId, seedPayments);
      this.returns.set(shopId, []);
    }
  }

  isPostgres(): boolean {
    return false;
  }

  async findUserByFirebaseUid(uid: string): Promise<User | null> {
    for (const u of this.users.values()) {
      if (u.firebase_uid === uid) return { ...u };
    }
    return null;
  }

  async findUserByEmail(email: string): Promise<User | null> {
    for (const u of this.users.values()) {
      if (u.email.toLowerCase() === email.toLowerCase()) return { ...u };
    }
    return null;
  }

  async findShopById(shopId: string): Promise<Shop | null> {
    const s = this.shops.get(shopId);
    return s ? { ...s } : null;
  }

  async findShopByGstin(gstin: string): Promise<Shop | null> {
    for (const s of this.shops.values()) {
      if (s.gstin.toUpperCase() === gstin.toUpperCase()) return { ...s };
    }
    return null;
  }

  async createShopAndUser(payload: RegisterShopPayload, firebaseUid: string): Promise<{ shop: Shop; user: User }> {
    const existingGstin = await this.findShopByGstin(payload.gstin);
    if (existingGstin) {
      throw new Error(`GSTIN '${payload.gstin}' is already registered with another shop`);
    }

    const shopId = uuidv4();
    const userId = uuidv4();
    const now = new Date().toISOString();

    const shop: Shop = {
      id: shopId,
      gstin: payload.gstin.toUpperCase(),
      name: payload.shop_name,
      owner_name: payload.owner_name,
      phone: payload.mobile,
      email: payload.email,
      address: payload.address,
      state_code: payload.state_code,
      status: 'PENDING',
      default_gst_bp: payload.default_gst_bp || 500,
      document_url: payload.document_url || null,
      document_name: payload.document_name || null,
      created_at: now,
      updated_at: now
    };

    const user: User = {
      id: userId,
      shop_id: shopId,
      firebase_uid: firebaseUid,
      email: payload.email,
      role: 'OWNER',
      created_at: now
    };

    this.shops.set(shopId, shop);
    this.users.set(userId, user);

    // Pre-seed sample transactions so approved shop immediately gets rich data
    this.ensureSeedData(shopId);

    return { shop: { ...shop }, user: { ...user } };
  }

  async resubmitShopDetails(shopId: string, payload: ResubmitShopPayload): Promise<Shop> {
    const shop = this.shops.get(shopId);
    if (!shop) throw new Error('Shop not found');

    const updated: Shop = {
      ...shop,
      name: payload.shop_name || shop.name,
      owner_name: payload.owner_name || shop.owner_name,
      gstin: payload.gstin ? payload.gstin.toUpperCase() : shop.gstin,
      phone: payload.mobile || shop.phone,
      address: payload.address || shop.address,
      state_code: payload.state_code || shop.state_code,
      default_gst_bp: payload.default_gst_bp || shop.default_gst_bp,
      document_url: payload.document_url || shop.document_url,
      document_name: payload.document_name || shop.document_name,
      status: 'PENDING',
      updated_at: new Date().toISOString()
    };

    this.shops.set(shopId, updated);
    return { ...updated };
  }

  async getPendingShops(): Promise<Shop[]> {
    return Array.from(this.shops.values())
      .filter(s => s.status === 'PENDING')
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async getAllShops(statusFilter?: string): Promise<Shop[]> {
    let result = Array.from(this.shops.values());
    if (statusFilter) {
      result = result.filter(s => s.status === statusFilter);
    }
    return result.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async getLatestVerification(shopId: string): Promise<ShopVerification | null> {
    const vers = this.verifications
      .filter(v => v.shop_id === shopId)
      .sort((a, b) => b.decided_at.localeCompare(a.decided_at));
    return vers[0] || null;
  }

  async recordAdminDecision(
    shopId: string,
    adminEmail: string,
    decision: AdminDecisionPayload
  ): Promise<{ shop: Shop; verification: ShopVerification }> {
    const shop = this.shops.get(shopId);
    if (!shop) throw new Error('Shop not found');

    const now = new Date().toISOString();
    shop.status = decision.decision;
    shop.verified_at = decision.decision === 'APPROVED' ? now : null;
    shop.verified_by = decision.decision === 'APPROVED' ? adminEmail : null;
    shop.updated_at = now;

    const verification: ShopVerification = {
      id: uuidv4(),
      shop_id: shopId,
      submitted_details: { ...shop },
      decision: decision.decision,
      reason: decision.decision === 'REJECTED' ? (decision.reason || null) : null,
      decided_by: adminEmail,
      decided_at: now
    };

    this.verifications.push(verification);
    this.shops.set(shopId, shop);

    if (decision.decision === 'APPROVED') {
      this.ensureSeedData(shopId);
    }

    return { shop: { ...shop }, verification: { ...verification } };
  }

  async seedAdminUser(email: string, firebaseUid: string): Promise<User> {
    let user = await this.findUserByEmail(email);
    if (user) {
      user.role = 'ADMIN';
      user.firebase_uid = firebaseUid;
      this.users.set(user.id, user);
      return { ...user };
    }
    const adminUser: User = {
      id: uuidv4(),
      shop_id: null,
      firebase_uid: firebaseUid,
      email,
      role: 'ADMIN',
      created_at: new Date().toISOString()
    };
    this.users.set(adminUser.id, adminUser);
    return { ...adminUser };
  }

  // Phase 2: Analytics & Transactions Methods
  async getDashboardSummary(shopId: string, period?: DateRangeOption): Promise<DashboardSummary> {
    this.ensureSeedData(shopId);
    const txs = this.transactions.get(shopId) || [];
    return calculateSummary(txs, period || 'this_month');
  }

  async getDashboardCharts(shopId: string, period?: DateRangeOption): Promise<DashboardCharts> {
    this.ensureSeedData(shopId);
    const txs = this.transactions.get(shopId) || [];
    return calculateCharts(txs, period || 'this_month');
  }

  async getRecentTransactions(shopId: string, limit = 10, search?: string): Promise<Transaction[]> {
    this.ensureSeedData(shopId);
    let txs = this.transactions.get(shopId) || [];

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      txs = txs.filter(t =>
        t.invoice_number.toLowerCase().includes(q) ||
        t.party_name.toLowerCase().includes(q) ||
        t.type.toLowerCase().includes(q)
      );
    }

    // Latest first
    txs = [...txs].sort((a, b) => b.invoice_date.localeCompare(a.invoice_date));
    return txs.slice(0, limit);
  }

  async getTransactionById(shopId: string, transactionId: string): Promise<Transaction | null> {
    this.ensureSeedData(shopId);
    const txs = this.transactions.get(shopId) || [];
    const found = txs.find(t => t.id === transactionId);
    return found ? { ...found } : null;
  }

  // Phase 3: Party Management
  async getParties(shopId: string, type?: PartyType, search?: string): Promise<Party[]> {
    this.ensureSeedData(shopId);
    let parties = this.parties.get(shopId) || [];
    const txs = this.transactions.get(shopId) || [];

    if (type) {
      parties = parties.filter(p => p.type === type);
    }

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      parties = parties.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.owner_name && p.owner_name.toLowerCase().includes(q)) ||
        p.phone.includes(q) ||
        (p.gstin && p.gstin.toLowerCase().includes(q)) ||
        (p.address && p.address.toLowerCase().includes(q))
      );
    }

    const enriched = parties.map(p => enrichPartyWithBalance(p, txs));
    return enriched.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async getPartyById(shopId: string, partyId: string): Promise<Party | null> {
    this.ensureSeedData(shopId);
    const parties = this.parties.get(shopId) || [];
    const party = parties.find(p => p.id === partyId && p.shop_id === shopId);
    if (!party) return null;

    const txs = this.transactions.get(shopId) || [];
    return enrichPartyWithBalance(party, txs);
  }

  async checkDuplicateParty(shopId: string, phone: string, gstin?: string | null, excludePartyId?: string): Promise<DuplicatePartyCheckResult> {
    this.ensureSeedData(shopId);
    const parties = this.parties.get(shopId) || [];
    const cleanPhone = phone.replace(/\D/g, '').slice(-10);

    for (const p of parties) {
      if (excludePartyId && p.id === excludePartyId) continue;

      const pPhone = p.phone.replace(/\D/g, '').slice(-10);
      const pAltPhones = (p.additional_phones || []).map(num => num.replace(/\D/g, '').slice(-10));

      if (cleanPhone && (pPhone === cleanPhone || pAltPhones.includes(cleanPhone))) {
        return {
          isDuplicate: true,
          field: 'phone',
          existingParty: { ...p },
          message: `A party named '${p.name}' is already registered with mobile number ${phone}.`
        };
      }

      if (gstin && p.gstin && p.gstin.trim().toUpperCase() === gstin.trim().toUpperCase()) {
        return {
          isDuplicate: true,
          field: 'gstin',
          existingParty: { ...p },
          message: `A party named '${p.name}' is already registered with GSTIN ${gstin.toUpperCase()}.`
        };
      }
    }

    return { isDuplicate: false };
  }

  async createParty(shopId: string, payload: CreatePartyPayload): Promise<Party> {
    this.ensureSeedData(shopId);
    const parties = this.parties.get(shopId) || [];

    const newId = uuidv4();
    const now = new Date().toISOString();

    const newParty: Party = {
      id: newId,
      shop_id: shopId,
      name: payload.name.trim(),
      type: payload.type,
      owner_name: payload.owner_name.trim(),
      phone: payload.phone.replace(/\D/g, '').slice(-10),
      additional_phones: payload.additional_phones ? payload.additional_phones.map(p => p.replace(/\D/g, '').slice(-10)).filter(Boolean) : [],
      gstin: payload.gstin ? payload.gstin.trim().toUpperCase() : null,
      address: payload.address.trim(),
      state: payload.state.trim(),
      state_code: payload.state_code || '37',
      pin_code: payload.pin_code.trim(),
      notes: payload.notes ? payload.notes.trim() : null,
      current_balance: 0,
      balance_type: 'SETTLED',
      created_at: now,
      updated_at: now
    };

    parties.unshift(newParty);
    this.parties.set(shopId, parties);
    return { ...newParty };
  }

  async updateParty(shopId: string, partyId: string, payload: UpdatePartyPayload): Promise<Party> {
    this.ensureSeedData(shopId);
    const parties = this.parties.get(shopId) || [];
    const idx = parties.findIndex(p => p.id === partyId && p.shop_id === shopId);
    if (idx === -1) {
      throw new Error('Party not found');
    }

    const current = parties[idx];
    const now = new Date().toISOString();

    const updated: Party = {
      ...current,
      name: payload.name !== undefined ? payload.name.trim() : current.name,
      type: payload.type !== undefined ? payload.type : current.type,
      owner_name: payload.owner_name !== undefined ? payload.owner_name.trim() : current.owner_name,
      phone: payload.phone !== undefined ? payload.phone.replace(/\D/g, '').slice(-10) : current.phone,
      additional_phones: payload.additional_phones !== undefined ? payload.additional_phones.map(p => p.replace(/\D/g, '').slice(-10)).filter(Boolean) : current.additional_phones,
      gstin: payload.gstin !== undefined ? (payload.gstin ? payload.gstin.trim().toUpperCase() : null) : current.gstin,
      address: payload.address !== undefined ? payload.address.trim() : current.address,
      state: payload.state !== undefined ? payload.state.trim() : current.state,
      state_code: payload.state_code !== undefined ? payload.state_code : current.state_code,
      pin_code: payload.pin_code !== undefined ? payload.pin_code.trim() : current.pin_code,
      notes: payload.notes !== undefined ? (payload.notes ? payload.notes.trim() : null) : current.notes,
      updated_at: now
    };

    parties[idx] = updated;
    this.parties.set(shopId, parties);

    const txs = this.transactions.get(shopId) || [];
    return enrichPartyWithBalance(updated, txs);
  }

  // Phase 4: Mobile Ledger & Transactions
  async getLedgerTransactions(shopId: string, options?: LedgerFilterOptions): Promise<{ transactions: Transaction[]; summary: LedgerSummary }> {
    this.ensureSeedData(shopId);
    let txs = this.transactions.get(shopId) || [];
    const parties = this.parties.get(shopId) || [];

    const partyPhoneMap = new Map<string, string>();
    parties.forEach(p => {
      const allPhones = [p.phone, ...(p.additional_phones || [])].join(' ');
      partyPhoneMap.set(p.id, allPhones);
    });

    if (options?.partyId) {
      txs = txs.filter(t => t.party_id === options.partyId);
    }

    if (options?.type && options.type !== 'ALL') {
      if (options.type === 'PAYMENT') {
        txs = txs.filter(t => t.paid_paise > 0 || t.status === 'SETTLED');
      } else {
        txs = txs.filter(t => t.type === options.type);
      }
    }

    if (options?.search && options.search.trim()) {
      const q = options.search.trim().toLowerCase();
      txs = txs.filter(t => {
        const partyPhones = partyPhoneMap.get(t.party_id) || '';
        return (
          t.party_name.toLowerCase().includes(q) ||
          t.invoice_number.toLowerCase().includes(q) ||
          partyPhones.includes(q) ||
          t.type.toLowerCase().includes(q)
        );
      });
    }

    // Calculate Summary
    const total_receivable = Math.round(
      txs
        .filter(t => t.party_type === 'CUSTOMER' || t.type === 'SALE')
        .reduce((sum, t) => sum + (t.pending_paise || 0), 0) / 100
    );

    const total_payable = Math.round(
      txs
        .filter(t => t.party_type !== 'CUSTOMER' || t.type === 'PURCHASE' || t.type === 'JOB_WORK')
        .reduce((sum, t) => sum + (t.pending_paise || 0), 0) / 100
    );

    const sorted = [...txs].sort((a, b) => b.invoice_date.localeCompare(a.invoice_date));
    const limit = options?.limit || 100;

    return {
      transactions: sorted.slice(0, limit),
      summary: {
        total_receivable,
        total_payable,
        total_transactions: sorted.length
      }
    };
  }

  async createTransaction(shopId: string, payload: CreateTransactionPayload): Promise<Transaction> {
    this.ensureSeedData(shopId);
    const txs = this.transactions.get(shopId) || [];
    const parties = this.parties.get(shopId) || [];

    const party = parties.find(p => p.id === payload.party_id && p.shop_id === shopId);
    if (!party) {
      throw new Error('Party not found for this transaction');
    }

    const now = new Date();
    const grand_total_paise = Math.round(payload.amount_rupees * 100);
    const paid_rupees = Math.min(payload.paid_rupees || 0, payload.amount_rupees);
    const paid_paise = Math.round(paid_rupees * 100);
    const pending_paise = Math.max(0, grand_total_paise - paid_paise);

    const gst_rate_bp = payload.gst_rate_bp || 500;
    const subtotal_paise = Math.round((grand_total_paise * 10000) / (10000 + gst_rate_bp));
    const tax_paise = grand_total_paise - subtotal_paise;

    let cgst_paise = 0;
    let sgst_paise = 0;
    let igst_paise = 0;

    if (payload.is_inter_state) {
      igst_paise = tax_paise;
    } else {
      cgst_paise = Math.round(tax_paise / 2);
      sgst_paise = tax_paise - cgst_paise;
    }

    const status: 'SETTLED' | 'PARTIAL' | 'PENDING' =
      pending_paise === 0 ? 'SETTLED' : paid_paise > 0 ? 'PARTIAL' : 'PENDING';

    const invoice_number =
      payload.invoice_number?.trim() ||
      `${payload.type.slice(0, 3)}-${now.getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const newTx: Transaction = {
      id: `tx-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      shop_id: shopId,
      party_id: party.id,
      party_name: party.name,
      party_type: party.type,
      type: payload.type,
      invoice_number,
      invoice_date: payload.invoice_date || now.toISOString().split('T')[0],
      subtotal_paise,
      tax_paise,
      cgst_paise,
      sgst_paise,
      igst_paise,
      grand_total_paise,
      paid_paise,
      pending_paise,
      status,
      notes: payload.notes || null,
      items: [
        {
          id: uuidv4(),
          transaction_id: '',
          item_name: payload.item_name || (party.type === 'CUSTOMER' ? 'Pure Silk Saree' : party.type === 'SUPPLIER' ? 'Raw Silk Warp/Weft Yarn' : 'Handloom Weaving & Zari Finishing'),
          quantity: 1,
          rate_paise: subtotal_paise,
          gst_rate_bp,
          amount_paise: subtotal_paise
        }
      ],
      created_at: now.toISOString(),
      updated_at: now.toISOString()
    };

    newTx.items![0].transaction_id = newTx.id;

    txs.unshift(newTx);
    this.transactions.set(shopId, txs);

    return { ...newTx };
  }

  // Phase 5: History, Dues & Payments
  async getHistory(shopId: string, options?: HistoryFilterOptions): Promise<{ transactions: any[]; summary: HistorySummary; total: number }> {
    this.ensureSeedData(shopId);
    const txs = this.transactions.get(shopId) || [];
    const payments = this.payments.get(shopId) || [];
    const returns = this.returns.get(shopId) || [];
    const parties = this.parties.get(shopId) || [];

    const partyPhoneMap = new Map<string, string>();
    parties.forEach(p => {
      const allPhones = [p.phone, ...(p.additional_phones || [])].join(' ');
      partyPhoneMap.set(p.id, allPhones);
    });

    const filterByDate = (dateStr: string) => {
      if (!dateStr) return true;
      if (options?.startDate && dateStr < options.startDate) return false;
      if (options?.endDate && dateStr > options.endDate) return false;
      if (options?.dateRange && options.dateRange !== 'all') {
        const now = new Date();
        const d = new Date(dateStr);
        if (options.dateRange === 'today') {
          return dateStr === now.toISOString().split('T')[0];
        } else if (options.dateRange === 'this_week') {
          const weekAgo = new Date(now.getTime() - 7 * 86400000);
          return d >= weekAgo;
        } else if (options.dateRange === 'this_month') {
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        } else if (options.dateRange === 'this_fy') {
          const fyStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
          const fyStart = new Date(fyStartYear, 3, 1);
          const fyEnd = new Date(fyStartYear + 1, 2, 31, 23, 59, 59);
          return d >= fyStart && d <= fyEnd;
        }
      }
      return true;
    };

    const filteredSummaryTxs = txs.filter(t => filterByDate(t.invoice_date));
    const filteredSummaryPayments = payments.filter(p => filterByDate(p.payment_date));
    const filteredSummaryReturns = returns.filter(r => filterByDate(r.return_date));

    const summary: HistorySummary = {
      total_sales: Math.round(filteredSummaryTxs.filter(t => t.type === 'SALE').reduce((sum, t) => sum + t.grand_total_paise, 0) / 100),
      total_purchases: Math.round(filteredSummaryTxs.filter(t => t.type === 'PURCHASE').reduce((sum, t) => sum + t.grand_total_paise, 0) / 100),
      total_job_work: Math.round(filteredSummaryTxs.filter(t => t.type === 'JOB_WORK').reduce((sum, t) => sum + t.grand_total_paise, 0) / 100),
      total_payments: Math.round(filteredSummaryPayments.reduce((sum, p) => sum + p.amount_paise, 0) / 100),
      total_returns: Math.round(filteredSummaryReturns.reduce((sum, r) => sum + r.amount_paise, 0) / 100),
    };

    let items: any[] = [];

    if (!options?.type || options.type === 'ALL' || ['SALE', 'PURCHASE', 'JOB_WORK'].includes(options.type)) {
      let tList = txs;
      if (options?.type && options.type !== 'ALL') {
        tList = tList.filter(t => t.type === options.type);
      }
      items.push(...tList.map(t => {
        const remainingPaise = Math.max(0, t.grand_total_paise - (t.return_paise || 0) - t.paid_paise);
        let status = t.status;
        if (remainingPaise === 0) status = 'SETTLED';
        else if (t.due_date && new Date(t.due_date).getTime() < Date.now()) status = 'OVERDUE';
        else if (t.paid_paise > 0 || (t.return_paise && t.return_paise > 0)) status = 'PARTIAL';
        else status = 'PENDING';

        return {
          id: t.id,
          item_kind: 'TRANSACTION',
          type: t.type,
          invoice_number: t.invoice_number,
          invoice_date: t.invoice_date,
          due_date: t.due_date || null,
          party_id: t.party_id,
          party_name: t.party_name,
          party_type: t.party_type,
          grand_total_paise: t.grand_total_paise,
          amount_rupees: Math.round(t.grand_total_paise / 100),
          paid_paise: t.paid_paise,
          paid_rupees: Math.round(t.paid_paise / 100),
          return_paise: t.return_paise || 0,
          return_rupees: Math.round((t.return_paise || 0) / 100),
          pending_paise: remainingPaise,
          remaining_due_rupees: Math.round(remainingPaise / 100),
          status,
          subtotal_paise: t.subtotal_paise,
          tax_paise: t.tax_paise,
          cgst_paise: t.cgst_paise,
          sgst_paise: t.sgst_paise,
          igst_paise: t.igst_paise,
          notes: t.notes,
          items: t.items || [],
          payments: t.payments || [],
          returns: t.returns || [],
          created_at: t.created_at
        };
      }));
    }

    if (!options?.type || options.type === 'ALL' || options.type === 'PAYMENT') {
      items.push(...payments.map(p => ({
        id: p.id,
        item_kind: 'PAYMENT',
        type: 'PAYMENT',
        invoice_number: p.reference_number || (p.cheque_number ? `CHQ-${p.cheque_number}` : `RCP-${p.id.slice(-6).toUpperCase()}`),
        invoice_date: p.payment_date,
        due_date: null,
        party_id: p.party_id,
        party_name: p.party_name || 'Party',
        party_type: p.party_type || 'CUSTOMER',
        grand_total_paise: p.amount_paise,
        amount_rupees: p.amount_rupees,
        paid_paise: p.amount_paise,
        paid_rupees: p.amount_rupees,
        return_paise: 0,
        return_rupees: 0,
        pending_paise: 0,
        remaining_due_rupees: 0,
        status: 'SETTLED',
        subtotal_paise: p.amount_paise,
        tax_paise: 0,
        cgst_paise: 0,
        sgst_paise: 0,
        igst_paise: 0,
        notes: p.notes,
        payment_mode: p.payment_mode,
        reference_number: p.reference_number,
        cheque_number: p.cheque_number,
        transaction_id: p.transaction_id,
        created_at: p.created_at
      })));
    }

    if (!options?.type || options.type === 'ALL' || options.type === 'RETURN') {
      items.push(...returns.map(r => {
        const parentTx = txs.find(t => t.id === r.transaction_id);
        return {
          id: r.id,
          item_kind: 'RETURN',
          type: 'RETURN',
          invoice_number: `RET-${r.id.slice(-6).toUpperCase()}`,
          invoice_date: r.return_date,
          due_date: null,
          party_id: r.party_id,
          party_name: parentTx?.party_name || 'Party',
          party_type: parentTx?.party_type || 'CUSTOMER',
          grand_total_paise: r.amount_paise,
          amount_rupees: r.amount_rupees,
          paid_paise: 0,
          paid_rupees: 0,
          return_paise: r.amount_paise,
          return_rupees: r.amount_rupees,
          pending_paise: 0,
          remaining_due_rupees: 0,
          status: 'SETTLED',
          subtotal_paise: r.amount_paise,
          tax_paise: 0,
          cgst_paise: 0,
          sgst_paise: 0,
          igst_paise: 0,
          notes: r.reason,
          transaction_id: r.transaction_id,
          created_at: r.created_at
        };
      }));
    }

    if (options?.search && options.search.trim()) {
      const q = options.search.trim().toLowerCase();
      items = items.filter(it => {
        const phones = partyPhoneMap.get(it.party_id) || '';
        return (
          (it.party_name && it.party_name.toLowerCase().includes(q)) ||
          (it.invoice_number && it.invoice_number.toLowerCase().includes(q)) ||
          phones.includes(q)
        );
      });
    }

    items = items.filter(it => filterByDate(it.invoice_date));

    if (options?.partyId) {
      items = items.filter(it => it.party_id === options.partyId);
    }

    if (options?.status && options.status !== 'ALL') {
      items = items.filter(it => it.status === options.status);
    }

    if (options?.minAmount !== undefined) {
      items = items.filter(it => it.amount_rupees >= (options.minAmount || 0));
    }
    if (options?.maxAmount !== undefined) {
      items = items.filter(it => it.amount_rupees <= (options.maxAmount || 0));
    }

    items.sort((a, b) => b.invoice_date.localeCompare(a.invoice_date) || b.created_at.localeCompare(a.created_at));

    const total = items.length;
    const offset = options?.offset || 0;
    const limit = options?.limit || 100;
    const pagedItems = items.slice(offset, offset + limit);

    return {
      transactions: pagedItems,
      summary,
      total
    };
  }

  async getTransactionHistoryDetails(shopId: string, transactionId: string): Promise<Transaction | null> {
    this.ensureSeedData(shopId);
    const txs = this.transactions.get(shopId) || [];
    const t = txs.find(tx => tx.id === transactionId && tx.shop_id === shopId);
    if (!t) return null;

    const payments = (this.payments.get(shopId) || []).filter(p => p.transaction_id === transactionId);
    const returns = (this.returns.get(shopId) || []).filter(r => r.transaction_id === transactionId);

    const remainingPaise = Math.max(0, t.grand_total_paise - (t.return_paise || 0) - t.paid_paise);
    let status = t.status;
    if (remainingPaise === 0) status = 'SETTLED';
    else if (t.due_date && new Date(t.due_date).getTime() < Date.now()) status = 'OVERDUE';
    else if (t.paid_paise > 0 || (t.return_paise && t.return_paise > 0)) status = 'PARTIAL';
    else status = 'PENDING';

    return {
      ...t,
      status,
      payments,
      returns
    };
  }

  async getDuesSummary(shopId: string): Promise<DuesSummary> {
    this.ensureSeedData(shopId);
    const txs = this.transactions.get(shopId) || [];
    let total_receivable = 0;
    let total_payable = 0;
    let overdue_receivable = 0;
    let overdue_payable = 0;

    for (const t of txs) {
      const returnPaise = t.return_paise || 0;
      const remainingPaise = Math.max(0, t.grand_total_paise - returnPaise - t.paid_paise);
      const remainingRupees = Math.round(remainingPaise / 100);
      if (remainingRupees <= 0) continue;

      let status = t.status;
      if (t.due_date && new Date(t.due_date).getTime() < Date.now()) {
        status = 'OVERDUE';
      }

      const isCustomer = t.party_type === 'CUSTOMER' || t.type === 'SALE';

      if (isCustomer) {
        total_receivable += remainingRupees;
        if (status === 'OVERDUE') overdue_receivable += remainingRupees;
      } else {
        total_payable += remainingRupees;
        if (status === 'OVERDUE') overdue_payable += remainingRupees;
      }
    }

    return {
      total_receivable,
      total_payable,
      overdue_receivable,
      overdue_payable
    };
  }

  async getDues(shopId: string, options?: DuesFilterOptions): Promise<{ dues: DueRecord[]; summary: DuesSummary; total: number }> {
    this.ensureSeedData(shopId);
    const txs = this.transactions.get(shopId) || [];
    const parties = this.parties.get(shopId) || [];

    const partyPhoneMap = new Map<string, string>();
    parties.forEach(p => {
      const allPhones = [p.phone, ...(p.additional_phones || [])].join(' ');
      partyPhoneMap.set(p.id, allPhones);
    });

    const duesList: DueRecord[] = [];

    for (const t of txs) {
      const original_amount = Math.round(t.grand_total_paise / 100);
      const returns = Math.round((t.return_paise || 0) / 100);
      const amount_paid = Math.round(t.paid_paise / 100);
      const remaining_due = Math.max(0, original_amount - returns - amount_paid);

      let status: 'PENDING' | 'PARTIAL' | 'OVERDUE' | 'SETTLED' = 'PENDING';
      if (remaining_due === 0) {
        status = 'SETTLED';
      } else if (t.due_date && new Date(t.due_date).getTime() < Date.now()) {
        status = 'OVERDUE';
      } else if (amount_paid > 0 || returns > 0) {
        status = 'PARTIAL';
      } else {
        status = 'PENDING';
      }

      duesList.push({
        id: t.id,
        party_id: t.party_id,
        party_name: t.party_name,
        party_type: t.party_type,
        invoice_number: t.invoice_number,
        invoice_date: t.invoice_date,
        due_date: t.due_date || null,
        original_amount,
        returns,
        amount_paid,
        remaining_due,
        status,
        type: t.type
      });
    }

    const summary = await this.getDuesSummary(shopId);

    let filtered = duesList;

    if (options?.view === 'RECEIVABLE') {
      filtered = filtered.filter(d => d.party_type === 'CUSTOMER' || d.type === 'SALE');
    } else if (options?.view === 'PAYABLE') {
      filtered = filtered.filter(d => d.party_type !== 'CUSTOMER' || d.type === 'PURCHASE' || d.type === 'JOB_WORK');
    }

    if (options?.status && options.status !== 'ALL') {
      filtered = filtered.filter(d => d.status === options.status);
    } else if (!options?.status) {
      filtered = filtered.filter(d => d.remaining_due > 0);
    }

    if (options?.partyType && options.partyType !== 'ALL') {
      filtered = filtered.filter(d => d.party_type === options.partyType);
    }

    if (options?.search && options.search.trim()) {
      const q = options.search.trim().toLowerCase();
      filtered = filtered.filter(d => {
        const phones = partyPhoneMap.get(d.party_id) || '';
        return (
          d.party_name.toLowerCase().includes(q) ||
          d.invoice_number.toLowerCase().includes(q) ||
          phones.includes(q)
        );
      });
    }

    if (options?.invoiceStartDate) {
      filtered = filtered.filter(d => d.invoice_date >= options.invoiceStartDate!);
    }
    if (options?.invoiceEndDate) {
      filtered = filtered.filter(d => d.invoice_date <= options.invoiceEndDate!);
    }
    if (options?.dueStartDate) {
      filtered = filtered.filter(d => !!d.due_date && d.due_date >= options.dueStartDate!);
    }
    if (options?.dueEndDate) {
      filtered = filtered.filter(d => !!d.due_date && d.due_date <= options.dueEndDate!);
    }

    if (options?.minAmount !== undefined) {
      filtered = filtered.filter(d => d.remaining_due >= options.minAmount!);
    }
    if (options?.maxAmount !== undefined) {
      filtered = filtered.filter(d => d.remaining_due <= options.maxAmount!);
    }

    filtered.sort((a, b) => {
      if (a.status === 'OVERDUE' && b.status !== 'OVERDUE') return -1;
      if (b.status === 'OVERDUE' && a.status !== 'OVERDUE') return 1;
      return b.invoice_date.localeCompare(a.invoice_date);
    });

    return {
      dues: filtered,
      summary,
      total: filtered.length
    };
  }

  async getDueById(shopId: string, transactionId: string): Promise<DueRecord | null> {
    const { dues } = await this.getDues(shopId, { status: 'ALL', view: 'ALL' });
    return dues.find(d => d.id === transactionId) || null;
  }

  async recordPayment(shopId: string, payload: RecordPaymentPayload): Promise<{ payment: PaymentRecord; transaction?: Transaction }> {
    this.ensureSeedData(shopId);
    const parties = this.parties.get(shopId) || [];
    const party = parties.find(p => p.id === payload.party_id && p.shop_id === shopId);
    if (!party) throw new Error('Party not found');

    if (payload.amount_rupees <= 0) {
      throw new Error('Payment amount must be greater than zero');
    }

    if (payload.payment_mode === 'CHEQUE' && !payload.cheque_number?.trim()) {
      throw new Error('Cheque number is required for Cheque payments');
    }

    const txs = this.transactions.get(shopId) || [];
    let tx: Transaction | undefined;
    const payment_paise = Math.round(payload.amount_rupees * 100);

    if (payload.transaction_id) {
      tx = txs.find(t => t.id === payload.transaction_id && t.shop_id === shopId);
      if (!tx) throw new Error('Transaction not found');
      const returnPaise = tx.return_paise || 0;
      const remainingPaise = Math.max(0, tx.grand_total_paise - returnPaise - tx.paid_paise);
      if (payment_paise > remainingPaise) {
        throw new Error(`Payment amount ₹${payload.amount_rupees} exceeds remaining due of ₹${Math.round(remainingPaise / 100)}`);
      }

      tx.paid_paise += payment_paise;
      tx.pending_paise = Math.max(0, tx.grand_total_paise - returnPaise - tx.paid_paise);
      if (tx.pending_paise === 0) {
        tx.status = 'SETTLED';
      } else if (tx.due_date && new Date(tx.due_date).getTime() < Date.now()) {
        tx.status = 'OVERDUE';
      } else {
        tx.status = 'PARTIAL';
      }
      tx.updated_at = new Date().toISOString();
    }

    const newPayment: PaymentRecord = {
      id: `pay-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      shop_id: shopId,
      transaction_id: payload.transaction_id || null,
      party_id: party.id,
      party_name: party.name,
      party_type: party.type,
      amount_paise: payment_paise,
      amount_rupees: payload.amount_rupees,
      payment_mode: payload.payment_mode,
      payment_date: payload.payment_date || new Date().toISOString().split('T')[0],
      reference_number: payload.reference_number?.trim() || null,
      cheque_number: payload.cheque_number?.trim() || null,
      cheque_date: payload.cheque_date || null,
      deposit_date: payload.deposit_date || null,
      clearing_status: payload.payment_mode === 'CHEQUE' ? (payload.clearing_status || 'PENDING') : 'CLEARED',
      notes: payload.notes?.trim() || null,
      created_at: new Date().toISOString()
    };

    if (tx) {
      if (!tx.payments) tx.payments = [];
      tx.payments.unshift(newPayment);
    }

    const shopPayments = this.payments.get(shopId) || [];
    shopPayments.unshift(newPayment);
    this.payments.set(shopId, shopPayments);

    return { payment: newPayment, transaction: tx ? { ...tx } : undefined };
  }

  async getPaymentById(shopId: string, paymentId: string): Promise<PaymentRecord | null> {
    this.ensureSeedData(shopId);
    const shopPayments = this.payments.get(shopId) || [];
    return shopPayments.find(p => p.id === paymentId && p.shop_id === shopId) || null;
  }

  async recordReturn(shopId: string, payload: RecordReturnPayload): Promise<{ returnRecord: ReturnRecord; transaction: Transaction }> {
    this.ensureSeedData(shopId);
    if (payload.amount_rupees <= 0) {
      throw new Error('Return amount must be greater than zero');
    }

    const txs = this.transactions.get(shopId) || [];
    const tx = txs.find(t => t.id === payload.transaction_id && t.shop_id === shopId);
    if (!tx) throw new Error('Transaction not found');

    const return_paise = Math.round(payload.amount_rupees * 100);
    const currentReturns = tx.return_paise || 0;
    const maxReturnable = tx.grand_total_paise - currentReturns;
    if (return_paise > maxReturnable) {
      throw new Error(`Return amount ₹${payload.amount_rupees} exceeds maximum returnable amount ₹${Math.round(maxReturnable / 100)}`);
    }

    tx.return_paise = currentReturns + return_paise;
    tx.pending_paise = Math.max(0, tx.grand_total_paise - tx.return_paise - tx.paid_paise);
    if (tx.pending_paise === 0) {
      tx.status = 'SETTLED';
    } else if (tx.due_date && new Date(tx.due_date).getTime() < Date.now()) {
      tx.status = 'OVERDUE';
    } else if (tx.paid_paise > 0 || tx.return_paise > 0) {
      tx.status = 'PARTIAL';
    } else {
      tx.status = 'PENDING';
    }
    tx.updated_at = new Date().toISOString();

    const returnRecord: ReturnRecord = {
      id: `ret-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      shop_id: shopId,
      transaction_id: tx.id,
      party_id: tx.party_id,
      amount_paise: return_paise,
      amount_rupees: payload.amount_rupees,
      reason: payload.reason?.trim() || null,
      return_date: payload.return_date || new Date().toISOString().split('T')[0],
      created_at: new Date().toISOString()
    };

    if (!tx.returns) tx.returns = [];
    tx.returns.unshift(returnRecord);

    const shopReturns = this.returns.get(shopId) || [];
    shopReturns.unshift(returnRecord);
    this.returns.set(shopId, shopReturns);

    return { returnRecord, transaction: { ...tx } };
  }

  private ensureShopSettings(shopId: string) {
    if (!this.shopSettings.has(shopId)) {
      this.shopSettings.set(shopId, {
        invoice_settings: {
          invoice_prefix: 'INV-',
          suggested_next_number: 1001,
          date_format: 'DD/MM/YYYY',
          show_logo: true,
          show_gstin: true,
          show_tax_breakdown: true,
          invoice_footer: 'Thank you for choosing pure silk sarees and handloom weaves!',
          terms_and_conditions: 'Goods once sold can be exchanged within 7 days in original condition with bill.'
        },
        notification_settings: {
          push_notifications: true,
          in_app_notifications: true,
          due_reminders: true,
          reminder_lead_time_days: 3,
          daily_reminder_time: '08:00 IST'
        },
        app_preferences: {
          currency: 'INR',
          time_zone: 'Asia/Kolkata',
          date_format: 'DD/MM/YYYY',
          theme: 'system',
          language: 'en',
          default_landing_page: '/dashboard'
        }
      });
    }
  }

  // Phase 6: Reports & GST Analytics
  async getPurchaseLedger(shopId: string, options?: ReportFilterOptions): Promise<PurchaseLedgerReport> {
    this.ensureSeedData(shopId);
    const txs = this.transactions.get(shopId) || [];
    const parties = this.parties.get(shopId) || [];
    const dateRange = resolveReportDateRange(options);

    let purchaseTxs = txs.filter(t => t.type === 'PURCHASE' && t.invoice_date >= dateRange.from && t.invoice_date <= dateRange.to);

    if (options?.partyId) {
      purchaseTxs = purchaseTxs.filter(t => t.party_id === options.partyId);
    }
    if (options?.partySearch && options.partySearch.trim()) {
      const q = options.partySearch.trim().toLowerCase();
      purchaseTxs = purchaseTxs.filter(t =>
        t.party_name.toLowerCase().includes(q) ||
        t.invoice_number.toLowerCase().includes(q)
      );
    }

    const items: PurchaseLedgerItem[] = [];
    let total_purchase_value = 0;
    let total_taxable_value = 0;
    let total_cgst = 0;
    let total_sgst = 0;
    let total_igst = 0;
    let total_gst = 0;
    let total_returns = 0;
    let eligible_itc = 0;

    for (const t of purchaseTxs) {
      const party = parties.find(p => p.id === t.party_id);
      const supplierGstin = party?.gstin || null;
      const has_gstin = Boolean(supplierGstin && supplierGstin.trim().length === 15);

      const taxable_value = Math.round(t.subtotal_paise / 100);
      const cgst = Math.round(t.cgst_paise / 100);
      const sgst = Math.round(t.sgst_paise / 100);
      const igst = Math.round(t.igst_paise / 100);
      const bill_gst = cgst + sgst + igst;
      const returns = Math.round((t.return_paise || 0) / 100);
      const net_purchase_amount = Math.max(0, Math.round((t.grand_total_paise - (t.return_paise || 0)) / 100));

      let bill_itc = 0;
      if (has_gstin) {
        if (t.return_paise && t.return_paise > 0 && t.grand_total_paise > 0) {
          const returnRatio = t.return_paise / t.grand_total_paise;
          const returnTaxPaise = Math.round(t.tax_paise * returnRatio);
          bill_itc = Math.max(0, Math.round((t.tax_paise - returnTaxPaise) / 100));
        } else {
          bill_itc = bill_gst;
        }
      }

      const remainingPaise = Math.max(0, t.grand_total_paise - (t.return_paise || 0) - t.paid_paise);
      let payment_status: PaymentStatus = 'PENDING';
      if (remainingPaise === 0) payment_status = 'SETTLED';
      else if (t.due_date && new Date(t.due_date).getTime() < Date.now()) payment_status = 'OVERDUE';
      else if (t.paid_paise > 0 || (t.return_paise && t.return_paise > 0)) payment_status = 'PARTIAL';

      items.push({
        id: t.id,
        supplier_name: t.party_name,
        supplier_gstin: supplierGstin,
        has_gstin,
        invoice_number: t.invoice_number,
        bill_date: t.invoice_date,
        taxable_value,
        cgst,
        sgst,
        igst,
        total_gst: bill_gst,
        net_purchase_amount,
        returns,
        eligible_itc: bill_itc,
        payment_status
      });

      total_purchase_value += Math.round(t.grand_total_paise / 100);
      total_taxable_value += taxable_value;
      total_cgst += cgst;
      total_sgst += sgst;
      total_igst += igst;
      total_gst += bill_gst;
      total_returns += returns;
      eligible_itc += bill_itc;
    }

    items.sort((a, b) => b.bill_date.localeCompare(a.bill_date));

    return {
      items,
      totals: {
        total_purchase_value,
        total_taxable_value,
        total_cgst,
        total_sgst,
        total_igst,
        total_gst,
        total_returns,
        eligible_itc
      },
      period: { from: dateRange.from, to: dateRange.to, label: dateRange.label }
    };
  }

  async getSalesLedger(shopId: string, options?: ReportFilterOptions): Promise<SalesLedgerReport> {
    this.ensureSeedData(shopId);
    const txs = this.transactions.get(shopId) || [];
    const parties = this.parties.get(shopId) || [];
    const dateRange = resolveReportDateRange(options);

    let salesTxs = txs.filter(t => t.type === 'SALE' && t.invoice_date >= dateRange.from && t.invoice_date <= dateRange.to);

    if (options?.partyId) {
      salesTxs = salesTxs.filter(t => t.party_id === options.partyId);
    }
    if (options?.partySearch && options.partySearch.trim()) {
      const q = options.partySearch.trim().toLowerCase();
      salesTxs = salesTxs.filter(t =>
        t.party_name.toLowerCase().includes(q) ||
        t.invoice_number.toLowerCase().includes(q)
      );
    }

    const items: SalesLedgerItem[] = [];
    let total_taxable_sales = 0;
    let total_cgst = 0;
    let total_sgst = 0;
    let total_igst = 0;
    let total_output_gst = 0;
    let total_sales_value = 0;
    let total_paid = 0;
    let total_outstanding_due = 0;
    let intra_state_sales = 0;
    let inter_state_sales = 0;

    for (const t of salesTxs) {
      const party = parties.find(p => p.id === t.party_id);
      const is_inter_state = Boolean(t.igst_paise > 0);
      const sales_type: 'INTRA_STATE' | 'INTER_STATE' = is_inter_state ? 'INTER_STATE' : 'INTRA_STATE';

      const taxable_value = Math.round(t.subtotal_paise / 100);
      const cgst = Math.round(t.cgst_paise / 100);
      const sgst = Math.round(t.sgst_paise / 100);
      const igst = Math.round(t.igst_paise / 100);
      const bill_gst = cgst + sgst + igst;
      const grand_total = Math.round(t.grand_total_paise / 100);
      const amount_paid = Math.round(t.paid_paise / 100);
      const remaining_due = Math.max(0, Math.round((t.grand_total_paise - (t.return_paise || 0) - t.paid_paise) / 100));

      let payment_status: PaymentStatus = 'PENDING';
      if (remaining_due === 0) payment_status = 'SETTLED';
      else if (t.due_date && new Date(t.due_date).getTime() < Date.now()) payment_status = 'OVERDUE';
      else if (t.paid_paise > 0 || (t.return_paise && t.return_paise > 0)) payment_status = 'PARTIAL';

      items.push({
        id: t.id,
        customer_name: t.party_name,
        customer_gstin: party?.gstin || null,
        invoice_number: t.invoice_number,
        bill_date: t.invoice_date,
        is_inter_state,
        sales_type,
        taxable_value,
        cgst,
        sgst,
        igst,
        total_gst: bill_gst,
        grand_total,
        amount_paid,
        remaining_due,
        payment_status
      });

      total_taxable_sales += taxable_value;
      total_cgst += cgst;
      total_sgst += sgst;
      total_igst += igst;
      total_output_gst += bill_gst;
      total_sales_value += grand_total;
      total_paid += amount_paid;
      total_outstanding_due += remaining_due;

      if (is_inter_state) {
        inter_state_sales += grand_total;
      } else {
        intra_state_sales += grand_total;
      }
    }

    items.sort((a, b) => b.bill_date.localeCompare(a.bill_date));

    return {
      items,
      totals: {
        total_taxable_sales,
        total_cgst,
        total_sgst,
        total_igst,
        total_output_gst,
        total_sales_value,
        total_paid,
        total_outstanding_due,
        intra_state_sales,
        inter_state_sales
      },
      period: { from: dateRange.from, to: dateRange.to, label: dateRange.label }
    };
  }

  async getJobWorkLedger(shopId: string, options?: ReportFilterOptions): Promise<ArtisanJobWorkReport> {
    this.ensureSeedData(shopId);
    const txs = this.transactions.get(shopId) || [];
    const dateRange = resolveReportDateRange(options);

    let jobTxs = txs.filter(t => t.type === 'JOB_WORK' && t.invoice_date >= dateRange.from && t.invoice_date <= dateRange.to);

    if (options?.partyId) {
      jobTxs = jobTxs.filter(t => t.party_id === options.partyId);
    }
    if (options?.partySearch && options.partySearch.trim()) {
      const q = options.partySearch.trim().toLowerCase();
      jobTxs = jobTxs.filter(t =>
        t.party_name.toLowerCase().includes(q) ||
        t.invoice_number.toLowerCase().includes(q)
      );
    }

    const items: ArtisanJobWorkItem[] = [];
    const artisanMap = new Map<string, ArtisanSummary>();
    let total_job_work_value = 0;
    let total_gst = 0;
    let total_payments = 0;
    let total_outstanding = 0;

    for (const t of jobTxs) {
      const job_work_amount = Math.round(t.subtotal_paise / 100);
      const gst = Math.round(t.tax_paise / 100);
      const total_amount = Math.round(t.grand_total_paise / 100);
      const amount_paid = Math.round(t.paid_paise / 100);
      const outstanding_amount = Math.max(0, Math.round((t.grand_total_paise - (t.return_paise || 0) - t.paid_paise) / 100));

      let payment_status: PaymentStatus = 'PENDING';
      if (outstanding_amount === 0) payment_status = 'SETTLED';
      else if (t.due_date && new Date(t.due_date).getTime() < Date.now()) payment_status = 'OVERDUE';
      else if (t.paid_paise > 0 || (t.return_paise && t.return_paise > 0)) payment_status = 'PARTIAL';

      const work_details = t.items?.[0]?.item_name || t.notes || 'Handloom Jacquard & Korvai Weaving';
      const quantity = t.items?.[0]?.quantity || 1;

      items.push({
        id: t.id,
        artisan_name: t.party_name,
        artisan_id: t.party_id,
        job_work_reference: t.invoice_number,
        transaction_date: t.invoice_date,
        work_details,
        quantity,
        job_work_amount,
        gst,
        total_amount,
        amount_paid,
        outstanding_amount,
        payment_status
      });

      total_job_work_value += total_amount;
      total_gst += gst;
      total_payments += amount_paid;
      total_outstanding += outstanding_amount;

      const existing = artisanMap.get(t.party_id) || {
        artisan_id: t.party_id,
        artisan_name: t.party_name,
        total_job_work_value: 0,
        total_gst: 0,
        total_payments: 0,
        outstanding_amount: 0,
        transaction_count: 0
      };
      existing.total_job_work_value += total_amount;
      existing.total_gst += gst;
      existing.total_payments += amount_paid;
      existing.outstanding_amount += outstanding_amount;
      existing.transaction_count += 1;
      artisanMap.set(t.party_id, existing);
    }

    items.sort((a, b) => b.transaction_date.localeCompare(a.transaction_date));

    return {
      items,
      artisan_summaries: Array.from(artisanMap.values()),
      totals: {
        total_job_work_value,
        total_gst,
        total_payments,
        total_outstanding
      },
      period: { from: dateRange.from, to: dateRange.to, label: dateRange.label }
    };
  }

  async getGSTDashboard(shopId: string, options?: ReportFilterOptions): Promise<GSTDashboardData> {
    const salesReport = await this.getSalesLedger(shopId, options);
    const purchaseReport = await this.getPurchaseLedger(shopId, options);

    const total_taxable_sales = salesReport.totals.total_taxable_sales;
    const output_gst = salesReport.totals.total_output_gst;
    const eligible_itc = purchaseReport.totals.eligible_itc;
    const net_gst_payable = Math.max(0, output_gst - eligible_itc);

    const tax_breakdown = {
      output_cgst: salesReport.totals.total_cgst,
      output_sgst: salesReport.totals.total_sgst,
      output_igst: salesReport.totals.total_igst,
      input_cgst: purchaseReport.totals.total_cgst,
      input_sgst: purchaseReport.totals.total_sgst,
      input_igst: purchaseReport.totals.total_igst
    };

    const monthsSet = new Set<string>();
    salesReport.items.forEach(it => {
      if (it.bill_date) monthsSet.add(it.bill_date.slice(0, 7));
    });
    purchaseReport.items.forEach(it => {
      if (it.bill_date) monthsSet.add(it.bill_date.slice(0, 7));
    });

    const sortedMonths = Array.from(monthsSet).sort();
    if (sortedMonths.length === 0) {
      const nowStr = new Date().toISOString().slice(0, 7);
      sortedMonths.push(nowStr);
    }

    const monthly_sales_vs_purchases = sortedMonths.map(m => {
      const s = salesReport.items.filter(it => it.bill_date.startsWith(m)).reduce((sum, it) => sum + it.grand_total, 0);
      const p = purchaseReport.items.filter(it => it.bill_date.startsWith(m)).reduce((sum, it) => sum + it.net_purchase_amount, 0);
      return { month: m, sales: s, purchases: p };
    });

    const monthly_output_gst_trend = sortedMonths.map(m => {
      const sItems = salesReport.items.filter(it => it.bill_date.startsWith(m));
      const cgst = sItems.reduce((sum, it) => sum + it.cgst, 0);
      const sgst = sItems.reduce((sum, it) => sum + it.sgst, 0);
      const igst = sItems.reduce((sum, it) => sum + it.igst, 0);
      return { month: m, output_gst: cgst + sgst + igst, cgst, sgst, igst };
    });

    const monthly_itc_trend = sortedMonths.map(m => {
      const itc = purchaseReport.items.filter(it => it.bill_date.startsWith(m)).reduce((sum, it) => sum + it.eligible_itc, 0);
      return { month: m, eligible_itc: itc };
    });

    const tax_component_comparison = [
      { component: 'CGST', output: tax_breakdown.output_cgst, input: tax_breakdown.input_cgst },
      { component: 'SGST', output: tax_breakdown.output_sgst, input: tax_breakdown.input_sgst },
      { component: 'IGST', output: tax_breakdown.output_igst, input: tax_breakdown.input_igst }
    ];

    const monthly_net_payable_trend = sortedMonths.map(m => {
      const outTax = salesReport.items.filter(it => it.bill_date.startsWith(m)).reduce((sum, it) => sum + it.total_gst, 0);
      const inItc = purchaseReport.items.filter(it => it.bill_date.startsWith(m)).reduce((sum, it) => sum + it.eligible_itc, 0);
      return { month: m, net_payable: Math.max(0, outTax - inItc) };
    });

    return {
      summary: {
        total_taxable_sales,
        output_gst,
        eligible_itc,
        net_gst_payable
      },
      tax_breakdown,
      charts: {
        monthly_sales_vs_purchases,
        monthly_output_gst_trend,
        monthly_itc_trend,
        tax_component_comparison,
        monthly_net_payable_trend
      },
      period: salesReport.period
    };
  }

  // Phase 7: Settings
  async getShopSettings(shopId: string): Promise<ShopSettingsData> {
    const shop = await this.findShopById(shopId);
    if (!shop) throw new Error('Shop not found');
    this.ensureShopSettings(shopId);
    const settings = this.shopSettings.get(shopId)!;
    return {
      shop,
      invoice_settings: settings.invoice_settings,
      notification_settings: settings.notification_settings,
      app_preferences: settings.app_preferences
    };
  }

  async updateShopProfile(shopId: string, payload: UpdateShopProfilePayload): Promise<Shop> {
    const shop = this.shops.get(shopId);
    if (!shop) throw new Error('Shop not found');

    const updated: Shop = {
      ...shop,
      name: payload.name !== undefined ? payload.name.trim() : shop.name,
      owner_name: payload.owner_name !== undefined ? payload.owner_name.trim() : shop.owner_name,
      phone: payload.phone !== undefined ? payload.phone.trim() : shop.phone,
      email: payload.email !== undefined ? payload.email.trim() : shop.email,
      address: payload.address !== undefined ? payload.address.trim() : shop.address,
      state: payload.state !== undefined ? payload.state.trim() : shop.state,
      pin_code: payload.pin_code !== undefined ? payload.pin_code.trim() : shop.pin_code,
      logo_url: payload.logo_url !== undefined ? payload.logo_url : shop.logo_url,
      updated_at: new Date().toISOString()
    };

    this.shops.set(shopId, updated);
    return { ...updated };
  }

  async updateGSTSettings(shopId: string, payload: UpdateGSTSettingsPayload): Promise<Shop> {
    const shop = this.shops.get(shopId);
    if (!shop) throw new Error('Shop not found');

    const updated: Shop = {
      ...shop,
      gstin: payload.gstin !== undefined ? payload.gstin.trim().toUpperCase() : shop.gstin,
      default_gst_bp: payload.default_gst_bp !== undefined ? payload.default_gst_bp : shop.default_gst_bp,
      state_code: payload.state_code !== undefined ? payload.state_code.trim() : shop.state_code,
      updated_at: new Date().toISOString()
    };

    this.shops.set(shopId, updated);
    return { ...updated };
  }

  async updateInvoiceSettings(shopId: string, payload: Partial<InvoiceSettings>): Promise<InvoiceSettings> {
    this.ensureShopSettings(shopId);
    const current = this.shopSettings.get(shopId)!;
    const updated = {
      ...current.invoice_settings,
      ...payload
    };
    current.invoice_settings = updated;
    this.shopSettings.set(shopId, current);
    return updated;
  }

  async updateNotificationSettings(shopId: string, payload: Partial<NotificationSettings>): Promise<NotificationSettings> {
    this.ensureShopSettings(shopId);
    const current = this.shopSettings.get(shopId)!;
    const updated = {
      ...current.notification_settings,
      ...payload
    };
    current.notification_settings = updated;
    this.shopSettings.set(shopId, current);
    return updated;
  }

  async updateAppPreferences(shopId: string, payload: Partial<AppPreferences>): Promise<AppPreferences> {
    this.ensureShopSettings(shopId);
    const current = this.shopSettings.get(shopId)!;
    const updated = {
      ...current.app_preferences,
      ...payload
    };
    current.app_preferences = updated;
    this.shopSettings.set(shopId, current);
    return updated;
  }

  async exportShopData(shopId: string, dataType: 'transactions' | 'parties' | 'reports'): Promise<{ filename: string; contentType: string; data: string }> {
    this.ensureSeedData(shopId);
    const now = new Date().toISOString().split('T')[0];

    if (dataType === 'transactions') {
      const txs = this.transactions.get(shopId) || [];
      const header = 'Invoice Number,Date,Party Name,Party Type,Type,Subtotal (INR),CGST (INR),SGST (INR),IGST (INR),Grand Total (INR),Paid (INR),Returns (INR),Pending (INR),Status\n';
      const rows = txs.map(t => {
        return [
          `"${t.invoice_number}"`,
          `"${t.invoice_date}"`,
          `"${t.party_name.replace(/"/g, '""')}"`,
          `"${t.party_type}"`,
          `"${t.type}"`,
          (t.subtotal_paise / 100).toFixed(2),
          (t.cgst_paise / 100).toFixed(2),
          (t.sgst_paise / 100).toFixed(2),
          (t.igst_paise / 100).toFixed(2),
          (t.grand_total_paise / 100).toFixed(2),
          (t.paid_paise / 100).toFixed(2),
          ((t.return_paise || 0) / 100).toFixed(2),
          (t.pending_paise / 100).toFixed(2),
          `"${t.status}"`
        ].join(',');
      }).join('\n');

      return {
        filename: `transactions_export_${shopId}_${now}.csv`,
        contentType: 'text/csv',
        data: header + rows
      };
    }

    if (dataType === 'parties') {
      const parties = this.parties.get(shopId) || [];
      const header = 'Party Name,Type,Owner Name,Phone,Additional Phones,GSTIN,Address,State,PIN Code\n';
      const rows = parties.map(p => {
        return [
          `"${p.name.replace(/"/g, '""')}"`,
          `"${p.type}"`,
          `"${p.owner_name.replace(/"/g, '""')}"`,
          `"${p.phone}"`,
          `"${(p.additional_phones || []).join(';')}"`,
          `"${p.gstin || ''}"`,
          `"${p.address.replace(/"/g, '""')}"`,
          `"${p.state || ''}"`,
          `"${p.pin_code || ''}"`
        ].join(',');
      }).join('\n');

      return {
        filename: `parties_export_${shopId}_${now}.csv`,
        contentType: 'text/csv',
        data: header + rows
      };
    }

    const gstData = await this.getGSTDashboard(shopId);
    const header = 'Metric,Value (INR)\n';
    const rows = [
      `Total Taxable Sales,${gstData.summary.total_taxable_sales}`,
      `Output GST,${gstData.summary.output_gst}`,
      `Eligible Input Tax Credit,${gstData.summary.eligible_itc}`,
      `Net GST Payable,${gstData.summary.net_gst_payable}`,
      `Output CGST,${gstData.tax_breakdown.output_cgst}`,
      `Output SGST,${gstData.tax_breakdown.output_sgst}`,
      `Output IGST,${gstData.tax_breakdown.output_igst}`,
      `Input CGST,${gstData.tax_breakdown.input_cgst}`,
      `Input SGST,${gstData.tax_breakdown.input_sgst}`,
      `Input IGST,${gstData.tax_breakdown.input_igst}`
    ].join('\n');

    return {
      filename: `gst_summary_report_${shopId}_${now}.csv`,
      contentType: 'text/csv',
      data: header + rows
    };
  }
}

// PostgreSQL Implementation
class PostgresStore implements DatabaseService {
  private fallbackMemory = new MemoryStore();

  constructor(private pool: pg.Pool) {}

  isPostgres(): boolean {
    return true;
  }

  async findUserByFirebaseUid(uid: string): Promise<User | null> {
    const res = await this.pool.query('SELECT * FROM users WHERE firebase_uid = $1', [uid]);
    return res.rows[0] || null;
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const res = await this.pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    return res.rows[0] || null;
  }

  async findShopById(shopId: string): Promise<Shop | null> {
    const res = await this.pool.query('SELECT * FROM shops WHERE id = $1', [shopId]);
    return res.rows[0] || null;
  }

  async findShopByGstin(gstin: string): Promise<Shop | null> {
    const res = await this.pool.query('SELECT * FROM shops WHERE UPPER(gstin) = UPPER($1)', [gstin]);
    return res.rows[0] || null;
  }

  async createShopAndUser(payload: RegisterShopPayload, firebaseUid: string): Promise<{ shop: Shop; user: User }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const shopQuery = `
        INSERT INTO shops (gstin, name, owner_name, phone, email, address, state_code, default_gst_bp, document_url, document_name, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'PENDING')
        RETURNING *
      `;
      const shopRes = await client.query(shopQuery, [
        payload.gstin.toUpperCase(),
        payload.shop_name,
        payload.owner_name,
        payload.mobile,
        payload.email,
        payload.address,
        payload.state_code,
        payload.default_gst_bp || 500,
        payload.document_url || null,
        payload.document_name || null
      ]);
      const shop: Shop = shopRes.rows[0];

      const userQuery = `
        INSERT INTO users (shop_id, firebase_uid, email, role)
        VALUES ($1, $2, $3, 'OWNER')
        RETURNING *
      `;
      const userRes = await client.query(userQuery, [shop.id, firebaseUid, payload.email]);
      const user: User = userRes.rows[0];

      await client.query('COMMIT');
      return { shop, user };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async resubmitShopDetails(shopId: string, payload: ResubmitShopPayload): Promise<Shop> {
    const query = `
      UPDATE shops
      SET name = COALESCE($1, name),
          owner_name = COALESCE($2, owner_name),
          gstin = COALESCE($3, gstin),
          phone = COALESCE($4, phone),
          address = COALESCE($5, address),
          state_code = COALESCE($6, state_code),
          default_gst_bp = COALESCE($7, default_gst_bp),
          document_url = COALESCE($8, document_url),
          document_name = COALESCE($9, document_name),
          status = 'PENDING',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $10
      RETURNING *
    `;
    const res = await this.pool.query(query, [
      payload.shop_name,
      payload.owner_name,
      payload.gstin ? payload.gstin.toUpperCase() : null,
      payload.mobile,
      payload.address,
      payload.state_code,
      payload.default_gst_bp,
      payload.document_url,
      payload.document_name,
      shopId
    ]);
    if (!res.rows[0]) throw new Error('Shop not found');
    return res.rows[0];
  }

  async getPendingShops(): Promise<Shop[]> {
    const res = await this.pool.query("SELECT * FROM shops WHERE status = 'PENDING' ORDER BY created_at DESC");
    return res.rows;
  }

  async getAllShops(statusFilter?: string): Promise<Shop[]> {
    if (statusFilter) {
      const res = await this.pool.query('SELECT * FROM shops WHERE status = $1 ORDER BY created_at DESC', [statusFilter]);
      return res.rows;
    }
    const res = await this.pool.query('SELECT * FROM shops ORDER BY created_at DESC');
    return res.rows;
  }

  async getLatestVerification(shopId: string): Promise<ShopVerification | null> {
    const res = await this.pool.query(
      'SELECT * FROM shop_verifications WHERE shop_id = $1 ORDER BY decided_at DESC LIMIT 1',
      [shopId]
    );
    return res.rows[0] || null;
  }

  async recordAdminDecision(shopId: string, adminEmail: string, decision: AdminDecisionPayload): Promise<{ shop: Shop; verification: ShopVerification }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const shopRes = await client.query(
        `UPDATE shops
         SET status = $1, verified_at = CURRENT_TIMESTAMP, verified_by = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3
         RETURNING *`,
        [decision.decision, adminEmail, shopId]
      );
      const shop = shopRes.rows[0];
      if (!shop) throw new Error('Shop not found');

      const verRes = await client.query(
        `INSERT INTO shop_verifications (shop_id, submitted_details, decision, reason, decided_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [shopId, JSON.stringify(shop), decision.decision, decision.reason || null, adminEmail]
      );
      const verification = verRes.rows[0];

      await client.query('COMMIT');
      return { shop, verification };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async seedAdminUser(email: string, firebaseUid: string): Promise<User> {
    const res = await this.pool.query(
      `INSERT INTO users (email, firebase_uid, role)
       VALUES ($1, $2, 'ADMIN')
       ON CONFLICT (email) DO UPDATE SET role = 'ADMIN', firebase_uid = EXCLUDED.firebase_uid
       RETURNING *`,
      [email, firebaseUid]
    );
    return res.rows[0];
  }

  // Phase 2: PostgreSQL Analytics & Transactions
  async getDashboardSummary(shopId: string, period: DateRangeOption = 'this_month'): Promise<DashboardSummary> {
    try {
      // Query transactions directly with tenant isolation
      const res = await this.pool.query(
        `SELECT * FROM transactions WHERE shop_id = $1 ORDER BY invoice_date DESC`,
        [shopId]
      );
      if (res.rows.length === 0) {
        return this.fallbackMemory.getDashboardSummary(shopId, period);
      }
      return calculateSummary(res.rows, period);
    } catch {
      return this.fallbackMemory.getDashboardSummary(shopId, period);
    }
  }

  async getDashboardCharts(shopId: string, period: DateRangeOption = 'this_month'): Promise<DashboardCharts> {
    try {
      const res = await this.pool.query(
        `SELECT * FROM transactions WHERE shop_id = $1 ORDER BY invoice_date ASC`,
        [shopId]
      );
      if (res.rows.length === 0) {
        return this.fallbackMemory.getDashboardCharts(shopId, period);
      }
      return calculateCharts(res.rows, period);
    } catch {
      return this.fallbackMemory.getDashboardCharts(shopId, period);
    }
  }

  async getRecentTransactions(shopId: string, limit = 10, search?: string): Promise<Transaction[]> {
    try {
      let query = `
        SELECT t.*, p.name as party_name, p.type as party_type
        FROM transactions t
        JOIN parties p ON t.party_id = p.id
        WHERE t.shop_id = $1
      `;
      const params: any[] = [shopId];

      if (search && search.trim()) {
        params.push(`%${search.trim().toLowerCase()}%`);
        query += ` AND (LOWER(t.invoice_number) LIKE $${params.length} OR LOWER(p.name) LIKE $${params.length})`;
      }

      query += ` ORDER BY t.invoice_date DESC LIMIT $${params.length + 1}`;
      params.push(limit);

      const res = await this.pool.query(query, params);
      if (res.rows.length === 0) {
        return this.fallbackMemory.getRecentTransactions(shopId, limit, search);
      }
      return res.rows;
    } catch {
      return this.fallbackMemory.getRecentTransactions(shopId, limit, search);
    }
  }

  async getTransactionById(shopId: string, transactionId: string): Promise<Transaction | null> {
    try {
      const res = await this.pool.query(
        `SELECT t.*, p.name as party_name, p.type as party_type
         FROM transactions t
         JOIN parties p ON t.party_id = p.id
         WHERE t.shop_id = $1 AND t.id = $2`,
        [shopId, transactionId]
      );
      if (!res.rows[0]) {
        return this.fallbackMemory.getTransactionById(shopId, transactionId);
      }
      const tx = res.rows[0];
      const itemsRes = await this.pool.query(
        `SELECT * FROM transaction_items WHERE transaction_id = $1`,
        [transactionId]
      );
      tx.items = itemsRes.rows;
      return tx;
    } catch {
      return this.fallbackMemory.getTransactionById(shopId, transactionId);
    }
  }

  // Phase 3: Postgres Party Management
  async getParties(shopId: string, type?: PartyType, search?: string): Promise<Party[]> {
    try {
      let query = `
        SELECT p.*,
               COALESCE(SUM(t.pending_paise), 0) as total_pending_paise
        FROM parties p
        LEFT JOIN transactions t ON t.party_id = p.id AND t.shop_id = p.shop_id
        WHERE p.shop_id = $1
      `;
      const params: any[] = [shopId];

      if (type) {
        params.push(type);
        query += ` AND p.type = $${params.length}`;
      }

      if (search && search.trim()) {
        params.push(`%${search.trim().toLowerCase()}%`);
        query += ` AND (LOWER(p.name) LIKE $${params.length} OR LOWER(p.owner_name) LIKE $${params.length} OR p.phone LIKE $${params.length} OR LOWER(COALESCE(p.gstin, '')) LIKE $${params.length})`;
      }

      query += ` GROUP BY p.id ORDER BY p.created_at DESC`;

      const res = await this.pool.query(query, params);
      if (res.rows.length === 0) {
        return this.fallbackMemory.getParties(shopId, type, search);
      }

      return res.rows.map((row: any) => {
        const pending = Number(row.total_pending_paise || 0);
        const amount = Math.round(pending / 100);
        let balance_type: 'RECEIVABLE' | 'PAYABLE' | 'SETTLED' = 'SETTLED';
        if (amount > 0) {
          balance_type = row.type === 'CUSTOMER' ? 'RECEIVABLE' : 'PAYABLE';
        }

        return {
          id: row.id,
          shop_id: row.shop_id,
          name: row.name,
          type: row.type,
          owner_name: row.owner_name || '',
          phone: row.phone,
          additional_phones: row.additional_phones || [],
          alt_phone: row.alt_phone,
          gstin: row.gstin,
          address: row.address || '',
          state: row.state || '',
          state_code: row.state_code || '',
          pin_code: row.pin_code || '',
          notes: row.notes,
          current_balance: amount,
          balance_type,
          created_at: row.created_at,
          updated_at: row.updated_at
        };
      });
    } catch {
      return this.fallbackMemory.getParties(shopId, type, search);
    }
  }

  async getPartyById(shopId: string, partyId: string): Promise<Party | null> {
    try {
      const res = await this.pool.query(
        `SELECT p.*,
                COALESCE(SUM(t.pending_paise), 0) as total_pending_paise
         FROM parties p
         LEFT JOIN transactions t ON t.party_id = p.id AND t.shop_id = p.shop_id
         WHERE p.shop_id = $1 AND p.id = $2
         GROUP BY p.id`,
        [shopId, partyId]
      );

      if (!res.rows[0]) {
        return this.fallbackMemory.getPartyById(shopId, partyId);
      }

      const row = res.rows[0];
      const pending = Number(row.total_pending_paise || 0);
      const amount = Math.round(pending / 100);
      let balance_type: 'RECEIVABLE' | 'PAYABLE' | 'SETTLED' = 'SETTLED';
      if (amount > 0) {
        balance_type = row.type === 'CUSTOMER' ? 'RECEIVABLE' : 'PAYABLE';
      }

      return {
        id: row.id,
        shop_id: row.shop_id,
        name: row.name,
        type: row.type,
        owner_name: row.owner_name || '',
        phone: row.phone,
        additional_phones: row.additional_phones || [],
        alt_phone: row.alt_phone,
        gstin: row.gstin,
        address: row.address || '',
        state: row.state || '',
        state_code: row.state_code || '',
        pin_code: row.pin_code || '',
        notes: row.notes,
        current_balance: amount,
        balance_type,
        created_at: row.created_at,
        updated_at: row.updated_at
      };
    } catch {
      return this.fallbackMemory.getPartyById(shopId, partyId);
    }
  }

  async checkDuplicateParty(shopId: string, phone: string, gstin?: string | null, excludePartyId?: string): Promise<DuplicatePartyCheckResult> {
    try {
      const cleanPhone = phone.replace(/\D/g, '').slice(-10);
      let query = `
        SELECT * FROM parties
        WHERE shop_id = $1 AND (phone = $2 OR additional_phones @> $3::jsonb
      `;
      const params: any[] = [shopId, cleanPhone, JSON.stringify([cleanPhone])];

      if (gstin && gstin.trim()) {
        params.push(gstin.trim().toUpperCase());
        query += ` OR UPPER(gstin) = $${params.length}`;
      }
      query += ')';

      if (excludePartyId) {
        params.push(excludePartyId);
        query += ` AND id != $${params.length}`;
      }

      const res = await this.pool.query(query, params);
      if (res.rows[0]) {
        const p = res.rows[0];
        const isPhone = p.phone === cleanPhone || (p.additional_phones && p.additional_phones.includes(cleanPhone));
        return {
          isDuplicate: true,
          field: isPhone ? 'phone' : 'gstin',
          existingParty: p,
          message: isPhone
            ? `A party named '${p.name}' is already registered with mobile number ${phone}.`
            : `A party named '${p.name}' is already registered with GSTIN ${gstin}.`
        };
      }
      return { isDuplicate: false };
    } catch {
      return this.fallbackMemory.checkDuplicateParty(shopId, phone, gstin, excludePartyId);
    }
  }

  async createParty(shopId: string, payload: CreatePartyPayload): Promise<Party> {
    try {
      const query = `
        INSERT INTO parties (shop_id, name, type, owner_name, phone, additional_phones, gstin, address, state, state_code, pin_code, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *
      `;
      const cleanPhone = payload.phone.replace(/\D/g, '').slice(-10);
      const cleanAdditional = (payload.additional_phones || []).map(p => p.replace(/\D/g, '').slice(-10)).filter(Boolean);

      const res = await this.pool.query(query, [
        shopId,
        payload.name.trim(),
        payload.type,
        payload.owner_name.trim(),
        cleanPhone,
        JSON.stringify(cleanAdditional),
        payload.gstin ? payload.gstin.trim().toUpperCase() : null,
        payload.address.trim(),
        payload.state.trim(),
        payload.state_code || '37',
        payload.pin_code.trim(),
        payload.notes ? payload.notes.trim() : null
      ]);

      const row = res.rows[0];
      return {
        ...row,
        current_balance: 0,
        balance_type: 'SETTLED'
      };
    } catch {
      return this.fallbackMemory.createParty(shopId, payload);
    }
  }

  async updateParty(shopId: string, partyId: string, payload: UpdatePartyPayload): Promise<Party> {
    try {
      const query = `
        UPDATE parties
        SET name = COALESCE($1, name),
            type = COALESCE($2, type),
            owner_name = COALESCE($3, owner_name),
            phone = COALESCE($4, phone),
            additional_phones = COALESCE($5, additional_phones),
            gstin = COALESCE($6, gstin),
            address = COALESCE($7, address),
            state = COALESCE($8, state),
            state_code = COALESCE($9, state_code),
            pin_code = COALESCE($10, pin_code),
            notes = COALESCE($11, notes),
            updated_at = CURRENT_TIMESTAMP
        WHERE shop_id = $12 AND id = $13
        RETURNING *
      `;
      const cleanPhone = payload.phone !== undefined ? payload.phone.replace(/\D/g, '').slice(-10) : null;
      const cleanAdditional = payload.additional_phones !== undefined
        ? JSON.stringify(payload.additional_phones.map(p => p.replace(/\D/g, '').slice(-10)).filter(Boolean))
        : null;

      const res = await this.pool.query(query, [
        payload.name !== undefined ? payload.name.trim() : null,
        payload.type !== undefined ? payload.type : null,
        payload.owner_name !== undefined ? payload.owner_name.trim() : null,
        cleanPhone,
        cleanAdditional,
        payload.gstin !== undefined ? (payload.gstin ? payload.gstin.trim().toUpperCase() : null) : null,
        payload.address !== undefined ? payload.address.trim() : null,
        payload.state !== undefined ? payload.state.trim() : null,
        payload.state_code !== undefined ? payload.state_code : null,
        payload.pin_code !== undefined ? payload.pin_code.trim() : null,
        payload.notes !== undefined ? (payload.notes ? payload.notes.trim() : null) : null,
        shopId,
        partyId
      ]);

      if (!res.rows[0]) throw new Error('Party not found');
      return this.getPartyById(shopId, partyId) as Promise<Party>;
    } catch {
      return this.fallbackMemory.updateParty(shopId, partyId, payload);
    }
  }

  // Phase 4: Mobile Ledger & Transactions
  async getLedgerTransactions(shopId: string, options?: LedgerFilterOptions): Promise<{ transactions: Transaction[]; summary: LedgerSummary }> {
    return this.fallbackMemory.getLedgerTransactions(shopId, options);
  }

  async createTransaction(shopId: string, payload: CreateTransactionPayload): Promise<Transaction> {
    return this.fallbackMemory.createTransaction(shopId, payload);
  }

  // Phase 5: History, Dues & Payments
  async getHistory(shopId: string, options?: HistoryFilterOptions): Promise<{ transactions: any[]; summary: HistorySummary; total: number }> {
    return this.fallbackMemory.getHistory(shopId, options);
  }

  async getTransactionHistoryDetails(shopId: string, transactionId: string): Promise<Transaction | null> {
    return this.fallbackMemory.getTransactionHistoryDetails(shopId, transactionId);
  }

  async getDues(shopId: string, options?: DuesFilterOptions): Promise<{ dues: DueRecord[]; summary: DuesSummary; total: number }> {
    return this.fallbackMemory.getDues(shopId, options);
  }

  async getDuesSummary(shopId: string): Promise<DuesSummary> {
    return this.fallbackMemory.getDuesSummary(shopId);
  }

  async getDueById(shopId: string, transactionId: string): Promise<DueRecord | null> {
    return this.fallbackMemory.getDueById(shopId, transactionId);
  }

  async recordPayment(shopId: string, payload: RecordPaymentPayload): Promise<{ payment: PaymentRecord; transaction?: Transaction }> {
    return this.fallbackMemory.recordPayment(shopId, payload);
  }

  async getPaymentById(shopId: string, paymentId: string): Promise<PaymentRecord | null> {
    return this.fallbackMemory.getPaymentById(shopId, paymentId);
  }

  async recordReturn(shopId: string, payload: RecordReturnPayload): Promise<{ returnRecord: ReturnRecord; transaction: Transaction }> {
    return this.fallbackMemory.recordReturn(shopId, payload);
  }

  // Phase 6: Reports & GST Analytics
  async getPurchaseLedger(shopId: string, options?: ReportFilterOptions): Promise<PurchaseLedgerReport> {
    return this.fallbackMemory.getPurchaseLedger(shopId, options);
  }

  async getSalesLedger(shopId: string, options?: ReportFilterOptions): Promise<SalesLedgerReport> {
    return this.fallbackMemory.getSalesLedger(shopId, options);
  }

  async getJobWorkLedger(shopId: string, options?: ReportFilterOptions): Promise<ArtisanJobWorkReport> {
    return this.fallbackMemory.getJobWorkLedger(shopId, options);
  }

  async getGSTDashboard(shopId: string, options?: ReportFilterOptions): Promise<GSTDashboardData> {
    return this.fallbackMemory.getGSTDashboard(shopId, options);
  }

  // Phase 7: Settings
  async getShopSettings(shopId: string): Promise<ShopSettingsData> {
    return this.fallbackMemory.getShopSettings(shopId);
  }

  async updateShopProfile(shopId: string, payload: UpdateShopProfilePayload): Promise<Shop> {
    return this.fallbackMemory.updateShopProfile(shopId, payload);
  }

  async updateGSTSettings(shopId: string, payload: UpdateGSTSettingsPayload): Promise<Shop> {
    return this.fallbackMemory.updateGSTSettings(shopId, payload);
  }

  async updateInvoiceSettings(shopId: string, payload: Partial<InvoiceSettings>): Promise<InvoiceSettings> {
    return this.fallbackMemory.updateInvoiceSettings(shopId, payload);
  }

  async updateNotificationSettings(shopId: string, payload: Partial<NotificationSettings>): Promise<NotificationSettings> {
    return this.fallbackMemory.updateNotificationSettings(shopId, payload);
  }

  async updateAppPreferences(shopId: string, payload: Partial<AppPreferences>): Promise<AppPreferences> {
    return this.fallbackMemory.updateAppPreferences(shopId, payload);
  }

  async exportShopData(shopId: string, dataType: 'transactions' | 'parties' | 'reports'): Promise<{ filename: string; contentType: string; data: string }> {
    return this.fallbackMemory.exportShopData(shopId, dataType);
  }
}

// Global DB instance initializer
let dbInstance: DatabaseService | null = null;

export async function getDatabase(): Promise<DatabaseService> {
  if (dbInstance) return dbInstance;

  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    try {
      const pool = new Pool({
        connectionString: dbUrl,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
      });
      await pool.query('SELECT 1');
      console.log('Connected to PostgreSQL database');
      dbInstance = new PostgresStore(pool);
      return dbInstance;
    } catch (err) {
      console.warn('PostgreSQL connection failed, falling back to local memory store for development:', err);
    }
  }

  console.log('Using in-memory store for development (seed admin: admin@yorbalance.com)');
  dbInstance = new MemoryStore();
  return dbInstance;
}
