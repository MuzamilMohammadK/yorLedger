import {
  Shop,
  ShopVerification,
  RegisterShopPayload,
  ResubmitShopPayload,
  User
} from '@yorbalance/shared';

const STORAGE_KEY_SHOPS = 'yorbalance_client_shops';
const STORAGE_KEY_VERIFICATIONS = 'yorbalance_client_verifications';

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
    status: 'PENDING',
    document_name: 'gst_certificate.jpg',
    document_url: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
    verified_by: null,
    verified_at: null,
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

    const user: User = {
      id: userId,
      shop_id: shopId,
      firebase_uid: userId,
      email: payload.email.toLowerCase(),
      role: 'OWNER',
      created_at: newShop.created_at
    };

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
    const existing = shops.find(s => s.id === id);
    if (!existing) throw new Error('Shop not found');

    const updatedShop: Shop = {
      ...existing,
      status: decision,
      verified_by: decision === 'APPROVED' ? adminId : null,
      verified_at: decision === 'APPROVED' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    };

    saveShops(shops.map(s => s.id === id ? updatedShop : s));

    const verification: ShopVerification = {
      id: 'ver-' + Date.now(),
      shop_id: id,
      submitted_details: { name: existing.name, gstin: existing.gstin },
      decision,
      reason: decision === 'REJECTED' ? (reason || null) : null,
      decided_by: adminId,
      decided_at: new Date().toISOString()
    };

    const vers = loadVerifications();
    saveVerifications([...vers, verification]);

    return { shop: updatedShop, verification };
  }
};
