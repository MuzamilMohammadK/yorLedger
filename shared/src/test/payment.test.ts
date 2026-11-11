import { test } from 'node:test';
import assert from 'node:assert';
import { validatePayment } from '../payment.js';

test('§10.7 cash needs date and collector', () => {
  assert.deepStrictEqual(validatePayment({ mode: 'CASH', bill_id: 'b', amount: 500, paid_on: '2026-11-11', collected_by: 'Ravi' }, 1000), {});
  assert.ok(validatePayment({ mode: 'CASH', bill_id: 'b', amount: 500, paid_on: '2026-11-11', collected_by: ' ' }, 1000).collected_by);
});

test('§10.7 cheque needs cheque date; deposit / clearing may be empty', () => {
  assert.deepStrictEqual(validatePayment({ mode: 'CHEQUE', bill_id: 'b', amount: 500, cheque_date: '2026-11-11' }, 1000), {});
  assert.ok(validatePayment({ mode: 'CHEQUE', bill_id: 'b', amount: 500, cheque_date: '' }, 1000).cheque_date);
  assert.ok(validatePayment({ mode: 'CHEQUE', bill_id: 'b', amount: 500, cheque_date: '2026-11-11', deposit_date: '2026-11-12', clearing_date: '2026-11-10' }, 1000).clearing_date);
});

test('§10.7 NEFT needs UTR and transaction date', () => {
  assert.deepStrictEqual(validatePayment({ mode: 'NEFT', bill_id: 'b', amount: 500, utr_no: 'SBIN426311223344', txn_date: '2026-11-11' }, 1000), {});
  assert.ok(validatePayment({ mode: 'NEFT', bill_id: 'b', amount: 500, utr_no: 'AB', txn_date: '2026-11-11' }, 1000).utr_no);
});

test('§10.7 amount must not exceed amount due', () => {
  assert.ok(validatePayment({ mode: 'CASH', bill_id: 'b', amount: 1001, paid_on: '2026-11-11', collected_by: 'R' }, 1000).amount);
  assert.ok(validatePayment({ mode: 'CASH', bill_id: 'b', amount: 0, paid_on: '2026-11-11', collected_by: 'R' }, 1000).amount);
});
