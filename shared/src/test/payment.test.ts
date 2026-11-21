import { test } from 'node:test';
import assert from 'node:assert';
import { validatePayment } from '../payment.js';

test('§10.7 cash needs date and collector', () => {
  const today = new Date().toISOString().slice(0, 10);
  assert.deepStrictEqual(validatePayment({ mode: 'CASH', bill_id: 'b', amount: 500, paid_on: today, collected_by: 'Ravi' }, 1000), {});
  assert.ok(validatePayment({ mode: 'CASH', bill_id: 'b', amount: 500, paid_on: today, collected_by: ' ' }, 1000).collected_by);
  assert.ok(validatePayment({ mode: 'CASH', bill_id: 'b', amount: 500, paid_on: '', collected_by: 'Ravi' }, 1000).paid_on);
  assert.ok(validatePayment({ mode: 'CASH', bill_id: 'b', amount: 500, paid_on: '2099-01-01', collected_by: 'Ravi' }, 1000).paid_on);
});

test('§10.7 cheque needs cheque date; deposit / clearing may be empty', () => {
  const today = new Date().toISOString().slice(0, 10);
  assert.deepStrictEqual(validatePayment({ mode: 'CHEQUE', bill_id: 'b', amount: 500, cheque_date: today }, 1000), {});
  assert.ok(validatePayment({ mode: 'CHEQUE', bill_id: 'b', amount: 500, cheque_date: '' }, 1000).cheque_date);
  assert.ok(validatePayment({ mode: 'CHEQUE', bill_id: 'b', amount: 500, cheque_date: '2099-01-01' }, 1000).cheque_date);
  assert.ok(validatePayment({ mode: 'CHEQUE', bill_id: 'b', amount: 500, cheque_date: today, deposit_date: '2026-11-12', clearing_date: '2026-11-10' }, 1000).clearing_date);
});

test('§10.7 NEFT needs UTR and transaction date', () => {
  const today = new Date().toISOString().slice(0, 10);
  assert.deepStrictEqual(validatePayment({ mode: 'NEFT', bill_id: 'b', amount: 500, utr_no: 'SBIN426311223344', txn_date: today }, 1000), {});
  assert.ok(validatePayment({ mode: 'NEFT', bill_id: 'b', amount: 500, utr_no: 'AB', txn_date: today }, 1000).utr_no);
  assert.ok(validatePayment({ mode: 'NEFT', bill_id: 'b', amount: 500, utr_no: 'SBIN426311223344', txn_date: '' }, 1000).txn_date);
  assert.ok(validatePayment({ mode: 'NEFT', bill_id: 'b', amount: 500, utr_no: 'SBIN426311223344', txn_date: '2099-01-01' }, 1000).txn_date);
});

test('§10.7 amount must not exceed amount due', () => {
  const today = new Date().toISOString().slice(0, 10);
  assert.ok(validatePayment({ mode: 'CASH', bill_id: 'b', amount: 1001, paid_on: today, collected_by: 'R' }, 1000).amount);
  assert.ok(validatePayment({ mode: 'CASH', bill_id: 'b', amount: 0, paid_on: today, collected_by: 'R' }, 1000).amount);
});

test('partial payment retains valid payment_date and does not allow future dates', () => {
  const today = new Date().toISOString().slice(0, 10);
  const validCash = validatePayment({ mode: 'CASH', bill_id: 'b', amount: 350, paid_on: today, collected_by: 'Cashier' }, 1000);
  assert.deepStrictEqual(validCash, {});

  const futureCash = validatePayment({ mode: 'CASH', bill_id: 'b', amount: 350, paid_on: '2099-12-31', collected_by: 'Cashier' }, 1000);
  assert.strictEqual(futureCash.paid_on, 'Payment date cannot be in the future');
});
