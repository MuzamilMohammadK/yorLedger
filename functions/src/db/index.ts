import pg from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { Shop, User, ShopVerification, RegisterShopPayload, AdminDecisionPayload, ResubmitShopPayload } from '@yorbalance/shared';

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
}

// In-Memory Fallback Store for quick testing / development when Postgres is offline
class MemoryStore implements DatabaseService {
  private shops: Map<string, Shop> = new Map();
  private users: Map<string, User> = new Map();
  private verifications: ShopVerification[] = [];

  constructor() {
    // Seed default admin for testing
    const adminUser: User = {
      id: uuidv4(),
      shop_id: null,
      firebase_uid: 'admin-dev-uid',
      email: 'admin@yorbalance.com',
      role: 'ADMIN',
      created_at: new Date().toISOString()
    };
    this.users.set(adminUser.id, adminUser);
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

    return { shop, user };
  }

  async resubmitShopDetails(shopId: string, payload: ResubmitShopPayload): Promise<Shop> {
    const shop = this.shops.get(shopId);
    if (!shop) throw new Error('Shop not found');

    const now = new Date().toISOString();
    const updated: Shop = {
      ...shop,
      name: payload.shop_name ?? shop.name,
      owner_name: payload.owner_name ?? shop.owner_name,
      gstin: payload.gstin ? payload.gstin.toUpperCase() : shop.gstin,
      phone: payload.mobile ?? shop.phone,
      address: payload.address ?? shop.address,
      state_code: payload.state_code ?? shop.state_code,
      default_gst_bp: payload.default_gst_bp ?? shop.default_gst_bp,
      status: 'PENDING',
      updated_at: now
    };

    this.shops.set(shopId, updated);
    return { ...updated };
  }

  async getPendingShops(): Promise<Shop[]> {
    return Array.from(this.shops.values()).filter(s => s.status === 'PENDING');
  }

  async getAllShops(statusFilter?: string): Promise<Shop[]> {
    const list = Array.from(this.shops.values());
    if (statusFilter) {
      return list.filter(s => s.status === statusFilter);
    }
    return list;
  }

  async getLatestVerification(shopId: string): Promise<ShopVerification | null> {
    const records = this.verifications
      .filter(v => v.shop_id === shopId)
      .sort((a, b) => new Date(b.decided_at).getTime() - new Date(a.decided_at).getTime());
    return records.length > 0 ? { ...records[0] } : null;
  }

  async recordAdminDecision(shopId: string, adminEmail: string, decision: AdminDecisionPayload): Promise<{ shop: Shop; verification: ShopVerification }> {
    const shop = this.shops.get(shopId);
    if (!shop) throw new Error('Shop not found');

    const now = new Date().toISOString();
    shop.status = decision.decision;
    shop.verified_at = now;
    shop.verified_by = adminEmail;
    shop.updated_at = now;

    const verification: ShopVerification = {
      id: uuidv4(),
      shop_id: shopId,
      submitted_details: { ...shop },
      decision: decision.decision,
      reason: decision.reason || null,
      decided_by: adminEmail,
      decided_at: now
    };

    this.verifications.push(verification);
    return { shop: { ...shop }, verification };
  }

  async seedAdminUser(email: string, firebaseUid: string): Promise<User> {
    let existing = await this.findUserByEmail(email);
    if (existing) {
      existing.firebase_uid = firebaseUid;
      existing.role = 'ADMIN';
      return existing;
    }
    const user: User = {
      id: uuidv4(),
      shop_id: null,
      firebase_uid: firebaseUid,
      email,
      role: 'ADMIN',
      created_at: new Date().toISOString()
    };
    this.users.set(user.id, user);
    return user;
  }
}

// PostgreSQL Implementation
class PostgresStore implements DatabaseService {
  private pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.pool = pool;
  }

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
      const shopRes = await client.query(
        `INSERT INTO shops (gstin, name, owner_name, phone, email, address, state_code, status, default_gst_bp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING', $8)
         RETURNING *`,
        [
          payload.gstin.toUpperCase(),
          payload.shop_name,
          payload.owner_name,
          payload.mobile,
          payload.email,
          payload.address,
          payload.state_code,
          payload.default_gst_bp || 500
        ]
      );
      const shop = shopRes.rows[0];

      const userRes = await client.query(
        `INSERT INTO users (shop_id, firebase_uid, email, role)
         VALUES ($1, $2, $3, 'OWNER')
         RETURNING *`,
        [shop.id, firebaseUid, payload.email]
      );
      const user = userRes.rows[0];

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
          status = 'PENDING',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $8
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
      // Test connectivity
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

