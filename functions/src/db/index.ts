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
  DateRangeOption
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
}

// In-Memory Fallback Store for quick testing / development when Postgres is offline
class MemoryStore implements DatabaseService {
  private shops: Map<string, Shop> = new Map();
  private users: Map<string, User> = new Map();
  private verifications: ShopVerification[] = [];
  private parties: Map<string, Party[]> = new Map();
  private transactions: Map<string, Transaction[]> = new Map();

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
