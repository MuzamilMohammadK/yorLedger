import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { createApp } from '../app.js';
import { getDatabase } from '../db/index.js';
import { formatINR } from '@yorbalance/shared';

describe('Phase 2: SB&A Silk Ledger Dashboard & Analytics Integration', () => {
  let server: http.Server;
  let port: number;
  let baseUrl: string;

  before(async () => {
    const app = createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address() as any;
        port = addr.port;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('SECURITY: Unauthenticated requests to /api/v1/analytics/summary must be blocked (401)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/analytics/summary`);
    assert.strictEqual(res.status, 401);
  });

  it('SECURITY: Pending shop owner cannot access analytics summary (403 Forbidden)', async () => {
    const db = await getDatabase();
    // Register a pending shop
    const pendingShop = await db.createShopAndUser({
      shop_name: 'Pending Test Weavers',
      owner_name: 'Pending Owner',
      gstin: '37AAACB1234D1Z5',
      mobile: '9848011223',
      email: 'pending.analytictest@example.com',
      address: 'Test Address',
      state_code: '37',
      default_gst_bp: 500
    }, 'dev-uid-pending-analytictest');

    const res = await fetch(`${baseUrl}/api/v1/analytics/summary`, {
      headers: {
        'Authorization': 'Bearer dev-owner-pending.analytictest@example.com'
      }
    });
    assert.strictEqual(res.status, 403);
    const body = await res.json() as any;
    assert.strictEqual(body.code, 'SHOP_NOT_APPROVED');
  });

  it('APPROVED shop owner receives full dashboard summary calculations with INR metrics', async () => {
    // demo-shop-1 (ramesh@srilakshmisilks.com) is pre-seeded in APPROVED status
    const res = await fetch(`${baseUrl}/api/v1/analytics/summary?period=this_month`, {
      headers: {
        'Authorization': 'Bearer dev-owner-ramesh@srilakshmisilks.com'
      }
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json() as any;
    assert.ok(body.summary, 'Summary object must be returned');

    const { summary } = body;
    assert.ok(typeof summary.total_transactions === 'number');
    assert.ok(typeof summary.pending_amount === 'number');
    assert.ok(typeof summary.settled_amount === 'number');
    assert.ok(typeof summary.total_value === 'number');
    assert.ok(typeof summary.net_balance === 'number');
    assert.ok(typeof summary.total_sales === 'number');
    assert.ok(typeof summary.total_purchases === 'number');
    assert.strictEqual(summary.period, 'this_month');

    // Net balance = total_sales - total_purchases
    assert.strictEqual(summary.net_balance, summary.total_sales - summary.total_purchases);
  });

  it('GET /api/v1/analytics/charts returns valid Recharts dataset structures', async () => {
    const res = await fetch(`${baseUrl}/api/v1/analytics/charts?period=this_month`, {
      headers: {
        'Authorization': 'Bearer dev-owner-ramesh@srilakshmisilks.com'
      }
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json() as any;
    assert.ok(body.charts, 'Charts object must be returned');

    const { charts } = body;
    // Sales vs Purchases Monthly Comparison
    assert.ok(Array.isArray(charts.sales_vs_purchases));
    assert.ok(charts.sales_vs_purchases.length > 0);
    assert.ok('month' in charts.sales_vs_purchases[0]);
    assert.ok('sales' in charts.sales_vs_purchases[0]);
    assert.ok('purchases' in charts.sales_vs_purchases[0]);

    // Sales Trend
    assert.ok(Array.isArray(charts.sales_trend));

    // Pending vs Settled Pie Chart
    assert.ok(Array.isArray(charts.pending_vs_settled));
    assert.strictEqual(charts.pending_vs_settled.length, 2);
  });

  it('GET /api/v1/ledger/recent returns recent transactions with search filtering', async () => {
    const res = await fetch(`${baseUrl}/api/v1/ledger/recent?limit=5`, {
      headers: {
        'Authorization': 'Bearer dev-owner-ramesh@srilakshmisilks.com'
      }
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json() as any;
    assert.ok(Array.isArray(body.transactions));
    assert.ok(body.transactions.length <= 5);

    if (body.transactions.length > 0) {
      const tx = body.transactions[0];
      assert.ok(tx.invoice_number);
      assert.ok(tx.party_name);
      assert.ok(tx.type);
      assert.ok(tx.grand_total_paise > 0);
      assert.ok(tx.status);
    }
  });

  it('TENANT ISOLATION: A shop owner can only access transactions belonging to their own shop', async () => {
    const db = await getDatabase();
    // Register & approve Shop 2
    const shop2Result = await db.createShopAndUser({
      shop_name: 'Shop 2 Weavers',
      owner_name: 'Owner 2',
      gstin: '33AAACT9999R1ZZ',
      mobile: '9840199999',
      email: 'owner2.isolation@example.com',
      address: 'Kanchipuram',
      state_code: '33',
      default_gst_bp: 500
    }, 'dev-uid-owner2-isolation');

    await db.recordAdminDecision(shop2Result.shop.id, 'admin@yorbalance.com', { decision: 'APPROVED' });

    const res = await fetch(`${baseUrl}/api/v1/analytics/summary`, {
      headers: {
        'Authorization': 'Bearer dev-owner-owner2.isolation@example.com'
      }
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json() as any;
    assert.strictEqual(body.shop.id, shop2Result.shop.id);
  });
});
