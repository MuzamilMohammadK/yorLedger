// §11 Reports & GST analytics — pure functions, exact paise, then converted to rupees
// (two decimals) only at the end so displayed and exported totals always match.
//
// Every figure uses the EFFECTIVE bill: original values minus return reductions per tax
// component (§9.5: the original grand total is never changed; effective = original − returns).
// Bills are placed in the period by bill date.
//
// Interpretations (accountant to confirm, see report disclaimer):
//  - Output tax = CGST + SGST + IGST on SALE bills, after sales returns (credit notes).
//  - Eligible ITC = CGST + SGST + IGST on PURCHASE bills, after purchase returns, only for
//    suppliers with a GSTIN (§11.3). Job-work GST is shown in its own report, not as ITC.
//  - Net GST payable = output tax − eligible ITC.

export type ReportKind = 'SALE' | 'PURCHASE' | 'JOB_WORK';

export interface ReportBill {
  id: string; kind: ReportKind; invoice_no: string; bill_date: string; due_date?: string | null;
  party_id: string; party_name: string; party_gstin?: string | null;
  tax_mode: 'INTRA' | 'INTER';
  items: { name: string; qty: number }[];
  subtotal: number; cgst: number; sgst: number; igst: number; grand_total: number;
  paid_total: number;
  returns: { taxable: number; cgst: number; sgst: number; igst: number; total: number }[];
}

export type ReportStatus = 'PENDING' | 'PARTIAL' | 'OVERDUE' | 'SETTLED';

const r2 = (paise: number) => paise / 100; // exact for integer paise

export function effective(b: ReportBill) {
  const sum = (k: 'taxable' | 'cgst' | 'sgst' | 'igst' | 'total') => b.returns.reduce((s, r) => s + r[k], 0);
  const taxable = b.subtotal - sum('taxable');
  const cgst = b.cgst - sum('cgst');
  const sgst = b.sgst - sum('sgst');
  const igst = b.igst - sum('igst');
  const returned = sum('total');
  const net = b.grand_total - returned;
  const due = net - b.paid_total;
  return { taxable, cgst, sgst, igst, gst: cgst + sgst + igst, returned, net, due };
}

export function reportStatus(b: ReportBill, today: string): ReportStatus {
  const e = effective(b);
  if (e.due <= 0) return 'SETTLED';
  if (b.due_date && b.due_date < today) return 'OVERDUE';
  return b.paid_total > 0 || e.returned > 0 ? 'PARTIAL' : 'PENDING';
}

// ---------------------------------------------------------------- periods

export interface ReportFilter { from?: string; to?: string; financialYear?: string; month?: string; quarter?: string; partySearch?: string; partyId?: string }

/** Resolve the period. Default: current Indian financial year. */
export function resolveReportPeriod(f: ReportFilter, today: string): { from: string; to: string; label: string } {
  const [ty, tm] = today.split('-').map(Number);
  // Accepts '2026-2027', 'FY 2026-27', '2026': the first four-digit number is the FY start year.
  const fyMatch = f.financialYear?.match(/(\d{4})/);
  const fyStart = fyMatch ? parseInt(fyMatch[1], 10) : tm >= 4 ? ty : ty - 1;
  if (f.from || f.to) return { from: f.from || '0000-01-01', to: f.to || '9999-12-31', label: `${f.from || '…'} → ${f.to || '…'}` };
  if (f.month) {
    const [y, m] = f.month.split('-').map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { from: `${f.month}-01`, to: `${f.month}-${String(last).padStart(2, '0')}`, label: f.month };
  }
  if (f.quarter) {
    const q: Record<string, [string, string]> = {
      Q1: [`${fyStart}-04-01`, `${fyStart}-06-30`], Q2: [`${fyStart}-07-01`, `${fyStart}-09-30`],
      Q3: [`${fyStart}-10-01`, `${fyStart}-12-31`], Q4: [`${fyStart + 1}-01-01`, `${fyStart + 1}-03-31`]
    };
    const [from, to] = q[f.quarter] ?? q.Q1;
    return { from, to, label: `${f.quarter} FY ${fyStart}-${String(fyStart + 1).slice(2)}` };
  }
  return { from: `${fyStart}-04-01`, to: `${fyStart + 1}-03-31`, label: `FY ${fyStart}-${String(fyStart + 1).slice(2)}` };
}

function select(bills: ReportBill[], kind: ReportKind, f: ReportFilter, today: string) {
  const p = resolveReportPeriod(f, today);
  const needle = f.partySearch?.trim().toLowerCase();
  const list = bills
    .filter(b => b.kind === kind && b.bill_date >= p.from && b.bill_date <= p.to)
    .filter(b => !f.partyId || b.party_id === f.partyId)
    .filter(b => !needle || b.party_name.toLowerCase().includes(needle) || (b.party_gstin ?? '').toLowerCase().includes(needle))
    .sort((a, b) => a.bill_date.localeCompare(b.bill_date) || a.invoice_no.localeCompare(b.invoice_no, undefined, { numeric: true }));
  return { list, period: p };
}

// ---------------------------------------------------------------- §11.3 purchase ledger

export function purchaseLedger(bills: ReportBill[], f: ReportFilter, today: string) {
  const { list, period } = select(bills, 'PURCHASE', f, today);
  const T = { value: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, gst: 0, returns: 0, itc: 0 };
  const items = list.map(b => {
    const e = effective(b);
    const hasGstin = !!b.party_gstin;
    const itc = hasGstin ? e.gst : 0;
    T.value += e.net; T.taxable += e.taxable; T.cgst += e.cgst; T.sgst += e.sgst; T.igst += e.igst; T.gst += e.gst; T.returns += e.returned; T.itc += itc;
    return {
      id: b.id, supplier_name: b.party_name, supplier_gstin: b.party_gstin ?? null, has_gstin: hasGstin,
      invoice_number: b.invoice_no, bill_date: b.bill_date,
      taxable_value: r2(e.taxable), cgst: r2(e.cgst), sgst: r2(e.sgst), igst: r2(e.igst), total_gst: r2(e.gst),
      net_purchase_amount: r2(e.net), returns: r2(e.returned), eligible_itc: r2(itc), payment_status: reportStatus(b, today)
    };
  });
  return {
    items, period,
    totals: {
      total_purchase_value: r2(T.value), total_taxable_value: r2(T.taxable), total_cgst: r2(T.cgst), total_sgst: r2(T.sgst),
      total_igst: r2(T.igst), total_gst: r2(T.gst), total_returns: r2(T.returns), eligible_itc: r2(T.itc)
    }
  };
}

// ---------------------------------------------------------------- §11.4 sales ledger

export function salesLedger(bills: ReportBill[], f: ReportFilter, today: string) {
  const { list, period } = select(bills, 'SALE', f, today);
  const T = { taxable: 0, cgst: 0, sgst: 0, igst: 0, gst: 0, value: 0, paid: 0, due: 0, intra: 0, inter: 0, returns: 0 };
  const items = list.map(b => {
    const e = effective(b);
    const inter = b.tax_mode === 'INTER';
    T.taxable += e.taxable; T.cgst += e.cgst; T.sgst += e.sgst; T.igst += e.igst; T.gst += e.gst; T.value += e.net;
    T.paid += b.paid_total; T.due += Math.max(0, e.due); T.returns += e.returned;
    if (inter) T.inter += e.net; else T.intra += e.net;
    return {
      id: b.id, customer_name: b.party_name, customer_gstin: b.party_gstin ?? null, invoice_number: b.invoice_no, bill_date: b.bill_date,
      is_inter_state: inter, sales_type: inter ? 'INTER_STATE' as const : 'INTRA_STATE' as const,
      taxable_value: r2(e.taxable), cgst: r2(e.cgst), sgst: r2(e.sgst), igst: r2(e.igst), total_gst: r2(e.gst),
      grand_total: r2(e.net), returns: r2(e.returned), amount_paid: r2(b.paid_total), remaining_due: r2(Math.max(0, e.due)),
      payment_status: reportStatus(b, today)
    };
  });
  return {
    items, period,
    totals: {
      total_taxable_sales: r2(T.taxable), total_cgst: r2(T.cgst), total_sgst: r2(T.sgst), total_igst: r2(T.igst),
      total_output_gst: r2(T.gst), total_sales_value: r2(T.value), total_paid: r2(T.paid), total_outstanding_due: r2(T.due),
      intra_state_sales: r2(T.intra), inter_state_sales: r2(T.inter), total_returns: r2(T.returns)
    }
  };
}

// ---------------------------------------------------------------- §11.5 artisan & job work

export function jobWorkLedger(bills: ReportBill[], f: ReportFilter, today: string) {
  const { list, period } = select(bills, 'JOB_WORK', f, today);
  const T = { value: 0, gst: 0, paid: 0, due: 0 };
  const byArtisan = new Map<string, { artisan_id: string; artisan_name: string; v: number; g: number; p: number; d: number; n: number }>();
  const items = list.map(b => {
    const e = effective(b);
    const due = Math.max(0, e.due);
    T.value += e.taxable; T.gst += e.gst; T.paid += b.paid_total; T.due += due;
    const a = byArtisan.get(b.party_id) ?? { artisan_id: b.party_id, artisan_name: b.party_name, v: 0, g: 0, p: 0, d: 0, n: 0 };
    a.v += e.taxable; a.g += e.gst; a.p += b.paid_total; a.d += due; a.n++;
    byArtisan.set(b.party_id, a);
    return {
      id: b.id, artisan_name: b.party_name, artisan_id: b.party_id, job_work_reference: b.invoice_no, transaction_date: b.bill_date,
      work_details: b.items.map(i => i.name).join(', '), quantity: b.items.reduce((s, i) => s + i.qty, 0),
      job_work_amount: r2(e.taxable), gst: r2(e.gst), total_amount: r2(e.net), amount_paid: r2(b.paid_total),
      outstanding_amount: r2(due), payment_status: reportStatus(b, today)
    };
  });
  // Grouped by artisan (§11.5).
  items.sort((x, y) => x.artisan_name.localeCompare(y.artisan_name) || x.transaction_date.localeCompare(y.transaction_date));
  return {
    items, period,
    artisan_summaries: [...byArtisan.values()].sort((a, b) => a.artisan_name.localeCompare(b.artisan_name)).map(a => ({
      artisan_id: a.artisan_id, artisan_name: a.artisan_name, total_job_work_value: r2(a.v), total_gst: r2(a.g),
      total_payments: r2(a.p), outstanding_amount: r2(a.d), transaction_count: a.n
    })),
    totals: { total_job_work_value: r2(T.value), total_gst: r2(T.gst), total_payments: r2(T.paid), total_outstanding: r2(T.due) }
  };
}

// ---------------------------------------------------------------- §11.6 GST dashboard

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function gstDashboard(bills: ReportBill[], f: ReportFilter, today: string) {
  const period = resolveReportPeriod({ ...f, partySearch: undefined, partyId: undefined }, today);
  const inP = bills.filter(b => b.bill_date >= period.from && b.bill_date <= period.to);
  const months = new Map<string, { sales: number; purchases: number; out: number; oc: number; os: number; oi: number; itc: number }>();
  const mk = (d: string) => {
    const k = d.slice(0, 7);
    if (!months.has(k)) months.set(k, { sales: 0, purchases: 0, out: 0, oc: 0, os: 0, oi: 0, itc: 0 });
    return months.get(k)!;
  };
  let taxableSales = 0, oc = 0, os = 0, oi = 0, ic = 0, is = 0, ii = 0;
  for (const b of inP) {
    const e = effective(b);
    const m = mk(b.bill_date);
    if (b.kind === 'SALE') {
      taxableSales += e.taxable; oc += e.cgst; os += e.sgst; oi += e.igst;
      m.sales += e.taxable; m.out += e.gst; m.oc += e.cgst; m.os += e.sgst; m.oi += e.igst;
    } else if (b.kind === 'PURCHASE') {
      m.purchases += e.taxable;
      if (b.party_gstin) { ic += e.cgst; is += e.sgst; ii += e.igst; m.itc += e.gst; }
    }
  }
  const output = oc + os + oi;
  const itc = ic + is + ii;
  const keys = [...months.keys()].sort();
  const label = (k: string) => `${MONTHS[Number(k.slice(5)) - 1]} ${k.slice(2, 4)}`;
  return {
    period,
    summary: { total_taxable_sales: r2(taxableSales), output_gst: r2(output), eligible_itc: r2(itc), net_gst_payable: r2(output - itc) },
    tax_breakdown: { output_cgst: r2(oc), output_sgst: r2(os), output_igst: r2(oi), input_cgst: r2(ic), input_sgst: r2(is), input_igst: r2(ii) },
    charts: {
      monthly_sales_vs_purchases: keys.map(k => ({ month: label(k), sales: r2(months.get(k)!.sales), purchases: r2(months.get(k)!.purchases) })),
      monthly_output_gst_trend: keys.map(k => { const m = months.get(k)!; return { month: label(k), output_gst: r2(m.out), cgst: r2(m.oc), sgst: r2(m.os), igst: r2(m.oi) }; }),
      monthly_itc_trend: keys.map(k => ({ month: label(k), eligible_itc: r2(months.get(k)!.itc) })),
      tax_component_comparison: [
        { component: 'CGST', output: r2(oc), input: r2(ic) }, { component: 'SGST', output: r2(os), input: r2(is) }, { component: 'IGST', output: r2(oi), input: r2(ii) }
      ],
      monthly_net_payable_trend: keys.map(k => ({ month: label(k), net_payable: r2(months.get(k)!.out - months.get(k)!.itc) }))
    }
  };
}

// ---------------------------------------------------------------- CSV export (§11.8)

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  // Guard against spreadsheet formula injection, then quote.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

/** CSV with shop identity and period in the header lines; amounts with two decimals. */
export function toCsv(meta: { shop: string; gstin: string; report: string; period: string }, columns: { key: string; label: string }[], rows: Record<string, unknown>[], totals?: Record<string, unknown>): string {
  const money = (v: unknown) => (typeof v === 'number' ? v.toFixed(2) : v);
  const lines = [
    [csvCell(meta.shop), csvCell(`GSTIN ${meta.gstin}`)].join(','),
    [csvCell(meta.report), csvCell(meta.period)].join(','),
    '',
    columns.map(c => csvCell(c.label)).join(','),
    ...rows.map(r => columns.map(c => csvCell(money(r[c.key]))).join(','))
  ];
  if (totals) lines.push(columns.map((c, i) => csvCell(i === 0 ? 'TOTAL' : money(totals[c.key] ?? ''))).join(','));
  return lines.join('\r\n');
}

/** Financial years to offer in filters: current first, then the previous ones. */
export function financialYearOptions(today: string, count = 5): { value: string; label: string }[] {
  const [y, m] = today.split('-').map(Number);
  const start = m >= 4 ? y : y - 1;
  return Array.from({ length: count }, (_, i) => {
    const s = start - i;
    return { value: `${s}-${s + 1}`, label: `FY ${s}-${String(s + 1).slice(2)}` };
  });
}
