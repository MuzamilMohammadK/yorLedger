import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { createApp } from '../app.js';
import { calculateGstinChecksum } from '@yorbalance/shared';

describe('Shop Registration and Admin Approval API Flow', () => {
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

  it('GET /health should return 200 OK', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.strictEqual(res.status, 200);
    const body = await res.json() as any;
    assert.strictEqual(body.status, 'ok');
  });

  it('POST /api/v1/auth/register-shop should reject unauthenticated requests', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/register-shop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.strictEqual(res.status, 401);
  });

  it('POST /api/v1/auth/register-shop should validate input fields and register shop with PENDING status', async () => {
    const first14 = '29ABCDE1234F1Z';
    const checksum = calculateGstinChecksum(first14);
    const validGstin = `${first14}${checksum}`;

    const payload = {
      shop_name: 'Test Kanchipuram Silks',
      owner_name: 'Test Merchant',
      gstin: validGstin,
      mobile: '9845112233',
      email: 'merchant.test@example.com',
      address: 'Test Market, Avenue Rd, Bangalore',
      state_code: '29',
      default_gst_bp: 500
    };

    const res = await fetch(`${baseUrl}/api/v1/auth/register-shop`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer dev-owner-merchant.test@example.com'
      },
      body: JSON.stringify(payload)
    });

    assert.strictEqual(res.status, 201);
    const body = await res.json() as any;
    assert.strictEqual(body.shop.status, 'PENDING');
    assert.strictEqual(body.shop.gstin, validGstin);
    assert.strictEqual(body.shop.name, 'Test Kanchipuram Silks');
    assert.strictEqual(body.user.role, 'OWNER');
  });

  it('GET /api/v1/admin/shops?status=PENDING should return the registered shop for admin review', async () => {
    const res = await fetch(`${baseUrl}/api/v1/admin/shops?status=PENDING`, {
      headers: {
        'Authorization': 'Bearer dev-admin'
      }
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json() as any;
    assert.ok(Array.isArray(body.shops));
    assert.ok(body.shops.some((s: any) => s.name === 'Test Kanchipuram Silks'));
  });

  it('POST /api/v1/admin/shops/:id/decision should approve the shop', async () => {
    // 1. Get the pending shop id
    const listRes = await fetch(`${baseUrl}/api/v1/admin/shops?status=PENDING`, {
      headers: { 'Authorization': 'Bearer dev-admin' }
    });
    const { shops } = await listRes.json() as any;
    const testShop = shops.find((s: any) => s.name === 'Test Kanchipuram Silks');
    assert.ok(testShop, 'Test shop must be in pending list');

    // 2. Approve
    const decisionRes = await fetch(`${baseUrl}/api/v1/admin/shops/${testShop.id}/decision`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer dev-admin'
      },
      body: JSON.stringify({
        decision: 'APPROVED'
      })
    });

    assert.strictEqual(decisionRes.status, 200);
    const body = await decisionRes.json() as any;
    assert.strictEqual(body.shop.status, 'APPROVED');
    assert.strictEqual(body.verification.decision, 'APPROVED');
  });
});

