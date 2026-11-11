import { test } from 'node:test';
import assert from 'node:assert';
import { wrapIndex, swipeDecision, isHorizontalGesture, partyStatement } from '../index.js';

test('§8.1 circular pager wraps both ways: Party → Sales → Purchases → Party', () => {
  assert.strictEqual(wrapIndex(0, 3), 0);
  assert.strictEqual(wrapIndex(3, 3), 0);   // past Purchases -> Party
  assert.strictEqual(wrapIndex(-1, 3), 2);  // before Party -> Purchases
  assert.strictEqual(wrapIndex(-4, 3), 2);
});

test('§8.8 swipe commits at 25 % width or a fast fling, otherwise springs back', () => {
  assert.strictEqual(swipeDecision(-100, 400, 0.1), 1);   // 25 % left -> next
  assert.strictEqual(swipeDecision(100, 400, 0.1), -1);   // 25 % right -> previous
  assert.strictEqual(swipeDecision(-99, 400, 0.1), 0);    // just short -> spring back
  assert.strictEqual(swipeDecision(-40, 400, 0.9), 1);    // fling
  assert.strictEqual(swipeDecision(-10, 400, 2), 0);      // tiny flick ignored
});

test('vertical scrolling is never taken as a swipe', () => {
  assert.strictEqual(isHorizontalGesture(3, 4), null);
  assert.strictEqual(isHorizontalGesture(5, 40), false);
  assert.strictEqual(isHorizontalGesture(40, 5), true);
});

test('party statement: running balance across sales, payments, returns and purchases', () => {
  const rows = partyStatement(
    [{ id: 's', kind: 'SALE', invoice_no: '1', date: '2026-11-01', grand_total: 100000 },
     { id: 'p', kind: 'PURCHASE', invoice_no: '7', date: '2026-11-03', grand_total: 30000 }],
    [{ id: 'pay', bill_id: 's', date: '2026-11-05', amount: 50000, mode: 'CASH' }],
    [{ id: 'ret', bill_id: 's', date: '2026-11-02', total: 10000 }]
  );
  assert.deepStrictEqual(rows.map(r => [r.type, r.amount, r.balance]), [
    ['BILL', 100000, 100000], ['RETURN', -10000, 90000], ['BILL', -30000, 60000], ['PAYMENT', -50000, 10000]
  ]);
});
