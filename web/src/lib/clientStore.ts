import {
  Shop,
  ShopVerification,
  RegisterShopPayload,
  ResubmitShopPayload,
  User,
  Transaction,
  Party,
  PartyType,
  CreatePartyPayload,
  UpdatePartyPayload,
  DuplicatePartyCheckResult,
  CreateTransactionPayload,
  LedgerSummary,
  LedgerFilterOptions,
  DashboardSummary,
  DashboardCharts,
  DateRangeOption,
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
  PurchaseLedgerItem,
  SalesLedgerReport,
  SalesLedgerItem,
  ArtisanJobWorkReport,
  ArtisanJobWorkItem,
  ArtisanSummary,
  GSTDashboardData,
  ShopSettingsData,
  InvoiceSettings,
  NotificationSettings,
  AppPreferences,
  UpdateShopProfilePayload,
  UpdateGSTSettingsPayload,
  PaymentStatus
} from '@yorbalance/shared';
import {
  createSeedParties,
  createSeedTransactions,
  calculateSummary,
  calculateCharts
} from './demoData';

const STORAGE_KEY_SHOPS = 'yorbalance_client_shops';
const STORAGE_KEY_VERIFICATIONS = 'yorbalance_client_verifications';
const STORAGE_KEY_TRANSACTIONS = 'yorbalance_client_transactions';
const STORAGE_KEY_PARTIES = 'yorbalance_client_parties';
const STORAGE_KEY_PAYMENTS = 'yorbalance_client_payments';
const STORAGE_KEY_RETURNS = 'yorbalance_client_returns';
const STORAGE_KEY_SETTINGS = 'yorbalance_client_settings';

function loadSettings(shopId: string): {
  invoice_settings: InvoiceSettings;
  notification_settings: NotificationSettings;
  app_preferences: AppPreferences;
} {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_SETTINGS}_${shopId}`);
    if (raw) return JSON.parse(raw);
  } catch {}

  const defaults = {
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
      reminder_lead_time_days: 3 as const,
      daily_reminder_time: '08:00 IST'
    },
    app_preferences: {
      currency: 'INR',
      time_zone: 'Asia/Kolkata',
      date_format: 'DD/MM/YYYY',
      theme: 'system' as const,
      language: 'en',
      default_landing_page: '/dashboard'
    }
  };
  saveSettings(shopId, defaults);
  return defaults;
}

function saveSettings(shopId: string, settings: any) {
  try {
    localStorage.setItem(`${STORAGE_KEY_SETTINGS}_${shopId}`, JSON.stringify(settings));
  } catch {}
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

function loadPayments(shopId: string): PaymentRecord[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PAYMENTS}_${shopId}`);
    if (raw) return JSON.parse(raw);
  } catch {}

  const txs = loadTransactions(shopId);
  const seedPayments: PaymentRecord[] = [];
  for (const t of txs) {
    if (t.paid_paise > 0) {
      const paymentMode: 'CASH' | 'CHEQUE' | 'NEFT' =
        t.type === 'SALE' ? 'NEFT' : t.type === 'PURCHASE' ? 'CHEQUE' : 'CASH';
      seedPayments.push({
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
        reference_number: paymentMode === 'NEFT' ? 'UTR1029384756' : null,
        cheque_number: paymentMode === 'CHEQUE' ? '556677' : null,
        clearing_status: 'CLEARED',
        notes: `Initial settled payment for ${t.invoice_number}`,
        created_at: t.created_at
      });
    }
  }
  savePayments(shopId, seedPayments);
  return seedPayments;
}

function savePayments(shopId: string, payments: PaymentRecord[]) {
  try {
    localStorage.setItem(`${STORAGE_KEY_PAYMENTS}_${shopId}`, JSON.stringify(payments));
  } catch {}
}

function loadReturns(shopId: string): ReturnRecord[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_RETURNS}_${shopId}`);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveReturns(shopId: string, returns: ReturnRecord[]) {
  try {
    localStorage.setItem(`${STORAGE_KEY_RETURNS}_${shopId}`, JSON.stringify(returns));
  } catch {}
}

function loadParties(shopId: string): Party[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PARTIES}_${shopId}`);
    if (raw) return JSON.parse(raw);
  } catch {}

  const parties = createSeedParties(shopId);
  saveParties(shopId, parties);
  return parties;
}

function saveParties(shopId: string, parties: Party[]) {
  try {
    localStorage.setItem(`${STORAGE_KEY_PARTIES}_${shopId}`, JSON.stringify(parties));
  } catch {}
}

function enrichClientPartyWithBalance(party: Party, transactions: Transaction[]): Party {
  const partyTxs = transactions.filter(t => t.party_id === party.id);
  const totalPendingPaise = partyTxs.reduce((sum, t) => sum + (t.pending_paise || 0), 0);
  const amountRupees = Math.round(totalPendingPaise / 100);

  let balance_type: 'RECEIVABLE' | 'PAYABLE' | 'SETTLED' = 'SETTLED';
  if (amountRupees > 0) {
    balance_type = party.type === 'CUSTOMER' ? 'RECEIVABLE' : 'PAYABLE';
  }

  return {
    ...party,
    current_balance: amountRupees,
    balance_type
  };
}

const INITIAL_DEMO_SHOPS: Shop[] = [
  {
    id: 'demo-shop-1',
    name: 'Sri Lakshmi Silks & Sarees',
    owner_name: 'Ramesh Kumar',
    gstin: '37AAACH7409R1ZZ',
    phone: '9848022338',
    email: 'ramesh@srilakshmisilks.com',
    address: 'Shop #14, Main Silk Bazaar, MG Road, Dharmavaram, Andhra Pradesh - 515671',
    state_code: '37',
    default_gst_bp: 500,
    status: 'APPROVED',
    document_name: 'gst_certificate.jpg',
    document_url: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
    verified_by: 'muzamilmohammadk@gmail.com',
    verified_at: new Date(Date.now() - 86400000).toISOString(),
    created_at: new Date(Date.now() - 3600000 * 5).toISOString(),
    updated_at: new Date(Date.now() - 3600000 * 4).toISOString()
  },
  {
    id: 'demo-shop-2',
    name: 'Kanchi Heritage Silk Weavers',
    owner_name: 'K. Sundaram',
    gstin: '33AAAAA0000A1Z5',
    phone: '9840112233',
    email: 'sundaram@kanchiheritage.com',
    address: '45 Temple Street, Kanchipuram, Tamil Nadu - 631501',
    state_code: '33',
    default_gst_bp: 500,
    status: 'APPROVED',
    document_name: 'business_reg.jpg',
    document_url: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
    verified_by: 'DHiaM4ITGIPoR9YgB3YJaHycOv13',
    verified_at: new Date(Date.now() - 86400000).toISOString(),
    created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    updated_at: new Date(Date.now() - 86400000).toISOString()
  }
];

function loadShops(): Shop[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SHOPS);
    if (raw) return JSON.parse(raw);
  } catch {}
  localStorage.setItem(STORAGE_KEY_SHOPS, JSON.stringify(INITIAL_DEMO_SHOPS));
  return INITIAL_DEMO_SHOPS;
}

function saveShops(shops: Shop[]) {
  localStorage.setItem(STORAGE_KEY_SHOPS, JSON.stringify(shops));
}

function loadVerifications(): ShopVerification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_VERIFICATIONS);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveVerifications(vers: ShopVerification[]) {
  localStorage.setItem(STORAGE_KEY_VERIFICATIONS, JSON.stringify(vers));
}

function loadTransactions(shopId: string): Transaction[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_TRANSACTIONS}_${shopId}`);
    if (raw) return JSON.parse(raw);
  } catch {}

  const parties = createSeedParties(shopId);
  const txs = createSeedTransactions(shopId, parties);
  saveTransactions(shopId, txs);
  return txs;
}

function saveTransactions(shopId: string, txs: Transaction[]) {
  try {
    localStorage.setItem(`${STORAGE_KEY_TRANSACTIONS}_${shopId}`, JSON.stringify(txs));
  } catch {}
}

export const clientStore = {
  getShops(status?: string): Shop[] {
    const shops = loadShops();
    if (!status || status === 'ALL') return shops;
    return shops.filter(s => s.status === status);
  },

  getShopById(id: string): { shop: Shop; latest_verification: ShopVerification | null } | null {
    const shops = loadShops();
    const shop = shops.find(s => s.id === id);
    if (!shop) return null;
    const vers = loadVerifications().filter(v => v.shop_id === id);
    const latest = vers.length > 0 ? vers[vers.length - 1] : null;
    return { shop, latest_verification: latest };
  },

  getShopByEmail(email: string): Shop | null {
    const shops = loadShops();
    return shops.find(s => s.email.toLowerCase() === email.toLowerCase()) || null;
  },

  registerShop(payload: RegisterShopPayload): { shop: Shop; user: User } {
    const shops = loadShops();
    const existing = shops.find(s => s.email.toLowerCase() === payload.email.toLowerCase());
    const shopId = existing ? existing.id : 'shop-' + Date.now();
    const userId = 'user-' + Date.now();

    const newShop: Shop = {
      id: shopId,
      name: payload.shop_name,
      owner_name: payload.owner_name,
      gstin: payload.gstin.toUpperCase(),
      phone: payload.mobile,
      email: payload.email.toLowerCase(),
      address: payload.address,
      state_code: payload.state_code || payload.gstin.substring(0, 2),
      default_gst_bp: payload.default_gst_bp || 500,
      status: 'PENDING',
      document_name: payload.document_name || null,
      document_url: payload.document_url || null,
      verified_by: null,
      verified_at: null,
      created_at: existing ? existing.created_at : new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const updated = existing ? shops.map(s => s.id === existing.id ? newShop : s) : [newShop, ...shops];
    saveShops(updated);
    try {
      localStorage.setItem('yorbalance_active_shop_id', newShop.id);
    } catch {}

    const user: User = {
      id: userId,
      shop_id: shopId,
      firebase_uid: userId,
      email: payload.email.toLowerCase(),
      role: 'OWNER',
      created_at: newShop.created_at
    };

    // Pre-seed realistic silk saree ledger transactions
    loadTransactions(shopId);

    return { shop: newShop, user };
  },

  resubmitShop(shopId: string, payload: ResubmitShopPayload): Shop {
    const shops = loadShops();
    const existing = shops.find(s => s.id === shopId);
    if (!existing) throw new Error('Shop not found');

    const updatedShop: Shop = {
      ...existing,
      name: payload.shop_name || existing.name,
      owner_name: payload.owner_name || existing.owner_name,
      gstin: payload.gstin ? payload.gstin.toUpperCase() : existing.gstin,
      phone: payload.mobile || existing.phone,
      address: payload.address || existing.address,
      state_code: payload.state_code || existing.state_code,
      default_gst_bp: payload.default_gst_bp || existing.default_gst_bp,
      status: 'PENDING',
      document_name: payload.document_name || existing.document_name,
      document_url: payload.document_url || existing.document_url,
      updated_at: new Date().toISOString()
    };

    saveShops(shops.map(s => s.id === existing.id ? updatedShop : s));
    return updatedShop;
  },

  recordDecision(id: string, decision: 'APPROVED' | 'REJECTED', reason?: string, adminId: string = 'admin'): { shop: Shop; verification: ShopVerification } {
    const shops = loadShops();
    let existing = shops.find(s => s.id === id);
    if (!existing) {
      existing = shops.find(s => s.gstin.toLowerCase() === id.toLowerCase() || s.name.toLowerCase() === id.toLowerCase());
    }
    if (!existing) throw new Error(`Shop not found`);

    const updatedShop: Shop = {
      ...existing,
      status: decision,
      verified_by: decision === 'APPROVED' ? adminId : null,
      verified_at: decision === 'APPROVED' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    };

    saveShops(shops.map(s => s.id === existing!.id ? updatedShop : s));
    try {
      localStorage.setItem('yorbalance_active_shop_id', existing.id);
    } catch {}

    const verification: ShopVerification = {
      id: 'ver-' + Date.now(),
      shop_id: existing.id,
      submitted_details: { name: existing.name, gstin: existing.gstin },
      decision,
      reason: decision === 'REJECTED' ? (reason || null) : null,
      decided_by: adminId,
      decided_at: new Date().toISOString()
    };

    const vers = loadVerifications();
    saveVerifications([...vers, verification]);

    if (decision === 'APPROVED') {
      loadTransactions(existing.id);
    }

    return { shop: updatedShop, verification };
  },

  // Phase 2 Dashboard APIs
  getDashboardSummary(shopId: string, period?: DateRangeOption): DashboardSummary {
    const txs = loadTransactions(shopId);
    return calculateSummary(txs, period || 'this_month');
  },

  getDashboardCharts(shopId: string, period?: DateRangeOption): DashboardCharts {
    const txs = loadTransactions(shopId);
    return calculateCharts(txs, period || 'this_month');
  },

  getRecentTransactions(shopId: string, limit = 10, search?: string): Transaction[] {
    let txs = loadTransactions(shopId);
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      txs = txs.filter(t =>
        t.invoice_number.toLowerCase().includes(q) ||
        t.party_name.toLowerCase().includes(q) ||
        t.type.toLowerCase().includes(q)
      );
    }
    txs = [...txs].sort((a, b) => b.invoice_date.localeCompare(a.invoice_date));
    return txs.slice(0, limit);
  },

  getTransactionById(shopId: string, transactionId: string): Transaction | null {
    const txs = loadTransactions(shopId);
    return txs.find(t => t.id === transactionId) || null;
  },

  // Phase 3 Party Management
  getParties(shopId: string, type?: PartyType, search?: string): Party[] {
    let parties = loadParties(shopId);
    const txs = loadTransactions(shopId);

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

    const enriched = parties.map(p => enrichClientPartyWithBalance(p, txs));
    return enriched.sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  getPartyById(shopId: string, partyId: string): Party | null {
    const parties = loadParties(shopId);
    const found = parties.find(p => p.id === partyId);
    if (!found) return null;
    const txs = loadTransactions(shopId);
    return enrichClientPartyWithBalance(found, txs);
  },

  checkDuplicateParty(shopId: string, phone: string, gstin?: string, excludePartyId?: string): DuplicatePartyCheckResult {
    const parties = loadParties(shopId);
    const cleanPhone = phone.replace(/\D/g, '').slice(-10);

    for (const p of parties) {
      if (excludePartyId && p.id === excludePartyId) continue;

      const pPhone = p.phone.replace(/\D/g, '').slice(-10);
      const pAlt = (p.additional_phones || []).map(num => num.replace(/\D/g, '').slice(-10));

      if (cleanPhone && (pPhone === cleanPhone || pAlt.includes(cleanPhone))) {
        return {
          isDuplicate: true,
          field: 'phone',
          existingParty: p,
          message: `A party named '${p.name}' is already registered with mobile number ${phone}.`
        };
      }

      if (gstin && p.gstin && p.gstin.trim().toUpperCase() === gstin.trim().toUpperCase()) {
        return {
          isDuplicate: true,
          field: 'gstin',
          existingParty: p,
          message: `A party named '${p.name}' is already registered with GSTIN ${gstin.toUpperCase()}.`
        };
      }
    }

    return { isDuplicate: false };
  },

  createParty(shopId: string, payload: CreatePartyPayload): Party {
    const parties = loadParties(shopId);
    const now = new Date().toISOString();
    const newParty: Party = {
      id: 'party-' + Date.now(),
      shop_id: shopId,
      name: payload.name.trim(),
      type: payload.type,
      owner_name: payload.owner_name.trim(),
      phone: payload.phone.replace(/\D/g, '').slice(-10),
      additional_phones: (payload.additional_phones || []).map(p => p.replace(/\D/g, '').slice(-10)).filter(Boolean),
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
    saveParties(shopId, parties);
    return newParty;
  },

  updateParty(shopId: string, partyId: string, payload: UpdatePartyPayload): Party {
    const parties = loadParties(shopId);
    const idx = parties.findIndex(p => p.id === partyId);
    if (idx === -1) throw new Error('Party not found');

    const cur = parties[idx];
    const now = new Date().toISOString();
    const updated: Party = {
      ...cur,
      name: payload.name !== undefined ? payload.name.trim() : cur.name,
      type: payload.type !== undefined ? payload.type : cur.type,
      owner_name: payload.owner_name !== undefined ? payload.owner_name.trim() : cur.owner_name,
      phone: payload.phone !== undefined ? payload.phone.replace(/\D/g, '').slice(-10) : cur.phone,
      additional_phones: payload.additional_phones !== undefined
        ? payload.additional_phones.map(p => p.replace(/\D/g, '').slice(-10)).filter(Boolean)
        : cur.additional_phones,
      gstin: payload.gstin !== undefined ? (payload.gstin ? payload.gstin.trim().toUpperCase() : null) : cur.gstin,
      address: payload.address !== undefined ? payload.address.trim() : cur.address,
      state: payload.state !== undefined ? payload.state.trim() : cur.state,
      state_code: payload.state_code !== undefined ? payload.state_code : cur.state_code,
      pin_code: payload.pin_code !== undefined ? payload.pin_code.trim() : cur.pin_code,
      notes: payload.notes !== undefined ? (payload.notes ? payload.notes.trim() : null) : cur.notes,
      updated_at: now
    };

    parties[idx] = updated;
    saveParties(shopId, parties);

    const txs = loadTransactions(shopId);
    return enrichClientPartyWithBalance(updated, txs);
  },

  // Phase 4: Mobile Swipe Ledger & Transaction Entries
  getLedgerTransactions(shopId: string, options?: LedgerFilterOptions): { transactions: Transaction[]; summary: LedgerSummary } {
    let txs = loadTransactions(shopId);
    const parties = loadParties(shopId);

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
  },

  createTransaction(shopId: string, payload: CreateTransactionPayload): Transaction {
    const txs = loadTransactions(shopId);
    const parties = loadParties(shopId);

    const party = parties.find(p => p.id === payload.party_id);
    if (!party) throw new Error('Party not found');

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
      id: 'tx-' + Date.now(),
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
          id: 'item-' + Date.now(),
          transaction_id: 'tx-' + Date.now(),
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

    txs.unshift(newTx);
    saveTransactions(shopId, txs);
    return newTx;
  },

  // Phase 5: History, Dues & Payments
  getHistory(shopId: string, options?: HistoryFilterOptions): { transactions: any[]; summary: HistorySummary; total: number } {
    const txs = loadTransactions(shopId);
    const payments = loadPayments(shopId);
    const returns = loadReturns(shopId);
    const parties = loadParties(shopId);

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
  },

  getTransactionHistoryDetails(shopId: string, transactionId: string): Transaction | null {
    const txs = loadTransactions(shopId);
    const t = txs.find(tx => tx.id === transactionId && tx.shop_id === shopId);
    if (!t) return null;

    const payments = loadPayments(shopId).filter(p => p.transaction_id === transactionId);
    const returns = loadReturns(shopId).filter(r => r.transaction_id === transactionId);

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
  },

  getDuesSummary(shopId: string): DuesSummary {
    const txs = loadTransactions(shopId);
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
  },

  getDues(shopId: string, options?: DuesFilterOptions): { dues: DueRecord[]; summary: DuesSummary; total: number } {
    const txs = loadTransactions(shopId);
    const parties = loadParties(shopId);

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

    const summary = this.getDuesSummary(shopId);

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
  },

  getDueById(shopId: string, transactionId: string): DueRecord | null {
    const { dues } = this.getDues(shopId, { status: 'ALL', view: 'ALL' });
    return dues.find(d => d.id === transactionId) || null;
  },

  recordPayment(shopId: string, payload: RecordPaymentPayload): { payment: PaymentRecord; transaction?: Transaction } {
    const parties = loadParties(shopId);
    const party = parties.find(p => p.id === payload.party_id && p.shop_id === shopId);
    if (!party) throw new Error('Party not found');

    if (payload.amount_rupees <= 0) {
      throw new Error('Payment amount must be greater than zero');
    }

    if (payload.payment_mode === 'CHEQUE' && !payload.cheque_number?.trim()) {
      throw new Error('Cheque number is required for Cheque payments');
    }

    const txs = loadTransactions(shopId);
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
      saveTransactions(shopId, txs);
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

    const shopPayments = loadPayments(shopId);
    shopPayments.unshift(newPayment);
    savePayments(shopId, shopPayments);

    return { payment: newPayment, transaction: tx };
  },

  recordReturn(shopId: string, payload: RecordReturnPayload): { returnRecord: ReturnRecord; transaction: Transaction } {
    if (payload.amount_rupees <= 0) {
      throw new Error('Return amount must be greater than zero');
    }

    const txs = loadTransactions(shopId);
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
    saveTransactions(shopId, txs);

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

    const shopReturns = loadReturns(shopId);
    shopReturns.unshift(returnRecord);
    saveReturns(shopId, shopReturns);

    return { returnRecord, transaction: tx };
  },

  // Phase 6: Reports & GST Analytics
  getPurchaseLedger(shopId: string, options?: ReportFilterOptions): PurchaseLedgerReport {
    const txs = loadTransactions(shopId);
    const parties = loadParties(shopId);
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
  },

  getSalesLedger(shopId: string, options?: ReportFilterOptions): SalesLedgerReport {
    const txs = loadTransactions(shopId);
    const parties = loadParties(shopId);
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
  },

  getJobWorkLedger(shopId: string, options?: ReportFilterOptions): ArtisanJobWorkReport {
    const txs = loadTransactions(shopId);
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
  },

  getGSTDashboard(shopId: string, options?: ReportFilterOptions): GSTDashboardData {
    const salesReport = this.getSalesLedger(shopId, options);
    const purchaseReport = this.getPurchaseLedger(shopId, options);

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
  },

  // Phase 7: Settings
  getShopSettings(shopId: string): ShopSettingsData {
    const shopData = this.getShopById(shopId);
    if (!shopData) throw new Error('Shop not found');
    const settings = loadSettings(shopId);
    return {
      shop: shopData.shop,
      invoice_settings: settings.invoice_settings,
      notification_settings: settings.notification_settings,
      app_preferences: settings.app_preferences
    };
  },

  updateShopProfile(shopId: string, payload: UpdateShopProfilePayload): Shop {
    const shopData = this.getShopById(shopId);
    if (!shopData) throw new Error('Shop not found');
    const shop = shopData.shop;

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

    const shops = this.getShops();
    const idx = shops.findIndex(s => s.id === shopId);
    if (idx >= 0) {
      shops[idx] = updated;
      localStorage.setItem(STORAGE_KEY_SHOPS, JSON.stringify(shops));
    }
    return updated;
  },

  updateGSTSettings(shopId: string, payload: UpdateGSTSettingsPayload): Shop {
    const shopData = this.getShopById(shopId);
    if (!shopData) throw new Error('Shop not found');
    const shop = shopData.shop;

    const updated: Shop = {
      ...shop,
      gstin: payload.gstin !== undefined ? payload.gstin.trim().toUpperCase() : shop.gstin,
      default_gst_bp: payload.default_gst_bp !== undefined ? payload.default_gst_bp : shop.default_gst_bp,
      state_code: payload.state_code !== undefined ? payload.state_code.trim() : shop.state_code,
      updated_at: new Date().toISOString()
    };

    const shops = this.getShops();
    const idx = shops.findIndex(s => s.id === shopId);
    if (idx >= 0) {
      shops[idx] = updated;
      localStorage.setItem(STORAGE_KEY_SHOPS, JSON.stringify(shops));
    }
    return updated;
  },

  updateInvoiceSettings(shopId: string, payload: Partial<InvoiceSettings>): InvoiceSettings {
    const current = loadSettings(shopId);
    current.invoice_settings = { ...current.invoice_settings, ...payload };
    saveSettings(shopId, current);
    return current.invoice_settings;
  },

  updateNotificationSettings(shopId: string, payload: Partial<NotificationSettings>): NotificationSettings {
    const current = loadSettings(shopId);
    current.notification_settings = { ...current.notification_settings, ...payload };
    saveSettings(shopId, current);
    return current.notification_settings;
  },

  updateAppPreferences(shopId: string, payload: Partial<AppPreferences>): AppPreferences {
    const current = loadSettings(shopId);
    current.app_preferences = { ...current.app_preferences, ...payload };
    saveSettings(shopId, current);
    return current.app_preferences;
  },

  exportShopData(shopId: string, dataType: 'transactions' | 'parties' | 'reports'): { filename: string; contentType: string; data: string } {
    const now = new Date().toISOString().split('T')[0];

    if (dataType === 'transactions') {
      const txs = loadTransactions(shopId);
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
      const parties = loadParties(shopId);
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

    const gstData = this.getGSTDashboard(shopId);
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
};
