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

  it('GET /api/v1/ledger/transactions returns filtered transactions and accurate ledger summary', async () => {
    const res = await fetch(`${baseUrl}/api/v1/ledger/transactions`, {
      headers: {
        'Authorization': 'Bearer dev-owner-ramesh@srilakshmisilks.com'
      }
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json() as any;
    assert.ok(Array.isArray(body.transactions));
    assert.ok(body.summary);
    assert.ok(typeof body.summary.total_receivable === 'number');
    assert.ok(typeof body.summary.total_payable === 'number');
    assert.ok(typeof body.summary.total_transactions === 'number');
    assert.strictEqual(body.summary.total_transactions, body.transactions.length);

    // Filter by type = SALE
    const saleRes = await fetch(`${baseUrl}/api/v1/ledger/transactions?type=SALE`, {
      headers: {
        'Authorization': 'Bearer dev-owner-ramesh@srilakshmisilks.com'
      }
    });
    assert.strictEqual(saleRes.status, 200);
    const saleBody = await saleRes.json() as any;
    assert.ok(saleBody.transactions.every((t: any) => t.type === 'SALE'));
  });

  it('POST /api/v1/ledger/transactions creates a valid transaction with tax split', async () => {
    // 1. Get parties to find a party ID
    const partiesRes = await fetch(`${baseUrl}/api/v1/parties`, {
      headers: {
        'Authorization': 'Bearer dev-owner-ramesh@srilakshmisilks.com'
      }
    });
    const partiesBody = await partiesRes.json() as any;
    const testParty = partiesBody.parties[0];

    // 2. Post a new transaction
    const postRes = await fetch(`${baseUrl}/api/v1/ledger/transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer dev-owner-ramesh@srilakshmisilks.com'
      },
      body: JSON.stringify({
        party_id: testParty.id,
        type: 'SALE',
        amount_rupees: 50000,
        paid_rupees: 20000,
        item_name: 'Pure Kanchipuram Silk Bridal Saree',
        notes: 'Wedding bulk order discount'
      })
    });

    assert.strictEqual(postRes.status, 201);
    const postBody = await postRes.json() as any;
    assert.ok(postBody.transaction.id);
    assert.strictEqual(postBody.transaction.grand_total_paise, 5000000);
    assert.strictEqual(postBody.transaction.paid_paise, 2000000);
    assert.strictEqual(postBody.transaction.pending_paise, 3000000);
    assert.strictEqual(postBody.transaction.status, 'PARTIAL');
    assert.strictEqual(postBody.transaction.party_name, testParty.name);
  });
});
