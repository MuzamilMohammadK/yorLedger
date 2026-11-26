import { test } from 'node:test';
import assert from 'node:assert';
import {
  allocatePolishPayments,
  computeRawMaterialBalance,
  computeWeaverReconciliation,
  computeWeaverWagesDue,
  finishedStockStatus,
  wouldVoidCauseNegative
} from '../stockRework.js';

test('finished stock status distinguishes OK, LOW, OUT, NEGATIVE', () => {
  assert.strictEqual(finishedStockStatus(15, 5), 'OK');
  assert.strictEqual(finishedStockStatus(5, 5), 'LOW');
  assert.strictEqual(finishedStockStatus(0, 5), 'OUT');
  assert.strictEqual(finishedStockStatus(-10, 5), 'NEGATIVE');
});

test('voiding restores balance and blocks when later stock would go negative', () => {
  const entries = [
    { id: 'm1', date: '2026-11-01', qty: 100, status: 'ACTIVE' as const },
    { id: 'm2', date: '2026-11-02', qty: -40, status: 'ACTIVE' as const }
  ];
  // Voiding m1 (100 sarees) would leave -40 on 2026-11-02 -> blocked
  const blocked = wouldVoidCauseNegative(entries, 'm1');
  assert.ok(blocked);
  assert.strictEqual(blocked.balanceAfter, -40);

  // Voiding m2 (-40 sarees) is safe
  assert.strictEqual(wouldVoidCauseNegative(entries, 'm2'), null);
});

test('raw material balance never clamps negative and respects VOID + shop isolation', () => {
  const res = computeRawMaterialBalance({
    shopId: 'shop-1',
    materialId: 'mat-1',
    movements: [
      { id: 'r1', shop_id: 'shop-1', material_id: 'mat-1', date: '2026-11-01', kind: 'ISSUE_JOBWORK', grams: 20000, rate_paise_per_kg: 500000, status: 'ACTIVE' },
      { id: 'r2', shop_id: 'shop-1', material_id: 'mat-1', date: '2026-11-02', kind: 'PURCHASE', grams: 50000, rate_paise_per_kg: 600000, status: 'VOID' },
      { id: 'r3', shop_id: 'shop-2', material_id: 'mat-1', date: '2026-11-01', kind: 'PURCHASE', grams: 99000, rate_paise_per_kg: 600000, status: 'ACTIVE' }
    ],
    fallbackRatePaise: 500000
  });
  assert.strictEqual(res.in_shop_grams, -20000);
  assert.strictEqual(res.with_weavers_grams, 20000);
  assert.strictEqual(res.status, 'NEGATIVE');
});

test('weaver yarn reconciliation and wages due math', () => {
  const rec = computeWeaverReconciliation({
    issuedGrams: 10000,
    sareesReceived: 10,
    stdGramsPerSaree: 500,
    leftoverReturnedGrams: 1000,
    allowedWastageGrams: 500,
    actualWastageGrams: 600
  });
  assert.strictEqual(rec.pendingYarnGrams, 3500);
  assert.strictEqual(rec.overWastageLimit, true);

  const due = computeWeaverWagesDue({
    earnedPaise: 500000,
    advancesPaise: 100000,
    paymentsPaise: 150000,
    yarnSoldPaise: 50000
  });
  assert.strictEqual(due, 200000);
});

test('polish payment allocation accrues on received and allocates oldest first', () => {
  const { entries, accounts } = allocatePolishPayments({
    shopId: 'shop-1',
    batches: [
      { id: 'p1', shop_id: 'shop-1', person_name: 'mj', sent_date: '2026-11-01', sarees_sent: 10, sarees_received: 10, unit_price_paise: 10000 },
      { id: 'p2', shop_id: 'shop-1', person_name: 'mj', sent_date: '2026-11-05', sarees_sent: 10, sarees_received: 5, unit_price_paise: 10000 }
    ],
    payments: [
      { id: 'pay1', shop_id: 'shop-1', person_name: 'mj', date: '2026-11-06', amount_paise: 120000 }
    ]
  });

  const e1 = entries.find(e => e.id === 'p1')!;
  const e2 = entries.find(e => e.id === 'p2')!;
  assert.strictEqual(e1.payment_status, 'PAID');
  assert.strictEqual(e2.paid_paise, 20000);
  assert.strictEqual(e2.balance_paise, 30000);
  assert.strictEqual(e2.payment_status, 'PART');
  assert.strictEqual(accounts[0].total_charges_paise, 150000);
  assert.strictEqual(accounts[0].total_paid_paise, 120000);
  assert.strictEqual(accounts[0].balance_payable_paise, 30000);
});
