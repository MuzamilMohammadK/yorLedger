// §19.2 integration tests for the Firestore security rules (our backend on the Spark plan).
// Run with the emulator:  npm run test:rules
// Writes mirror exactly what web/src/lib/data/*.ts writes.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';

let env;
const A = 'owner-a', B = 'owner-b', P = 'owner-pending', ADMIN = 'admin-1';
const now = '2026-11-11';

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-yorledger',
    firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 }
  });
});
after(async () => { await env?.cleanup(); });

const shop = (owner, status = 'APPROVED') => ({
  owner_uid: owner, gstin: '37AAACH7409R1Z0', name: `Shop ${owner}`, owner_name: 'O', phone: '9848022338', email: 'o@x.in',
  address: 'a', state_code: '37', status, default_gst_bp: 500, created_at: now, updated_at: now
});
const party = { name: 'Customer', type: 'CUSTOMER', owner_name: 'C', phone: '9000000001', state_code: '37', created_at: now };
const bill = (kind, invoice_no, extra = {}) => ({
  kind, party_id: 'p1', party_name: 'Customer', party_type: 'CUSTOMER', invoice_no, bill_date: now, gst_bp: 500, tax_mode: 'INTRA',
  items: [{ name: 'Saree', qty: 2, rate: 100000, line_total: 200000 }], subtotal: 200000, cgst: 5000, sgst: 5000, igst: 0,
  grand_total: 210000, paid_total: 0, returned_total: 0, returned_qty: {}, amount_due: 210000, status: 'PENDING',
  remind_on: null, remind_lead_days: null, notes: null, source: 'MANUAL', created_at: now, updated_at: now, ...extra
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await db.doc('shops/sA').set(shop(A));
    await db.doc('shops/sB').set(shop(B));
    await db.doc('shops/sP').set(shop(P, 'PENDING'));
    await db.doc('shops/sA/parties/p1').set(party);
    await db.doc('shops/sB/parties/p1').set(party);
    await db.doc('shops/sA/bills/b1').set(bill('SALE', 1));
    await db.doc('shops/sA/saleInvoices/1').set({ bill_id: 'b1' });
    await db.doc('shops/sB/bills/b1').set(bill('SALE', 1));
  });
});

const as = (uid, claims) => env.authenticatedContext(uid, claims).firestore();

// ---------------- tenant isolation & approval gate ----------------

test('a shop owner cannot read or write another shop', async () => {
  const db = as(A);
  await assertSucceeds(db.doc('shops/sA/bills/b1').get());
  await assertFails(db.doc('shops/sB/bills/b1').get());
  await assertFails(db.collection('shops/sB/parties').get());
  await assertFails(db.doc('shops/sB/parties/x').set(party));
  await assertFails(db.doc('shops/sB').get());
});

test('signed-out users can read nothing', async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertFails(db.doc('shops/sA').get());
  await assertFails(db.doc('shops/sA/bills/b1').get());
});

test('an unapproved shop gets no business data access (ledger, dues, reports)', async () => {
  const db = as(P);
  await assertSucceeds(db.doc('shops/sP').get()); // can see its own status
  await assertFails(db.doc('shops/sP/parties/x').set(party));
  await assertFails(db.collection('shops/sP/bills').get());
});

test('only the admin can approve; an owner cannot approve itself', async () => {
  await assertFails(as(P).doc('shops/sP').update({ status: 'APPROVED' }));
  await assertSucceeds(as(ADMIN, { admin: true }).doc('shops/sP').update({ status: 'APPROVED', verified_by: 'admin', verified_at: now, updated_at: now }));
});

test('admins list shops; owners cannot list', async () => {
  await assertSucceeds(as(ADMIN, { admin: true }).collection('shops').where('status', '==', 'PENDING').get());
  await assertFails(as(A).collection('shops').get());
});

// ---------------- registration ----------------

test('registration creates a PENDING shop + user together; cannot self-approve', async () => {
  const uid = 'new-owner';
  const db = as(uid);
  const ok = db.batch();
  ok.set(db.doc('shops/sN'), shop(uid, 'PENDING'));
  ok.set(db.doc(`users/${uid}`), { shop_id: 'sN', role: 'OWNER', email: 'n@x.in', created_at: now });
  ok.set(db.doc('adminNotifications/n1'), { kind: 'SHOP_REGISTERED', shop_id: 'sN', shop_name: 'N', owner_uid: uid, read_at: null, created_at: now });
  await assertSucceeds(ok.commit());

  const bad = as('other').batch();
  bad.set(as('other').doc('shops/sX'), shop('other', 'APPROVED'));
  await assertFails(bad.commit());
});

test('verification documents: JPEG only, private to owner and admin', async () => {
  const db = as(P);
  await assertSucceeds(db.doc('shops/sP/documents/GST_CERTIFICATE').set({
    type: 'GST_CERTIFICATE', data_url: 'data:image/jpeg;base64,AAAA', file_name: 'gst.jpg', uploaded_at: now, verification_status: 'PENDING', admin_comment: null
  }));
  await assertFails(db.doc('shops/sP/documents/GST_CERTIFICATE').set({
    type: 'GST_CERTIFICATE', data_url: 'data:image/png;base64,AAAA', file_name: 'x.png', uploaded_at: now, verification_status: 'PENDING', admin_comment: null
  }));
  await assertFails(db.doc('shops/sP/documents/GST_CERTIFICATE').update({ verification_status: 'APPROVED' }));
  await assertFails(as(A).doc('shops/sP/documents/GST_CERTIFICATE').get());
  await assertSucceeds(as(ADMIN, { admin: true }).doc('shops/sP/documents/GST_CERTIFICATE').update({ verification_status: 'APPROVED', admin_comment: 'ok' }));
});

// ---------------- bills & invoice numbers ----------------

test('duplicate SALE invoice number is rejected (lock document already exists)', async () => {
  const db = as(A);
  const b = db.batch();
  b.set(db.doc('shops/sA/bills/b2'), bill('SALE', 1));
  b.set(db.doc('shops/sA/saleInvoices/1'), { bill_id: 'b2' });
  await assertFails(b.commit());

  const ok = db.batch();
  ok.set(db.doc('shops/sA/bills/b3'), bill('SALE', 2));
  ok.set(db.doc('shops/sA/saleInvoices/2'), { bill_id: 'b3' });
  await assertSucceeds(ok.commit());
});

test('a SALE bill without its invoice lock is rejected', async () => {
  await assertFails(as(A).doc('shops/sA/bills/b9').set(bill('SALE', 9)));
});

test('PURCHASE invoice numbers may repeat', async () => {
  const db = as(A);
  await assertSucceeds(db.doc('shops/sA/bills/p1').set(bill('PURCHASE', 77)));
  await assertSucceeds(db.doc('shops/sA/bills/p2').set(bill('PURCHASE', 77)));
});

test('bill totals must add up and a new bill cannot start paid', async () => {
  const db = as(A);
  await assertFails(db.doc('shops/sA/bills/x').set(bill('PURCHASE', 5, { grand_total: 999 })));
  await assertFails(db.doc('shops/sA/bills/x').set(bill('PURCHASE', 5, { paid_total: 1000, amount_due: 209000 })));
});

test('tax snapshot and items are immutable; bills are never hard-deleted', async () => {
  const db = as(A);
  await assertFails(db.doc('shops/sA/bills/b1').update({ gst_bp: 1200 }));
  await assertFails(db.doc('shops/sA/bills/b1').update({ grand_total: 1 }));
  await assertFails(db.doc('shops/sA/bills/b1').delete());
  await assertSucceeds(db.doc('shops/sA/bills/b1').update({ remind_on: '2026-12-01', remind_lead_days: 3, notes: 'x', updated_at: now }));
});

// ---------------- payments ----------------

const payBatch = (db, id, amount, record = null) => {
  const b = db.batch();
  b.set(db.doc(`shops/sA/payments/${id}`), record ?? { bill_id: 'b1', party_id: 'p1', amount, mode: 'CASH', paid_on: now, collected_by: 'Ravi', notes: null, created_at: now });
  const paid = amount;
  b.update(db.doc('shops/sA/bills/b1'), { paid_total: paid, amount_due: 210000 - paid, status: 210000 - paid <= 0 ? 'SETTLED' : 'PENDING', last_op: id, updated_at: now });
  return b;
};

test('payment within the due is accepted and updates the bill', async () => {
  await assertSucceeds(payBatch(as(A), 'pay1', 10000).commit());
});

test('payment more than the amount due is rejected', async () => {
  await assertFails(payBatch(as(A), 'pay2', 210001).commit());
});

test('bill paid_total must move by exactly the payment amount', async () => {
  const db = as(A);
  const b = db.batch();
  b.set(db.doc('shops/sA/payments/pay3'), { bill_id: 'b1', party_id: 'p1', amount: 100, mode: 'CASH', paid_on: now, collected_by: 'R', created_at: now });
  b.update(db.doc('shops/sA/bills/b1'), { paid_total: 5000, amount_due: 205000, status: 'PENDING', last_op: 'pay3', updated_at: now });
  await assertFails(b.commit());
});

test('NEFT UTR numbers are unique per shop', async () => {
  const db = as(A);
  const neft = (id, amount, paidBefore) => {
    const b = db.batch();
    b.set(db.doc('shops/sA/utrs/SBIN0000000001'), { payment_id: id });
    b.set(db.doc(`shops/sA/payments/${id}`), { bill_id: 'b1', party_id: 'p1', amount, mode: 'NEFT', paid_on: now, utr_no: 'SBIN0000000001', txn_date: now, created_at: now });
    b.update(db.doc('shops/sA/bills/b1'), { paid_total: paidBefore + amount, amount_due: 210000 - paidBefore - amount, status: 'PENDING', last_op: id, updated_at: now });
    return b.commit();
  };
  await assertSucceeds(neft('n1', 1000, 0));
  await assertFails(neft('n2', 1000, 1000));
});

test('payments cannot be edited or deleted (cheque dates excepted)', async () => {
  const db = as(A);
  await assertSucceeds(payBatch(db, 'c1', 1000, {
    bill_id: 'b1', party_id: 'p1', amount: 1000, mode: 'CHEQUE', paid_on: now, cheque_no: '482913', cheque_date: now,
    deposit_date: null, clearing_date: null, clearing_status: 'PENDING', notes: null, created_at: now
  }).commit());
  await assertFails(db.doc('shops/sA/payments/c1').update({ amount: 1 }));
  await assertFails(db.doc('shops/sA/payments/c1').delete());
  await assertSucceeds(db.doc('shops/sA/payments/c1').update({ clearing_status: 'CLEARED', clearing_date: now, updated_at: now }));
});

// ---------------- returns ----------------

test('a return reduces the bill by exactly its total; returns are append-only', async () => {
  const db = as(A);
  const b = db.batch();
  b.set(db.doc('shops/sA/returns/r1'), { bill_id: 'b1', party_id: 'p1', returned_on: now, reason: null, items: [{ index: 0, name: 'Saree', qty: 1 }],
    taxable_reduction: 100000, cgst: 2500, sgst: 2500, igst: 0, total_reduction: 105000, created_at: now });
  b.update(db.doc('shops/sA/bills/b1'), { returned_total: 105000, returned_qty: { 0: 1 }, amount_due: 105000, status: 'PENDING', last_op: 'r1', updated_at: now });
  await assertSucceeds(b.commit());
  await assertFails(db.doc('shops/sA/returns/r1').update({ total_reduction: 1 }));
  await assertFails(db.doc('shops/sA/returns/r1').delete());
});

// ---------------- audit ----------------

test('audit rows are append-only and carry the real actor', async () => {
  const db = as(A);
  await assertSucceeds(db.doc('shops/sA/audit/a1').set({ actor_uid: A, entity: 'bill', entity_id: 'b1', action: 'CREATE', before: null, after: null, at: now }));
  await assertFails(db.doc('shops/sA/audit/a2').set({ actor_uid: 'someone-else', entity: 'bill', entity_id: 'b1', action: 'CREATE', at: now }));
  await assertFails(db.doc('shops/sA/audit/a1').update({ action: 'X' }));
  await assertFails(db.doc('shops/sA/audit/a1').delete());
});
