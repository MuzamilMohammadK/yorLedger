import { test } from 'node:test';
import assert from 'node:assert';
import { periodRange, dashboardFigures, dashboardSeries, DashBill } from '../dashboard.js';

test('periods use the Indian financial year and quarters', () => {
  assert.deepStrictEqual(periodRange('this_fy', '2026-11-11'), { from: '2026-04-01', to: '2026-11-11' });
  assert.deepStrictEqual(periodRange('this_fy', '2027-02-10'), { from: '2026-04-01', to: '2027-02-10' });
  assert.deepStrictEqual(periodRange('this_quarter', '2026-11-11'), { from: '2026-10-01', to: '2026-11-11' });
  assert.deepStrictEqual(periodRange('this_quarter', '2027-02-10'), { from: '2027-01-01', to: '2027-02-10' });
  assert.deepStrictEqual(periodRange('last_30_days', '2026-11-11'), { from: '2026-10-13', to: '2026-11-11' });
});

const B = (id: string, kind: DashBill['kind'], date: string, gt: number, ret = 0, paid = 0): DashBill =>
  ({ id, kind, bill_date: date, grand_total: gt, returned_total: ret, paid_total: paid, amount_due: gt - ret - paid });

const bills = [
  B('s1', 'SALE', '2026-11-02', 100000, 0, 100000),   // settled
  B('s2', 'SALE', '2026-11-05', 50000, 10000, 0),     // pending 40000
  B('p1', 'PURCHASE', '2026-11-06', 80000, 0, 30000), // pending 50000
  B('j1', 'JOB_WORK', '2026-10-20', 20000, 0, 0),     // outside this month, still payable
];

test('figures: counts, pending / settled, net balance as of today', () => {
  const f = dashboardFigures('this_month', '2026-11-11', bills, [{ date: '2026-11-02' }, { date: '2026-10-25' }], [{ date: '2026-11-05' }]);
  assert.strictEqual(f.bills_count, 3);
  assert.strictEqual(f.total_transactions, 3 + 1 + 1);
  assert.strictEqual(f.pending_count, 2);
  assert.strictEqual(f.pending_amount, 40000 + 50000);
  assert.strictEqual(f.settled_count, 1);
  assert.strictEqual(f.settled_amount, 100000);
  assert.strictEqual(f.total_value, 100000 + 40000 + 80000);
  assert.strictEqual(f.sales, 140000);
  assert.strictEqual(f.purchases, 80000);
  assert.strictEqual(f.to_collect, 40000);
  assert.strictEqual(f.to_pay, 50000 + 20000);       // job work from October still counts: position as of today
  assert.strictEqual(f.net_balance, 40000 - 70000);
});

test('series: daily buckets for this month, monthly for FY', () => {
  const d = dashboardSeries('this_month', '2026-11-11', bills, [], []);
  assert.strictEqual(d.buckets.length, 11);
  assert.strictEqual(d.buckets[4].sales, 40000);
  assert.deepStrictEqual(d.by_type, { sale: 2, purchase: 1, job_work: 0, payment: 0, return: 0 });
  const m = dashboardSeries('this_fy', '2026-11-11', bills, [], []);
  assert.strictEqual(m.buckets.length, 8); // Apr..Nov
  assert.strictEqual(m.buckets[6].job_work, 20000); // October
});
