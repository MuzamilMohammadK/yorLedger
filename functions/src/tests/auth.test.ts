import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { createApp } from '../app.js';
import { calculateGstinChecksum } from '@yorbalance/shared';

const SAMPLE_JPEG_DATA = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

describe('Shop Registration, Document Verification and Access Control', () => {
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

  it('POST /api/v1/auth/register-shop should reject if document is missing or not in JPEG/JPG format', async () => {
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
      default_gst_bp: 500,
      document_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' // PNG should be rejected
    };

    const res = await fetch(`${baseUrl}/api/v1/auth/register-shop`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer dev-owner-merchant.test@example.com'
      },
      body: JSON.stringify(payload)
    });

    assert.strictEqual(res.status, 400);
    const body = await res.json() as any;
    assert.strictEqual(body.code, 'VALIDATION_ERROR');
    assert.ok(body.fields?.document?.includes('JPEG') || body.fields?.document?.includes('JPG'));
  });

  it('POST /api/v1/auth/register-shop should register shop in PENDING status with valid JPEG document', async () => {
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
      default_gst_bp: 500,
      document_url: SAMPLE_JPEG_DATA,
      document_name: 'Shop_GST_Cert.jpg'
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
    assert.strictEqual(body.shop.document_name, 'Shop_GST_Cert.jpg');
    assert.ok(body.shop.document_url);
    assert.strictEqual(body.user.role, 'OWNER');
  });

  it('SECURITY: PENDING shop must be blocked from accessing protected ledger routes (403 Forbidden)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/ledger/overview`, {
      headers: {
        'Authorization': 'Bearer dev-owner-merchant.test@example.com'
      }
    });

    assert.strictEqual(res.status, 403);
    const body = await res.json() as any;
    assert.strictEqual(body.code, 'SHOP_NOT_APPROVED');
  });

  it('GET /api/v1/admin/shops?status=PENDING should return the shop and uploaded document for admin review', async () => {
    const res = await fetch(`${baseUrl}/api/v1/admin/shops?status=PENDING`, {
      headers: {
        'Authorization': 'Bearer dev-admin'
      }
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json() as any;
    assert.ok(Array.isArray(body.shops));
    const pendingShop = body.shops.find((s: any) => s.name === 'Test Kanchipuram Silks');
    assert.ok(pendingShop, 'Pending shop must be listed');
    assert.ok(pendingShop.document_url, 'Admin must receive uploaded document for inspection');
  });

  it('POST /api/v1/admin/shops/:id/decision should approve the shop and record admin audit details', async () => {
    // 1. Get the pending shop id
    const listRes = await fetch(`${baseUrl}/api/v1/admin/shops?status=PENDING`, {
      headers: { 'Authorization': 'Bearer dev-admin' }
    });
    const { shops } = await listRes.json() as any;
    const testShop = shops.find((s: any) => s.name === 'Test Kanchipuram Silks');
    assert.ok(testShop);

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
    assert.strictEqual(body.shop.verified_by, 'admin@yorbalance.com');
    assert.ok(body.shop.verified_at);
  });

  it('SECURITY: APPROVED shop owner is now granted access to protected ledger routes (200 OK)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/ledger/overview`, {
      headers: {
        'Authorization': 'Bearer dev-owner-merchant.test@example.com'
      }
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json() as any;
    assert.strictEqual(body.message, 'Approved merchant access verified');
    assert.strictEqual(body.shop.status, 'APPROVED');
  });
});
