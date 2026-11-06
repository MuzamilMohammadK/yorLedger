import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { createApp } from '../app.js';
import { getDatabase } from '../db/index.js';

describe('Phase 3: Party Management Module Integration Tests', () => {
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

  const devShopApprovedHeaders = {
    'Content-Type': 'application/json',
    Authorization: 'Bearer dev-owner-ramesh@srilakshmisilks.com'
  };

  it('SECURITY: Unauthenticated requests to /api/v1/parties must be blocked (401)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/parties`);
    assert.strictEqual(res.status, 401);
  });

  it('SECURITY: Pending shop owner cannot access parties module (403 Forbidden)', async () => {
    const db = await getDatabase();
    // Register a pending shop
    await db.createShopAndUser({
      shop_name: 'Pending Weaving Co',
      owner_name: 'K. Pending',
      gstin: '37AAAAA9999A1Z1',
      mobile: '9848099112',
      email: 'pending-party-owner@srilakshmi.com',
      address: 'Near Clock Tower, Dharmavaram',
      state_code: '37',
      default_gst_bp: 500,
      document_name: 'sample.jpg',
      document_url: 'data:image/jpeg;base64,1234'
    }, 'dev-uid-pending-party-owner@srilakshmi.com');

    const res = await fetch(`${baseUrl}/api/v1/parties`, {
      headers: {
        Authorization: 'Bearer dev-owner-pending-party-owner@srilakshmi.com'
      }
    });

    assert.strictEqual(res.status, 403);
    const body = await res.json() as any;
    assert.strictEqual(body.code, 'SHOP_NOT_APPROVED');
  });

  it('APPROVED shop owner can list parties with balance calculation and filtering', async () => {
    const res = await fetch(`${baseUrl}/api/v1/parties`, {
      headers: devShopApprovedHeaders
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json() as any;
    assert.ok(Array.isArray(body.parties));
    assert.ok(body.parties.length > 0);

    const first = body.parties[0];
    assert.ok(first.name);
    assert.ok(first.phone);
    assert.ok(first.type);
    assert.ok('current_balance' in first);
    assert.ok('balance_type' in first);

    // Test filtering by Party Type = CUSTOMER
    const custRes = await fetch(`${baseUrl}/api/v1/parties?type=CUSTOMER`, {
      headers: devShopApprovedHeaders
    });
    assert.strictEqual(custRes.status, 200);
    const custBody = await custRes.json() as any;
    assert.ok(custBody.parties.every((p: any) => p.type === 'CUSTOMER'));

    // Test Search by name
    const searchRes = await fetch(`${baseUrl}/api/v1/parties?search=Meenakshi`, {
      headers: devShopApprovedHeaders
    });
    assert.strictEqual(searchRes.status, 200);
    const searchBody = await searchRes.json() as any;
    assert.ok(searchBody.parties.some((p: any) => p.name.includes('Meenakshi')));
  });

  it('POST /api/v1/parties should reject empty required fields and invalid formats', async () => {
    // Missing required fields
    const emptyRes = await fetch(`${baseUrl}/api/v1/parties`, {
      method: 'POST',
      headers: devShopApprovedHeaders,
      body: JSON.stringify({})
    });

    assert.strictEqual(emptyRes.status, 400);
    const emptyBody = await emptyRes.json() as any;
    assert.strictEqual(emptyBody.code, 'VALIDATION_FAILED');
    assert.ok(emptyBody.fields.name);
    assert.ok(emptyBody.fields.owner_name);
    assert.ok(emptyBody.fields.phone);
    assert.ok(emptyBody.fields.address);
    assert.ok(emptyBody.fields.state);
    assert.ok(emptyBody.fields.pin_code);

    // Invalid mobile and PIN
    const invalidRes = await fetch(`${baseUrl}/api/v1/parties`, {
      method: 'POST',
      headers: devShopApprovedHeaders,
      body: JSON.stringify({
        name: 'Invalid Test Store',
        owner_name: 'Test Person',
        type: 'CUSTOMER',
        phone: '12345', // invalid
        pin_code: 'abcde', // invalid
        address: '123 Test Street',
        state: 'Karnataka'
      })
    });

    assert.strictEqual(invalidRes.status, 400);
    const invalidBody = await invalidRes.json() as any;
    assert.ok(invalidBody.fields.phone);
    assert.ok(invalidBody.fields.pin_code);
  });

  it('POST /api/v1/parties should successfully register a party with dynamic additional mobile numbers', async () => {
    const res = await fetch(`${baseUrl}/api/v1/parties`, {
      method: 'POST',
      headers: devShopApprovedHeaders,
      body: JSON.stringify({
        name: 'Venkateswara Silks & Sarees',
        owner_name: 'Venkatesh Prasad',
        type: 'CUSTOMER',
        phone: '9845012345',
        additional_phones: ['9845012346', '9845012347'],
        gstin: '29AAAAA0000A1Z5',
        address: 'MG Road, Gandhi Square',
        state: 'Karnataka',
        pin_code: '570001',
        notes: 'Premium silk bridal wear purchaser'
      })
    });

    assert.strictEqual(res.status, 201);
    const body = await res.json() as any;
    assert.ok(body.party.id);
    assert.strictEqual(body.party.name, 'Venkateswara Silks & Sarees');
    assert.strictEqual(body.party.phone, '9845012345');
    assert.strictEqual(body.party.additional_phones.length, 2);
    assert.strictEqual(body.party.current_balance, 0);
  });

  it('POST /api/v1/parties/check-duplicate should identify duplicate mobile and GSTIN', async () => {
    // Duplicate phone check
    const phoneRes = await fetch(`${baseUrl}/api/v1/parties/check-duplicate`, {
      method: 'POST',
      headers: devShopApprovedHeaders,
      body: JSON.stringify({ phone: '9845012345' })
    });

    assert.strictEqual(phoneRes.status, 200);
    const phoneBody = await phoneRes.json() as any;
    assert.strictEqual(phoneBody.isDuplicate, true);
    assert.strictEqual(phoneBody.field, 'phone');
    assert.ok(phoneBody.existingParty);

    // Non-duplicate check
    const freshRes = await fetch(`${baseUrl}/api/v1/parties/check-duplicate`, {
      method: 'POST',
      headers: devShopApprovedHeaders,
      body: JSON.stringify({ phone: '9999988888', gstin: '37AAAAA0000A1Z7' })
    });

    assert.strictEqual(freshRes.status, 200);
    const freshBody = await freshRes.json() as any;
    assert.strictEqual(freshBody.isDuplicate, false);
  });

  it('PATCH /api/v1/parties/:id should update party details with validation', async () => {
    // 1. Fetch parties
    const listRes = await fetch(`${baseUrl}/api/v1/parties`, {
      headers: devShopApprovedHeaders
    });
    const listBody = await listRes.json() as any;
    const targetParty = listBody.parties[0];

    // 2. Update address & notes
    const updateRes = await fetch(`${baseUrl}/api/v1/parties/${targetParty.id}`, {
      method: 'PATCH',
      headers: devShopApprovedHeaders,
      body: JSON.stringify({
        address: 'Updated Main Silk Street, Suite 404',
        notes: 'Updated priority VIP account notes'
      })
    });

    assert.strictEqual(updateRes.status, 200);
    const updateBody = await updateRes.json() as any;
    assert.strictEqual(updateBody.party.address, 'Updated Main Silk Street, Suite 404');
    assert.strictEqual(updateBody.party.notes, 'Updated priority VIP account notes');
  });

  it('TENANT ISOLATION: A shop cannot view or edit parties of another shop', async () => {
    const db = await getDatabase();
    // Register shop 2
    const shop2 = await db.createShopAndUser({
      shop_name: 'Shop 2 Kanchipuram Sarees',
      owner_name: 'R. Kanchi',
      gstin: '33BBBBB0000B1Z4',
      mobile: '9840998877',
      email: 'owner2@kanchi.com',
      address: 'Temple Road, Kanchipuram',
      state_code: '33',
      default_gst_bp: 500,
      document_name: 'doc.jpg',
      document_url: 'data:image/jpeg;base64,1234'
    }, 'dev-uid-owner2@kanchi.com');

    // Approve shop 2
    await db.recordAdminDecision(shop2.shop.id, 'admin@yorbalance.com', { decision: 'APPROVED' });

    const shop2Headers = {
      'Content-Type': 'application/json',
      Authorization: 'Bearer dev-owner-owner2@kanchi.com'
    };

    // Create party in shop 2
    const p2Res = await fetch(`${baseUrl}/api/v1/parties`, {
      method: 'POST',
      headers: shop2Headers,
      body: JSON.stringify({
        name: 'Private Client of Shop 2',
        owner_name: 'Private Client',
        type: 'CUSTOMER',
        phone: '9123456789',
        address: 'Chennai High Road',
        state: 'Tamil Nadu',
        pin_code: '600001'
      })
    });
    const p2Body = await p2Res.json() as any;
    const p2Id = p2Body.party.id;

    // Try to access shop 2 party using shop 1 credentials
    const unauthorizedAccessRes = await fetch(`${baseUrl}/api/v1/parties/${p2Id}`, {
      headers: devShopApprovedHeaders
    });
    assert.strictEqual(unauthorizedAccessRes.status, 404);

    // Try to modify shop 2 party using shop 1 credentials
    const unauthorizedPatchRes = await fetch(`${baseUrl}/api/v1/parties/${p2Id}`, {
      method: 'PATCH',
      headers: devShopApprovedHeaders,
      body: JSON.stringify({ name: 'Hacked Name' })
    });
    assert.strictEqual(unauthorizedPatchRes.status, 404);
  });
});
