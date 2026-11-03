import {
  Shop,
  ShopVerification,
  RegisterShopPayload,
  ResubmitShopPayload,
  User,
  Transaction,
  Party,
  DashboardSummary,
  DashboardCharts,
  DateRangeOption
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
  }
};
