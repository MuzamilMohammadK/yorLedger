// §6 Dashboard figures. Pure functions over bills / payments / returns, exact paise.
// Definitions (shown to the user under each card):
//  - Total transactions: bills + payments + returns dated in the period (counts).
//  - Pending: bills in the period with amount due > 0 — count and amount still due.
//  - Settled: bills in the period with amount due ≤ 0 — count and their value after returns.
//  - Total value: value of all bills in the period after returns.
//  - Net balance: to collect (SALE dues) − to pay (PURCHASE + JOB_WORK dues), all bills, as of today.
//  - Sales vs purchases: SALE value vs PURCHASE value in the period (after returns); job work separate.

export type DashboardPeriod = 'this_month' | 'last_30_days' | 'this_quarter' | 'this_fy' | 'all_time';

export interface DashBill {
  id: string; kind: 'SALE' | 'PURCHASE' | 'JOB_WORK'; bill_date: string;
  grand_total: number; returned_total: number; paid_total: number; amount_due: number;
}
export interface DashEvent { date: string } // payment or return

export interface DashboardFigures {
  period: DashboardPeriod; from: string; to: string;
  total_transactions: number; bills_count: number; payments_count: number; returns_count: number;
  pending_count: number; pending_amount: number;
  settled_count: number; settled_amount: number;
  total_value: number;
  to_collect: number; to_pay: number; net_balance: number;
  sales: number; purchases: number; job_work: number;
}

export interface DashboardSeries {
  /** Buckets: days for month / 30 days, months otherwise. */
  buckets: { key: string; label: string; sales: number; purchases: number; job_work: number; sale_bills: number }[];
  pending_vs_settled: { pending: number; settled: number; pending_amount: number; settled_amount: number };
  by_type: { sale: number; purchase: number; job_work: number; payment: number; return: number };
}

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Inclusive date range (YYYY-MM-DD, IST calendar) for a period; `today` is the IST date. */
export function periodRange(period: DashboardPeriod, today: string, earliest?: string): { from: string; to: string } {
  const [y, m] = today.split('-').map(Number);
  switch (period) {
    case 'this_month':
      return { from: `${y}-${pad(m)}-01`, to: today };
    case 'last_30_days': {
      const d = new Date(`${today}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - 29);
      return { from: iso(d), to: today };
    }
    case 'this_quarter': {
      // Indian FY quarters: Apr-Jun, Jul-Sep, Oct-Dec, Jan-Mar.
      const qStart = m >= 4 ? Math.floor((m - 4) / 3) * 3 + 4 : 1;
      return { from: `${y}-${pad(qStart)}-01`, to: today };
    }
    case 'this_fy': {
      const fy = m >= 4 ? y : y - 1;
      return { from: `${fy}-04-01`, to: today };
    }
    case 'all_time':
      return { from: earliest && earliest < today ? earliest : today, to: today };
  }
}

const netValue = (b: DashBill) => b.grand_total - b.returned_total;

export function dashboardFigures(period: DashboardPeriod, today: string, bills: DashBill[], payments: DashEvent[], returns: DashEvent[]): DashboardFigures {
  const earliest = bills.reduce<string | undefined>((m, b) => (!m || b.bill_date < m ? b.bill_date : m), undefined);
  const { from, to } = periodRange(period, today, earliest);
  const inP = (d: string) => d >= from && d <= to;
  const pb = bills.filter(b => inP(b.bill_date));
  const pending = pb.filter(b => b.amount_due > 0);
  const settled = pb.filter(b => b.amount_due <= 0);
  const payments_count = payments.filter(p => inP(p.date)).length;
  const returns_count = returns.filter(r => inP(r.date)).length;
  const to_collect = bills.filter(b => b.kind === 'SALE' && b.amount_due > 0).reduce((s, b) => s + b.amount_due, 0);
  const to_pay = bills.filter(b => b.kind !== 'SALE' && b.amount_due > 0).reduce((s, b) => s + b.amount_due, 0);
  const sum = (k: DashBill['kind']) => pb.filter(b => b.kind === k).reduce((s, b) => s + netValue(b), 0);
  return {
    period, from, to,
    bills_count: pb.length, payments_count, returns_count,
    total_transactions: pb.length + payments_count + returns_count,
    pending_count: pending.length, pending_amount: pending.reduce((s, b) => s + b.amount_due, 0),
    settled_count: settled.length, settled_amount: settled.reduce((s, b) => s + netValue(b), 0),
    total_value: pb.reduce((s, b) => s + netValue(b), 0),
    to_collect, to_pay, net_balance: to_collect - to_pay,
    sales: sum('SALE'), purchases: sum('PURCHASE'), job_work: sum('JOB_WORK')
  };
}

export function dashboardSeries(period: DashboardPeriod, today: string, bills: DashBill[], payments: DashEvent[], returns: DashEvent[]): DashboardSeries {
  const earliest = bills.reduce<string | undefined>((m, b) => (!m || b.bill_date < m ? b.bill_date : m), undefined);
  const { from, to } = periodRange(period, today, earliest);
  const daily = period === 'this_month' || period === 'last_30_days';
  const buckets: DashboardSeries['buckets'] = [];
  const index = new Map<string, number>();
  if (daily) {
    for (let d = new Date(`${from}T00:00:00Z`); iso(d) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
      const k = iso(d);
      index.set(k, buckets.length);
      buckets.push({ key: k, label: `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`, sales: 0, purchases: 0, job_work: 0, sale_bills: 0 });
    }
  } else {
    let [y, m] = from.split('-').map(Number);
    const [ty, tm] = to.split('-').map(Number);
    while (y < ty || (y === ty && m <= tm)) {
      const k = `${y}-${pad(m)}`;
      index.set(k, buckets.length);
      buckets.push({ key: k, label: `${MONTHS[m - 1]} ${String(y).slice(2)}`, sales: 0, purchases: 0, job_work: 0, sale_bills: 0 });
      m++; if (m > 12) { m = 1; y++; }
    }
  }
  const pb = bills.filter(b => b.bill_date >= from && b.bill_date <= to);
  for (const b of pb) {
    const i = index.get(daily ? b.bill_date : b.bill_date.slice(0, 7));
    if (i === undefined) continue;
    const v = netValue(b);
    if (b.kind === 'SALE') { buckets[i].sales += v; buckets[i].sale_bills++; }
    else if (b.kind === 'PURCHASE') buckets[i].purchases += v;
    else buckets[i].job_work += v;
  }
  const pending = pb.filter(b => b.amount_due > 0);
  const settled = pb.filter(b => b.amount_due <= 0);
  const inP = (d: string) => d >= from && d <= to;
  return {
    buckets,
    pending_vs_settled: {
      pending: pending.length, settled: settled.length,
      pending_amount: pending.reduce((s, b) => s + b.amount_due, 0), settled_amount: settled.reduce((s, b) => s + netValue(b), 0)
    },
    by_type: {
      sale: pb.filter(b => b.kind === 'SALE').length, purchase: pb.filter(b => b.kind === 'PURCHASE').length,
      job_work: pb.filter(b => b.kind === 'JOB_WORK').length,
      payment: payments.filter(p => inP(p.date)).length, return: returns.filter(r => inP(r.date)).length
    }
  };
}
