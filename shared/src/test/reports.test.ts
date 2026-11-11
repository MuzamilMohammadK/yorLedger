import { test } from 'node:test';
import assert from 'node:assert';
import { ReportBill, purchaseLedger, salesLedger, jobWorkLedger, gstDashboard, resolveReportPeriod, toCsv } from '../reports.js';

const today = '2026-11-11';
const bill = (o: Partial<ReportBill>): ReportBill => ({
  id: 'x', kind: 'SALE', invoice_no: '1', bill_date: '2026-11-01', party_id: 'p', party_name: 'P', party_gstin: null,
  tax_mode: 'INTRA', items: [{ name: 'Saree', qty: 1 }], subtotal: 0, cgst: 0, sgst: 0, igst: 0, grand_total: 0, paid_total: 0, returns: [], ...o
});

// Sale: 10 sarees @ ₹12,500, 5 % intra; 2 returned (₹25,000 + ₹1,250 tax).
const sale = bill({ id: 's1', subtotal: 12500000, cgst: 312500, sgst: 312500, grand_total: 13125000, paid_total: 5000000,
  returns: [{ taxable: 2500000, cgst: 62500, sgst: 62500, igst: 0, total: 2625000 }] });
const saleInter = bill({ id: 's2', invoice_no: '2', tax_mode: 'INTER', subtotal: 100000, igst: 5000, grand_total: 105000 });
// Purchases: one from a registered supplier, one unregistered (no ITC).
const purReg = bill({ id: 'p1', kind: 'PURCHASE', party_id: 'sup', party_name: 'Supplier', party_gstin: '33AABCK1234M1ZR',
  tax_mode: 'INTER', subtotal: 1000000, igst: 50000, grand_total: 1050000,
  returns: [{ taxable: 100000, cgst: 0, sgst: 0, igst: 5000, total: 105000 }] });
const purUnreg = bill({ id: 'p2', kind: 'PURCHASE', party_id: 'u', party_name: 'Local', subtotal: 200000, cgst: 5000, sgst: 5000, grand_total: 210000 });
const job = bill({ id: 'j1', kind: 'JOB_WORK', party_id: 'a', party_name: 'Weaver A', items: [{ name: 'Weaving', qty: 4 }],
  subtotal: 400000, cgst: 10000, sgst: 10000, grand_total: 420000, paid_total: 100000 });
const bills = [sale, saleInter, purReg, purUnreg, job];

test('default period is the current Indian financial year', () => {
  assert.deepStrictEqual(resolveReportPeriod({}, today), { from: '2026-04-01', to: '2027-03-31', label: 'FY 2026-27' });
  assert.strictEqual(resolveReportPeriod({ quarter: 'Q4' }, today).from, '2027-01-01');
  assert.strictEqual(resolveReportPeriod({ month: '2026-02' }, today).to, '2026-02-28');
});

test('§11.3 ITC: only GSTIN suppliers, net of returns', () => {
  const r = purchaseLedger(bills, {}, today);
  assert.strictEqual(r.totals.eligible_itc, 450);           // 500 − 50 returned, unregistered excluded
  assert.strictEqual(r.items.find(i => i.id === 'p2')!.eligible_itc, 0);
  assert.strictEqual(r.totals.total_purchase_value, 9450 + 2100);
  assert.strictEqual(r.totals.total_returns, 1050);
});

test('§11.4 sales: effective values after returns, paid and remaining due, IGST split', () => {
  const r = salesLedger(bills, {}, today);
  const s = r.items.find(i => i.id === 's1')!;
  assert.strictEqual(s.taxable_value, 100000);
  assert.strictEqual(s.total_gst, 5000);
  assert.strictEqual(s.grand_total, 105000);
  assert.strictEqual(s.remaining_due, 55000);
  assert.strictEqual(s.payment_status, 'PARTIAL');
  assert.strictEqual(r.totals.inter_state_sales, 1050);
  assert.strictEqual(r.totals.intra_state_sales, 105000);
});

test('§11.5 job work grouped by artisan', () => {
  const r = jobWorkLedger(bills, {}, today);
  assert.strictEqual(r.artisan_summaries.length, 1);
  assert.strictEqual(r.artisan_summaries[0].outstanding_amount, 3200);
  assert.strictEqual(r.items[0].quantity, 4);
});

test('§11.6 net payable = output tax − eligible ITC', () => {
  const g = gstDashboard(bills, {}, today);
  assert.strictEqual(g.summary.output_gst, 5000 + 50);     // after sales return
  assert.strictEqual(g.summary.eligible_itc, 450);
  assert.strictEqual(g.summary.net_gst_payable, 4600);
  assert.strictEqual(g.tax_breakdown.input_igst, 450);
});

test('CSV export: identity + period header, totals row, formula injection guarded', () => {
  const csv = toCsv({ shop: 'Shop', gstin: 'G', report: 'Sales', period: 'FY' }, [{ key: 'a', label: 'Name' }, { key: 'b', label: 'Amt' }],
    [{ a: '=HYPERLINK("x")', b: 1.5 }], { b: 1.5 });
  const lines = csv.split('\r\n');
  assert.strictEqual(lines[0], '"Shop","GSTIN G"');
  assert.strictEqual(lines[4], `"'=HYPERLINK(""x"")","1.50"`);
  assert.strictEqual(lines[5], '"TOTAL","1.50"');
});

import { financialYearOptions } from '../reports.js';
test('financial year filter formats all resolve; options follow the IST date', () => {
  for (const fy of ['2025-2026', 'FY 2025-26', '2025']) {
    assert.deepStrictEqual(resolveReportPeriod({ financialYear: fy }, today), { from: '2025-04-01', to: '2026-03-31', label: 'FY 2025-26' });
  }
  assert.strictEqual(financialYearOptions('2027-02-10')[0].value, '2026-2027'); // Feb 2027 is still FY 2026-27
  assert.strictEqual(financialYearOptions('2026-11-11')[0].label, 'FY 2026-27');
});
