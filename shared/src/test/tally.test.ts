import { test } from 'node:test';
import assert from 'node:assert';
import {
  buildTally,
  computeHsnBalances,
  summarizePolishing,
  validatePolishReceive,
  TallyBillInput,
  TallyMovementInput,
  TallyPolishInput
} from '../tally.js';

const bills: TallyBillInput[] = [
  {
    id: 'b1',
    shop_id: 'shop-1',
    kind: 'PURCHASE',
    invoice_no: 'P-1',
    bill_date: '2026-11-01',
    party_id: 'sup-1',
    party_name: 'Kanchi Silk',
    subtotal: 100000,
    cgst: 2500,
    sgst: 2500,
    igst: 0,
    items: [{ name: 'Pattu Saree', qty: 20, rate: 5000, line_total: 100000, hsn_code: '5007' }]
  },
  {
    id: 'b2',
    shop_id: 'shop-1',
    kind: 'SALE',
    invoice_no: '101',
    bill_date: '2026-11-10',
    party_id: 'cust-1',
    party_name: 'Lakshmi Silks',
    subtotal: 300000,
    cgst: 7500,
    sgst: 7500,
    igst: 0,
    items: [
      { name: 'Pattu Saree', qty: 5, rate: 40000, line_total: 200000, hsn_code: '5007' },
      { name: 'Cotton Saree', qty: 5, rate: 20000, line_total: 100000, hsn_code: '5208' }
    ]
  },
  {
    id: 'b3',
    shop_id: 'shop-1',
    kind: 'SALE',
    invoice_no: '102',
    bill_date: '2026-11-12',
    party_id: 'cust-2',
    party_name: 'Meena Boutique',
    subtotal: 80000,
    cgst: 0,
    sgst: 0,
    igst: 4000,
    items: [{ name: 'Tussar Saree', qty: 4, rate: 20000, line_total: 80000, hsn_code: '5004' }]
  },
  {
    id: 'b-other-shop',
    shop_id: 'shop-2',
    kind: 'SALE',
    invoice_no: '999',
    bill_date: '2026-11-12',
    party_id: 'cust-x',
    party_name: 'Other Shop Customer',
    subtotal: 500000,
    cgst: 0,
    sgst: 0,
    igst: 25000,
    items: [{ name: 'Pattu Saree', qty: 50, rate: 10000, line_total: 500000, hsn_code: '5007' }]
  }
];

test('HSN prefix filter matches prefix and totals equal sum of bill lines', () => {
  const res = buildTally({
    shopId: 'shop-1',
    bills,
    filter: { hsn: '50' }
  });
  assert.strictEqual(res.lines.length, 2);
  assert.deepStrictEqual(
    res.lines.map(l => l.hsn_code).sort(),
    ['5004', '5007']
  );
  const sumTaxable = res.lines.reduce((s, l) => s + l.taxable_paise, 0);
  const sumGst = res.lines.reduce((s, l) => s + l.gst_paise, 0);
  const sumTotal = res.lines.reduce((s, l) => s + l.total_paise, 0);
  assert.strictEqual(res.totals.taxable_paise, sumTaxable);
  assert.strictEqual(res.totals.gst_paise, sumGst);
  assert.strictEqual(res.totals.total_paise, sumTotal);
  assert.strictEqual(res.totals.qty, 9);
});

test('balance equation across all movement kinds and oversold / short status', () => {
  const movements: TallyMovementInput[] = [
    { id: 'm1', shop_id: 'shop-1', item_name: 'Pattu Saree', hsn_code: '5007', date: '2026-11-01', kind: 'OPENING', qty: 10 },
    { id: 'm2', shop_id: 'shop-1', item_name: 'Pattu Saree', hsn_code: '5007', date: '2026-11-11', kind: 'SALE_RETURN', qty: 2 },
    { id: 'm3', shop_id: 'shop-1', item_name: 'Pattu Saree', hsn_code: '5007', date: '2026-11-12', kind: 'PURCHASE_RETURN', qty: -1 },
    { id: 'm4', shop_id: 'shop-1', item_name: 'Pattu Saree', hsn_code: '5007', date: '2026-11-15', kind: 'COUNT_ADJUST', qty: -1 }
  ];
  const polish: TallyPolishInput[] = [
    {
      id: 'p1',
      shop_id: 'shop-1',
      date: '2026-11-13',
      party_id: 'pol-1',
      person_name: 'Raju Polisher',
      item_name: 'Pattu Saree',
      hsn_code: '5007',
      qty: 8,
      unit_price_paise: 15000,
      total_paise: 120000,
      received_qty: 5
    }
  ];

  // For 5007: opening(10) + purchased(20) - sold(5) + sale_returns(2) - purchase_returns(1) + count_adjust(-1) = 25
  const rows = computeHsnBalances({
    shopId: 'shop-1',
    bills,
    movements,
    polishEntries: polish,
    counts: [{ shop_id: 'shop-1', hsn_code: '5007', counted_qty: 23, counted_on: '2026-11-20' }]
  });

  const row5007 = rows.find(r => r.hsn_code === '5007')!;
  assert.strictEqual(row5007.book_balance, 25);
  assert.strictEqual(row5007.with_polishers, 3);
  assert.strictEqual(row5007.counted, 23);
  assert.strictEqual(row5007.variance, -2);
  assert.strictEqual(row5007.status, 'SHORT');

  const row5208 = rows.find(r => r.hsn_code === '5208')!;
  assert.strictEqual(row5208.book_balance, -5);
  assert.strictEqual(row5208.status, 'OVERSOLD');
});

test('polish receive limit and summary', () => {
  assert.strictEqual(validatePolishReceive(10, 4, 6), null);
  assert.ok(validatePolishReceive(10, 4, 7));
  assert.ok(validatePolishReceive(10, 4, 0));

  const summary = summarizePolishing('shop-1', [
    {
      id: 'p1',
      shop_id: 'shop-1',
      date: '2026-11-10',
      party_id: 'pol-1',
      person_name: 'Raju',
      item_name: 'Pattu Saree',
      hsn_code: '5007',
      qty: 10,
      unit_price_paise: 20000,
      total_paise: 200000,
      received_qty: 6
    },
    {
      id: 'p-other',
      shop_id: 'shop-2',
      date: '2026-11-10',
      party_id: 'pol-2',
      person_name: 'Other',
      item_name: 'Pattu Saree',
      hsn_code: '5007',
      qty: 99,
      unit_price_paise: 20000,
      total_paise: 1980000,
      received_qty: 0
    }
  ]);

  assert.strictEqual(summary.entries_count, 1);
  assert.strictEqual(summary.total_sarees, 10);
  assert.strictEqual(summary.pending_sarees, 4);
  assert.strictEqual(summary.total_cost_paise, 200000);
});

test('shop isolation excludes other shop bills and movements', () => {
  const res = buildTally({ shopId: 'shop-1', bills });
  assert.ok(res.lines.every(l => l.invoice_no !== '999'));
  assert.strictEqual(res.lines.length, 3);
});

test('PURCHASES and ALL modes populate purchase_lines, purchase_totals, and supplier_split', () => {
  const purOnly = buildTally({ shopId: 'shop-1', bills, filter: { type: 'PURCHASES' } });
  assert.strictEqual(purOnly.lines.length, 0);
  assert.strictEqual(purOnly.purchase_lines.length, 1);
  assert.strictEqual(purOnly.purchase_lines[0].invoice_no, 'P-1');
  assert.strictEqual(purOnly.purchase_totals.qty, 20);
  assert.strictEqual(purOnly.purchase_totals.taxable_paise, 100000);
  assert.strictEqual(purOnly.purchase_totals.gst_paise, 5000);
  assert.strictEqual(purOnly.purchase_totals.total_paise, 105000);
  assert.strictEqual(purOnly.supplier_split.length, 1);
  assert.strictEqual(purOnly.supplier_split[0].party_name, 'Kanchi Silk');

  const allMode = buildTally({ shopId: 'shop-1', bills, filter: { type: 'ALL' } });
  assert.strictEqual(allMode.lines.length, 3);
  assert.strictEqual(allMode.purchase_lines.length, 1);
});

test('negative polishing is never clamped and does not double-count POLISH_OUT/IN movements', () => {
  const movements: TallyMovementInput[] = [
    { id: 'm-prod', shop_id: 'shop-1', item_name: 'Pattu Saree', hsn_code: '5007', date: '2026-11-02', kind: 'PRODUCTION', qty: 10 },
    { id: 'm-po', shop_id: 'shop-1', item_name: 'Pattu Saree', hsn_code: '5007', date: '2026-11-03', kind: 'POLISH_OUT', qty: -1330 },
    { id: 'm-pi', shop_id: 'shop-1', item_name: 'Pattu Saree', hsn_code: '5007', date: '2026-11-04', kind: 'POLISH_IN', qty: 1430 }
  ];
  const polishEntries: TallyPolishInput[] = [
    {
      id: 'p-err',
      shop_id: 'shop-1',
      date: '2026-11-03',
      party_id: 'pol-1',
      person_name: 'Raju',
      item_name: 'Pattu Saree',
      hsn_code: '5007',
      qty: 1330,
      unit_price_paise: 10000,
      total_paise: 13300000,
      received_qty: 1430
    }
  ];

  const res = buildTally({ shopId: 'shop-1', bills, movements, polishEntries, filter: { type: 'ALL' } });
  const row5007 = res.hsn_balances.find(r => r.hsn_code === '5007')!;
  assert.strictEqual(row5007.purchased, 20);
  assert.strictEqual(row5007.produced, 10);
  assert.strictEqual(row5007.polish_out, 1330);
  assert.strictEqual(row5007.polish_in, 1430);
  assert.strictEqual(row5007.with_polishers, -100);
  assert.strictEqual(row5007.polishing_data_error, true);
  assert.strictEqual(res.totals.produced_qty, 10 + 1430);
});
