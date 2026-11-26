// Pure Tally, HSN Stock Balance, and Polishing calculations (integer paise).

export type TallyMovementKind =
  | 'OPENING'
  | 'PURCHASE'
  | 'PRODUCTION'
  | 'SALE'
  | 'SALE_RETURN'
  | 'PURCHASE_RETURN'
  | 'POLISH_OUT'
  | 'POLISH_IN'
  | 'COUNT_ADJUST';

export type TallyShowType = 'SALES' | 'PURCHASES' | 'PRODUCTION' | 'ALL' | 'BOTH';

export interface TallyFilter {
  from?: string;
  to?: string;
  hsn?: string;
  partyId?: string;
  type?: TallyShowType;
}

export interface TallyBillInput {
  id: string;
  shop_id: string;
  kind: 'SALE' | 'PURCHASE' | 'JOB_WORK';
  invoice_no: string;
  bill_date: string;
  party_id: string;
  party_name: string;
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  items: Array<{
    name: string;
    qty: number;
    rate: number;
    line_total: number;
    hsn_code?: string | null;
  }>;
}

export interface TallyReturnInput {
  id: string;
  shop_id: string;
  bill_id: string;
  kind: 'SALE' | 'PURCHASE' | 'JOB_WORK';
  returned_on: string;
  party_id: string;
  items: Array<{
    name: string;
    qty: number;
    hsn_code?: string | null;
  }>;
}

export interface TallyMovementInput {
  id: string;
  shop_id: string;
  item_name: string;
  hsn_code?: string | null;
  date: string;
  kind: TallyMovementKind;
  qty: number; // signed: + increases stock, - decreases stock
  bill_id?: string | null;
  party_id?: string | null;
}

export interface TallyPolishInput {
  id: string;
  shop_id: string;
  date: string;
  party_id?: string | null;
  person_name: string;
  item_name: string;
  hsn_code?: string | null;
  qty: number;
  unit_price_paise: number;
  total_paise: number;
  received_qty: number;
  bill_id?: string | null;
}

export interface TallyCountInput {
  shop_id: string;
  hsn_code: string;
  counted_qty: number;
  counted_on: string;
}

export interface TallySaleLine {
  bill_id: string;
  date: string;
  party_id: string;
  party_name: string;
  invoice_no: string;
  hsn_code: string;
  item_name: string;
  qty: number;
  rate_paise: number;
  taxable_paise: number;
  gst_paise: number;
  total_paise: number;
}

export interface TallyPersonSplit {
  party_id: string;
  party_name: string;
  bills_count: number;
  qty: number;
  taxable_paise: number;
  gst_paise: number;
  total_paise: number;
}

/** One line from a purchase bill (mirror of TallySaleLine). */
export interface TallyPurchaseLine {
  bill_id: string;
  date: string;
  party_id: string;
  party_name: string;      // supplier name
  invoice_no: string;
  hsn_code: string;
  item_name: string;
  qty: number;
  rate_paise: number;
  taxable_paise: number;
  gst_paise: number;
  total_paise: number;
}

/** Per-supplier totals for the Purchases view (mirror of TallyPersonSplit). */
export interface TallySupplierSplit {
  party_id: string;
  party_name: string;
  bills_count: number;
  qty: number;
  taxable_paise: number;
  gst_paise: number;
  total_paise: number;
}

export interface TallyBalanceEquation {
  opening: number;
  purchased: number;
  produced: number;
  sold: number;
  sale_returns: number;
  purchase_returns: number;
  count_adjust: number;
  book_balance: number;
  polish_out: number;
  polish_in: number;
  with_polishers: number;
  counted: number | null;
  variance: number | null;
}

export type HsnBalanceStatus = 'BALANCED' | 'SHORT' | 'OVERSOLD';

export interface HsnBalanceRow {
  hsn_code: string;
  description: string;
  opening: number;
  purchased: number;
  opening_plus_bought: number;
  produced: number;
  sold: number;
  sale_returns: number;
  purchase_returns: number;
  count_adjust: number;
  book_balance: number;
  polish_out: number;
  polish_in: number;
  with_polishers: number;
  /** True when polish received exceeds polish sent — a data error that must be shown in red. */
  polishing_data_error: boolean;
  counted: number | null;
  variance: number | null;
  status: HsnBalanceStatus;
}

export interface PolishPersonSummary {
  party_key: string;
  person_name: string;
  entries: number;
  sarees_given: number;
  sarees_received: number;
  pending_sarees: number;
  avg_unit_price_paise: number;
  total_paise: number;
}

export interface PolishSummaryResult {
  entries_count: number;
  total_sarees: number;
  total_received: number;
  pending_sarees: number;
  avg_unit_price_paise: number;
  total_cost_paise: number;
  person_summaries: PolishPersonSummary[];
}

export interface TallyResult {
  lines: TallySaleLine[];
  totals: {
    qty: number;
    taxable_paise: number;
    gst_paise: number;
    total_paise: number;
    produced_qty: number;
  };
  person_split: TallyPersonSplit[];
  /** Purchase bill lines (populated when showType is PURCHASES or ALL). */
  purchase_lines: TallyPurchaseLine[];
  purchase_totals: {
    qty: number;
    taxable_paise: number;
    gst_paise: number;
    total_paise: number;
  };
  /** Per-supplier summary chips (mirror of person_split but for purchases). */
  supplier_split: TallySupplierSplit[];
  equation: TallyBalanceEquation;
  hsn_balances: HsnBalanceRow[];
}

const normHsn = (h?: string | null) => (h ?? '').trim() || 'UNSPECIFIED';

export function matchesHsnPrefix(hsn: string | null | undefined, prefix?: string): boolean {
  const p = (prefix ?? '').trim();
  if (!p) return true;
  return normHsn(hsn).startsWith(p);
}

function inDateRange(date: string, from?: string, to?: string): boolean {
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

export function validatePolishReceive(sent: number, alreadyReceived: number, receiveNow: number): string | null {
  if (!Number.isInteger(receiveNow) || receiveNow <= 0) return 'Received quantity must be greater than zero';
  if (alreadyReceived + receiveNow > sent) {
    return `Cannot receive more than ${Math.max(0, sent - alreadyReceived)} pending sarees`;
  }
  return null;
}

export function summarizePolishing(
  shopId: string,
  entries: TallyPolishInput[],
  filter: Pick<TallyFilter, 'from' | 'to' | 'hsn' | 'partyId'> = {}
): PolishSummaryResult {
  const filtered = entries.filter(e =>
    e.shop_id === shopId &&
    inDateRange(e.date, filter.from, filter.to) &&
    matchesHsnPrefix(e.hsn_code, filter.hsn) &&
    (!filter.partyId || e.party_id === filter.partyId || e.person_name === filter.partyId)
  );

  let total_sarees = 0;
  let total_received = 0;
  let total_cost_paise = 0;
  const byPerson = new Map<string, PolishPersonSummary>();

  for (const e of filtered) {
    total_sarees += e.qty;
    total_received += e.received_qty;
    total_cost_paise += e.total_paise;
    const key = e.party_id || e.person_name.toLowerCase();
    const cur = byPerson.get(key) ?? {
      party_key: key,
      person_name: e.person_name,
      entries: 0,
      sarees_given: 0,
      sarees_received: 0,
      pending_sarees: 0,
      avg_unit_price_paise: 0,
      total_paise: 0
    };
    cur.entries += 1;
    cur.sarees_given += e.qty;
    cur.sarees_received += e.received_qty;
    cur.pending_sarees = Math.max(0, cur.sarees_given - cur.sarees_received);
    cur.total_paise += e.total_paise;
    cur.avg_unit_price_paise = cur.sarees_given > 0 ? Math.round(cur.total_paise / cur.sarees_given) : 0;
    byPerson.set(key, cur);
  }

  return {
    entries_count: filtered.length,
    total_sarees,
    total_received,
    pending_sarees: Math.max(0, total_sarees - total_received),
    avg_unit_price_paise: total_sarees > 0 ? Math.round(total_cost_paise / total_sarees) : 0,
    total_cost_paise,
    person_summaries: [...byPerson.values()].sort((a, b) => b.total_paise - a.total_paise)
  };
}

export function computeHsnBalances(params: {
  shopId: string;
  bills: TallyBillInput[];
  returns?: TallyReturnInput[];
  movements?: TallyMovementInput[];
  polishEntries?: TallyPolishInput[];
  counts?: TallyCountInput[];
  hsnPrefix?: string;
}): HsnBalanceRow[] {
  const { shopId, bills, returns = [], movements = [], polishEntries = [], counts = [], hsnPrefix } = params;

  type Acc = {
    names: Set<string>;
    opening: number;
    purchased: number;
    produced: number;
    sold: number;
    sale_returns: number;
    purchase_returns: number;
    count_adjust: number;
    polish_out: number;
    polish_in: number;
  };
  const map = new Map<string, Acc>();
  const getAcc = (hsn: string): Acc => {
    let a = map.get(hsn);
    if (!a) {
      a = {
        names: new Set<string>(),
        opening: 0,
        purchased: 0,
        produced: 0,
        sold: 0,
        sale_returns: 0,
        purchase_returns: 0,
        count_adjust: 0,
        polish_out: 0,
        polish_in: 0
      };
      map.set(hsn, a);
    }
    return a;
  };

  // Track which bills/returns already have explicit movements to avoid double counting.
  const billHasMovements = new Set<string>();
  const returnHasMovements = new Set<string>();
  for (const m of movements) {
    if (m.shop_id !== shopId) continue;
    if (m.bill_id && (m.kind === 'SALE' || m.kind === 'PURCHASE')) billHasMovements.add(m.bill_id);
    if (m.bill_id && (m.kind === 'SALE_RETURN' || m.kind === 'PURCHASE_RETURN')) returnHasMovements.add(m.bill_id);
  }

  for (const b of bills) {
    if (b.shop_id !== shopId) continue;
    if (billHasMovements.has(b.id)) continue;
    for (const it of b.items) {
      const hsn = normHsn(it.hsn_code);
      const a = getAcc(hsn);
      if (it.name) a.names.add(it.name);
      if (b.kind === 'PURCHASE') a.purchased += it.qty;
      else if (b.kind === 'SALE') a.sold += it.qty;
    }
  }

  for (const r of returns) {
    if (r.shop_id !== shopId) continue;
    if (returnHasMovements.has(r.bill_id)) continue;
    for (const it of r.items) {
      const hsn = normHsn(it.hsn_code);
      const a = getAcc(hsn);
      if (it.name) a.names.add(it.name);
      if (r.kind === 'SALE') a.sale_returns += it.qty;
      else if (r.kind === 'PURCHASE') a.purchase_returns += it.qty;
    }
  }

  // If polishEntries are provided for this shop, treat them as the source of truth for polish_out/in
  // so we never double-count POLISH_OUT/POLISH_IN movements written alongside polishing docs.
  const hasPolishEntries = polishEntries.some(p => p.shop_id === shopId);

  for (const m of movements) {
    if (m.shop_id !== shopId) continue;
    const hsn = normHsn(m.hsn_code);
    const a = getAcc(hsn);
    if (m.item_name) a.names.add(m.item_name);
    switch (m.kind) {
      case 'OPENING': a.opening += m.qty; break;
      case 'PURCHASE': a.purchased += Math.abs(m.qty); break;
      case 'PRODUCTION': a.produced += Math.abs(m.qty); break;
      case 'SALE': a.sold += Math.abs(m.qty); break;
      case 'SALE_RETURN': a.sale_returns += Math.abs(m.qty); break;
      case 'PURCHASE_RETURN': a.purchase_returns += Math.abs(m.qty); break;
      case 'POLISH_OUT': if (!hasPolishEntries) a.polish_out += Math.abs(m.qty); break;
      case 'POLISH_IN': if (!hasPolishEntries) a.polish_in += Math.abs(m.qty); break;
      case 'COUNT_ADJUST': a.count_adjust += m.qty; break;
    }
  }

  // Also include production (positive movements with OPENING/PRODUCTION-like or polish entries).
  for (const p of polishEntries) {
    if (p.shop_id !== shopId) continue;
    const hsn = normHsn(p.hsn_code);
    const a = getAcc(hsn);
    if (p.item_name) a.names.add(p.item_name);
    // Only add polish_out/in if not already tracked in movements
    a.polish_out += p.qty;
    a.polish_in += p.received_qty;
  }

  const latestCount = new Map<string, { qty: number; date: string }>();
  for (const c of counts) {
    if (c.shop_id !== shopId) continue;
    const hsn = normHsn(c.hsn_code);
    const prev = latestCount.get(hsn);
    if (!prev || c.counted_on >= prev.date) latestCount.set(hsn, { qty: c.counted_qty, date: c.counted_on });
  }

  const rows: HsnBalanceRow[] = [];
  for (const [hsn_code, a] of map.entries()) {
    if (!matchesHsnPrefix(hsn_code, hsnPrefix)) continue;
    const book_balance =
      a.opening + a.purchased + a.produced - a.sold + a.sale_returns - a.purchase_returns + a.count_adjust;
    // Never clamp: a negative value is a data error, shown in red with a warning.
    const with_polishers = a.polish_out - a.polish_in;
    const polishing_data_error = with_polishers < 0;
    const counted = latestCount.get(hsn_code)?.qty ?? null;
    const variance = counted !== null ? counted - book_balance : null;
    let status: HsnBalanceStatus = 'BALANCED';
    if (book_balance < 0) status = 'OVERSOLD';
    else if (counted !== null && counted < book_balance) status = 'SHORT';

    rows.push({
      hsn_code,
      description: [...a.names].slice(0, 3).join(', ') || 'Silk Sarees',
      opening: a.opening,
      purchased: a.purchased,
      opening_plus_bought: a.opening + a.purchased,
      produced: a.produced,
      sold: a.sold,
      sale_returns: a.sale_returns,
      purchase_returns: a.purchase_returns,
      count_adjust: a.count_adjust,
      book_balance,
      polish_out: a.polish_out,
      polish_in: a.polish_in,
      with_polishers,
      polishing_data_error,
      counted,
      variance,
      status
    });
  }

  return rows.sort((x, y) => x.hsn_code.localeCompare(y.hsn_code));
}

export function buildTally(params: {
  shopId: string;
  bills: TallyBillInput[];
  returns?: TallyReturnInput[];
  movements?: TallyMovementInput[];
  polishEntries?: TallyPolishInput[];
  counts?: TallyCountInput[];
  filter?: TallyFilter;
}): TallyResult {
  const { shopId, bills, returns = [], movements = [], polishEntries = [], counts = [], filter = {} } = params;
  const showType: TallyShowType = filter.type ?? 'ALL';

  // ── Sales lines ──────────────────────────────────────────────────────────
  const lines: TallySaleLine[] = [];
  const personMap = new Map<string, TallyPersonSplit & { billIds: Set<string> }>();

  const includeSales = showType === 'SALES' || showType === 'BOTH' || showType === 'ALL';
  if (includeSales) {
    for (const b of bills) {
      if (b.shop_id !== shopId || b.kind !== 'SALE') continue;
      if (!inDateRange(b.bill_date, filter.from, filter.to)) continue;
      if (filter.partyId && b.party_id !== filter.partyId) continue;

      const totalBillGst = b.cgst + b.sgst + b.igst;
      let allocatedGst = 0;
      const itemCount = b.items.length;

      b.items.forEach((it, idx) => {
        const lineGst =
          b.subtotal > 0
            ? idx === itemCount - 1
              ? totalBillGst - allocatedGst
              : Math.round((it.line_total * totalBillGst) / b.subtotal)
            : 0;
        allocatedGst += lineGst;

        if (!matchesHsnPrefix(it.hsn_code, filter.hsn)) return;
        const hsn_code = normHsn(it.hsn_code);
        const total_paise = it.line_total + lineGst;

        lines.push({
          bill_id: b.id,
          date: b.bill_date,
          party_id: b.party_id,
          party_name: b.party_name,
          invoice_no: b.invoice_no,
          hsn_code,
          item_name: it.name,
          qty: it.qty,
          rate_paise: it.rate,
          taxable_paise: it.line_total,
          gst_paise: lineGst,
          total_paise
        });

        const p = personMap.get(b.party_id) ?? {
          party_id: b.party_id,
          party_name: b.party_name,
          bills_count: 0,
          qty: 0,
          taxable_paise: 0,
          gst_paise: 0,
          total_paise: 0,
          billIds: new Set<string>()
        };
        p.billIds.add(b.id);
        p.bills_count = p.billIds.size;
        p.qty += it.qty;
        p.taxable_paise += it.line_total;
        p.gst_paise += lineGst;
        p.total_paise += total_paise;
        personMap.set(b.party_id, p);
      });
    }
  }

  lines.sort((a, b) => b.date.localeCompare(a.date) || b.invoice_no.localeCompare(a.invoice_no, undefined, { numeric: true }));

  const totals = lines.reduce(
    (acc, l) => ({
      qty: acc.qty + l.qty,
      taxable_paise: acc.taxable_paise + l.taxable_paise,
      gst_paise: acc.gst_paise + l.gst_paise,
      total_paise: acc.total_paise + l.total_paise,
      produced_qty: acc.produced_qty
    }),
    { qty: 0, taxable_paise: 0, gst_paise: 0, total_paise: 0, produced_qty: 0 }
  );

  // Production count (same definition as HSN Produced + Polish Received)
  const includeProduction = showType === 'PRODUCTION' || showType === 'BOTH' || showType === 'ALL';
  if (includeProduction) {
    for (const m of movements) {
      if (m.shop_id !== shopId || m.kind !== 'PRODUCTION') continue;
      if (!inDateRange(m.date, filter.from, filter.to)) continue;
      if (!matchesHsnPrefix(m.hsn_code, filter.hsn)) continue;
      totals.produced_qty += Math.abs(m.qty);
    }
    for (const p of polishEntries) {
      if (p.shop_id !== shopId) continue;
      if (!inDateRange(p.date, filter.from, filter.to)) continue;
      if (filter.partyId && p.party_id !== filter.partyId && p.person_name !== filter.partyId) continue;
      if (!matchesHsnPrefix(p.hsn_code, filter.hsn)) continue;
      totals.produced_qty += p.received_qty;
    }
  }

  // ── Purchase lines ────────────────────────────────────────────────────────
  const purchase_lines: TallyPurchaseLine[] = [];
  const supplierMap = new Map<string, TallySupplierSplit & { billIds: Set<string> }>();

  const includePurchases = showType === 'PURCHASES' || showType === 'ALL';
  // When showType is BOTH (legacy) we also include purchases for backward compat
  const includePurchasesBoth = showType === 'BOTH';

  if (includePurchases || includePurchasesBoth) {
    // For PURCHASES mode use partyId as supplier filter;
    // for ALL / BOTH apply partyId only to purchases when it matches a supplier.
    for (const b of bills) {
      if (b.shop_id !== shopId || b.kind !== 'PURCHASE') continue;
      if (!inDateRange(b.bill_date, filter.from, filter.to)) continue;
      // For pure PURCHASES mode: filter by supplier partyId
      if (showType === 'PURCHASES' && filter.partyId && b.party_id !== filter.partyId) continue;

      const totalBillGst = b.cgst + b.sgst + b.igst;
      let allocatedGst = 0;
      const itemCount = b.items.length;

      b.items.forEach((it, idx) => {
        const lineGst =
          b.subtotal > 0
            ? idx === itemCount - 1
              ? totalBillGst - allocatedGst
              : Math.round((it.line_total * totalBillGst) / b.subtotal)
            : 0;
        allocatedGst += lineGst;

        if (!matchesHsnPrefix(it.hsn_code, filter.hsn)) return;
        const hsn_code = normHsn(it.hsn_code);
        const total_paise = it.line_total + lineGst;

        purchase_lines.push({
          bill_id: b.id,
          date: b.bill_date,
          party_id: b.party_id,
          party_name: b.party_name,
          invoice_no: b.invoice_no,
          hsn_code,
          item_name: it.name,
          qty: it.qty,
          rate_paise: it.rate,
          taxable_paise: it.line_total,
          gst_paise: lineGst,
          total_paise
        });

        const s = supplierMap.get(b.party_id) ?? {
          party_id: b.party_id,
          party_name: b.party_name,
          bills_count: 0,
          qty: 0,
          taxable_paise: 0,
          gst_paise: 0,
          total_paise: 0,
          billIds: new Set<string>()
        };
        s.billIds.add(b.id);
        s.bills_count = s.billIds.size;
        s.qty += it.qty;
        s.taxable_paise += it.line_total;
        s.gst_paise += lineGst;
        s.total_paise += total_paise;
        supplierMap.set(b.party_id, s);
      });
    }
  }

  purchase_lines.sort((a, b) => b.date.localeCompare(a.date) || b.invoice_no.localeCompare(a.invoice_no, undefined, { numeric: true }));

  const purchase_totals = purchase_lines.reduce(
    (acc, l) => ({
      qty: acc.qty + l.qty,
      taxable_paise: acc.taxable_paise + l.taxable_paise,
      gst_paise: acc.gst_paise + l.gst_paise,
      total_paise: acc.total_paise + l.total_paise
    }),
    { qty: 0, taxable_paise: 0, gst_paise: 0, total_paise: 0 }
  );

  // ── HSN balances & equation (always computed from all movements, no filter date) ──
  const hsn_balances = computeHsnBalances({
    shopId,
    bills,
    returns,
    movements,
    polishEntries,
    counts,
    hsnPrefix: filter.hsn
  });

  const equation = hsn_balances.reduce<TallyBalanceEquation>(
    (eq, r) => ({
      opening: eq.opening + r.opening,
      purchased: eq.purchased + r.purchased,
      produced: eq.produced + r.produced,
      sold: eq.sold + r.sold,
      sale_returns: eq.sale_returns + r.sale_returns,
      purchase_returns: eq.purchase_returns + r.purchase_returns,
      count_adjust: eq.count_adjust + r.count_adjust,
      book_balance: eq.book_balance + r.book_balance,
      polish_out: eq.polish_out + r.polish_out,
      polish_in: eq.polish_in + r.polish_in,
      with_polishers: eq.with_polishers + r.with_polishers,
      counted: r.counted !== null ? (eq.counted ?? 0) + r.counted : eq.counted,
      variance: null
    }),
    {
      opening: 0,
      purchased: 0,
      produced: 0,
      sold: 0,
      sale_returns: 0,
      purchase_returns: 0,
      count_adjust: 0,
      book_balance: 0,
      polish_out: 0,
      polish_in: 0,
      with_polishers: 0,
      counted: null,
      variance: null
    }
  );
  if (equation.counted !== null) equation.variance = equation.counted - equation.book_balance;

  return {
    lines,
    totals,
    person_split: [...personMap.values()]
      .map(({ billIds: _b, ...rest }) => rest)
      .sort((a, b) => b.total_paise - a.total_paise),
    purchase_lines,
    purchase_totals,
    supplier_split: [...supplierMap.values()]
      .map(({ billIds: _b, ...rest }) => rest)
      .sort((a, b) => b.total_paise - a.total_paise),
    equation,
    hsn_balances
  };
}
