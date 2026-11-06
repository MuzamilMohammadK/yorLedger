import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { createApp } from '../app.js';
import { getDatabase } from '../db/index.js';

describe('Phase 5: History and Dues Modules Integration Tests', () => {
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

  const approvedHeaders = {
    'Content-Type': 'application/json',
    Authorization: 'Bearer dev-owner-ramesh@srilakshmisilks.com'
  };

  it('SECURITY: Unauthenticated requests to /api/v1/history and /api/v1/dues are rejected with 401', async () => {
    const historyRes = await fetch(`${baseUrl}/api/v1/history`);
    assert.strictEqual(historyRes.status, 401);

    const duesRes = await fetch(`${baseUrl}/api/v1/dues`);
    assert.strictEqual(duesRes.status, 401);

    const duesSummaryRes = await fetch(`${baseUrl}/api/v1/dues/summary`);
    assert.strictEqual(duesSummaryRes.status, 401);
  });

  it('SECURITY: Pending shop owner cannot access history or dues (403 Forbidden)', async () => {
    const db = await getDatabase();
    await db.createShopAndUser({
      shop_name: 'Pending Silk House',
      owner_name: 'S. Pending',
      gstin: '37BBBBB8888B1Z2',
      mobile: '9848099333',
      email: 'pending-dues-owner@srilakshmi.com',
      address: 'Main Bazaar, Hindupur',
      state_code: '37',
      default_gst_bp: 500,
      document_name: 'reg.jpg',
      document_mime_type: 'image/jpeg',
      document_base64: 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='
    }, 'dev-uid-pending-dues-owner@srilakshmi.com');

    const headers = {
      'Content-Type': 'application/json',
      Authorization: 'Bearer dev-owner-pending-dues-owner@srilakshmi.com'
    };

    const res1 = await fetch(`${baseUrl}/api/v1/history`, { headers });
    assert.strictEqual(res1.status, 403);

    const res2 = await fetch(`${baseUrl}/api/v1/dues`, { headers });
    assert.strictEqual(res2.status, 403);
  });

  it('HISTORY: Fetch history returns summary metrics without double-counting', async () => {
    const res = await fetch(`${baseUrl}/api/v1/history`, { headers: approvedHeaders });
    assert.strictEqual(res.status, 200);

    const data = await res.json() as any;
    assert.ok(data.summary, 'Summary should be present');
    assert.ok(data.summary.total_sales > 0, 'Total sales should be > 0');
    assert.ok(data.summary.total_purchases > 0, 'Total purchases should be > 0');
    assert.ok(data.summary.total_payments > 0, 'Total payments should be > 0');
    assert.ok(Array.isArray(data.transactions), 'Transactions array should be present');
    assert.ok(data.transactions.length > 0, 'Should have transactions');
  });

  it('HISTORY: Filter history by transaction type and search', async () => {
    const saleRes = await fetch(`${baseUrl}/api/v1/history?type=SALE`, { headers: approvedHeaders });
    assert.strictEqual(saleRes.status, 200);
    const saleData = await saleRes.json() as any;
    assert.ok(saleData.transactions.every((t: any) => t.type === 'SALE'));

    const searchRes = await fetch(`${baseUrl}/api/v1/history?search=Meenakshi`, { headers: approvedHeaders });
    assert.strictEqual(searchRes.status, 200);
    const searchData = await searchRes.json() as any;
    assert.ok(searchData.transactions.length > 0);
    assert.ok(searchData.transactions.every((t: any) => t.party_name.toLowerCase().includes('meenakshi')));
  });

  it('HISTORY: Detailed transaction item breakdown and history', async () => {
    const historyRes = await fetch(`${baseUrl}/api/v1/history?type=SALE`, { headers: approvedHeaders });
    const historyData = await historyRes.json() as any;
    const firstTx = historyData.transactions[0];

    const detailRes = await fetch(`${baseUrl}/api/v1/history/${firstTx.id}`, { headers: approvedHeaders });
    assert.strictEqual(detailRes.status, 200);
    const detailData = await detailRes.json() as any;
    assert.ok(detailData.transaction);
    assert.strictEqual(detailData.transaction.id, firstTx.id);
    assert.ok(Array.isArray(detailData.transaction.items));
  });

  it('DUES: Summary returns receivable, payable, overdue amounts', async () => {
    const res = await fetch(`${baseUrl}/api/v1/dues/summary`, { headers: approvedHeaders });
    assert.strictEqual(res.status, 200);
    const data = await res.json() as any;
    assert.ok(data.summary);
    assert.ok(typeof data.summary.total_receivable === 'number');
    assert.ok(typeof data.summary.total_payable === 'number');
    assert.ok(typeof data.summary.overdue_receivable === 'number');
    assert.ok(typeof data.summary.overdue_payable === 'number');
  });

  it('DUES: View filter separates receivables and payables accurately', async () => {
    const recRes = await fetch(`${baseUrl}/api/v1/dues?view=RECEIVABLE`, { headers: approvedHeaders });
    assert.strictEqual(recRes.status, 200);
    const recData = await recRes.json() as any;
    assert.ok(recData.dues.every((d: any) => d.party_type === 'CUSTOMER' || d.type === 'SALE'));

    const payRes = await fetch(`${baseUrl}/api/v1/dues?view=PAYABLE`, { headers: approvedHeaders });
    assert.strictEqual(payRes.status, 200);
    const payData = await payRes.json() as any;
    assert.ok(payData.dues.every((d: any) => d.party_type !== 'CUSTOMER' || d.type === 'PURCHASE' || d.type === 'JOB_WORK'));
  });

  it('PAYMENTS & FINANCIAL RULES: Record payment updates remaining due and transaction status', async () => {
    // 1. Get a pending or partial due
    const duesRes = await fetch(`${baseUrl}/api/v1/dues?view=RECEIVABLE`, { headers: approvedHeaders });
    const duesData = await duesRes.json() as any;
    const targetDue = duesData.dues.find((d: any) => d.remaining_due > 1000);
    assert.ok(targetDue, 'Must have a due with remaining balance > 1000');

    const paymentAmount = 500;
    const initialDue = targetDue.remaining_due;

    // 2. Record partial payment
    const payRes = await fetch(`${baseUrl}/api/v1/payments`, {
      method: 'POST',
      headers: approvedHeaders,
      body: JSON.stringify({
        party_id: targetDue.party_id,
        transaction_id: targetDue.id,
        amount_rupees: paymentAmount,
        payment_mode: 'NEFT',
        reference_number: 'UTR9988776655',
        notes: 'Partial payment test'
      })
    });

    assert.strictEqual(payRes.status, 201);
    const payResult = await payRes.json() as any;
    assert.ok(payResult.payment);
    assert.strictEqual(payResult.payment.amount_rupees, paymentAmount);

    // 3. Verify remaining due on transaction
    const updatedTxRes = await fetch(`${baseUrl}/api/v1/dues/${targetDue.id}`, { headers: approvedHeaders });
    assert.strictEqual(updatedTxRes.status, 200);
    const updatedDue = (await updatedTxRes.json() as any).due;
    assert.strictEqual(updatedDue.remaining_due, initialDue - paymentAmount, 'Remaining due must match Remaining Due = Bill Total - Returns - Payments');

    // 4. Record payment exceeding remaining balance -> must be rejected
    const excessPayRes = await fetch(`${baseUrl}/api/v1/payments`, {
      method: 'POST',
      headers: approvedHeaders,
      body: JSON.stringify({
        party_id: targetDue.party_id,
        transaction_id: targetDue.id,
        amount_rupees: updatedDue.remaining_due + 10000,
        payment_mode: 'CASH'
      })
    });
    assert.strictEqual(excessPayRes.status, 400);

    // 5. Record settlement payment
    const settleRes = await fetch(`${baseUrl}/api/v1/payments`, {
      method: 'POST',
      headers: approvedHeaders,
      body: JSON.stringify({
        party_id: targetDue.party_id,
        transaction_id: targetDue.id,
        amount_rupees: updatedDue.remaining_due,
        payment_mode: 'CASH',
        notes: 'Full settlement'
      })
    });
    assert.strictEqual(settleRes.status, 201);

    const finalTxRes = await fetch(`${baseUrl}/api/v1/dues/${targetDue.id}`, { headers: approvedHeaders });
    const finalDue = (await finalTxRes.json() as any).due;
    assert.strictEqual(finalDue.remaining_due, 0);
    assert.strictEqual(finalDue.status, 'SETTLED');
  });

  it('RETURNS: Record return on invoice reduces remaining balance', async () => {
    // Create a new transaction to test returns
    const createTxRes = await fetch(`${baseUrl}/api/v1/ledger/transactions`, {
      method: 'POST',
      headers: approvedHeaders,
      body: JSON.stringify({
        party_id: 'party-cust-1-demo-shop-1',
        type: 'SALE',
        amount_rupees: 10000,
        paid_rupees: 0
      })
    });
    assert.strictEqual(createTxRes.status, 201);
    const newTx = (await createTxRes.json() as any).transaction;

    // Record return of ₹2,000
    const returnRes = await fetch(`${baseUrl}/api/v1/payments/returns`, {
      method: 'POST',
      headers: approvedHeaders,
      body: JSON.stringify({
        transaction_id: newTx.id,
        amount_rupees: 2000,
        reason: 'Slight defect in border jari'
      })
    });
    assert.strictEqual(returnRes.status, 201);
    const returnResult = await returnRes.json() as any;
    assert.ok(returnResult.return);
    assert.strictEqual(returnResult.return.amount_rupees, 2000);

    // Check remaining due
    const dueRes = await fetch(`${baseUrl}/api/v1/dues/${newTx.id}`, { headers: approvedHeaders });
    const due = (await dueRes.json() as any).due;
    assert.strictEqual(due.returns, 2000);
    assert.strictEqual(due.remaining_due, 8000, 'Remaining Due = 10,000 - 2,000 returns - 0 payments = 8,000');
  });
});

