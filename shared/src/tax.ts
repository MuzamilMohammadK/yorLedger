export interface BillItemInput {
  name: string;
  qty: number;
  rate: number; // in integer paise (e.g. 100000 = Rs 1,000.00)
}

export interface TaxCalculationResult {
  subtotal: number; // in paise
  cgst: number;     // in paise
  sgst: number;     // in paise
  igst: number;     // in paise
  taxMode: 'INTRA' | 'INTER';
  grandTotal: number; // in paise
}

/**
 * Computes tax split according to HLD Section 6:
 * - subtotal = sum(qty * rate)
 * - tax = round_half_up(subtotal * gst_bp / 10000)
 * - if shop_state == party_state: intra-state (cgst + sgst)
 * - else: inter-state (igst)
 */
export function computeTax(
  items: BillItemInput[],
  gstBp: number,
  shopStateCode: string,
  partyStateCode?: string | null
): TaxCalculationResult {
  const subtotal = items.reduce((sum, item) => sum + Math.round(item.qty * item.rate), 0);

  // If party has no GSTIN/state, it defaults to the shop's state (retail intra-state)
  const isIntraState = !partyStateCode || shopStateCode === partyStateCode;
  const totalTax = Math.round((subtotal * gstBp) / 10000);

  if (isIntraState) {
    const sgst = Math.floor(totalTax / 2);
    const cgst = totalTax - sgst;
    return {
      subtotal,
      cgst,
      sgst,
      igst: 0,
      taxMode: 'INTRA',
      grandTotal: subtotal + totalTax
    };
  } else {
    return {
      subtotal,
      cgst: 0,
      sgst: 0,
      igst: totalTax,
      taxMode: 'INTER',
      grandTotal: subtotal + totalTax
    };
  }
}

/**
 * Formats paise integer to INR currency string (e.g. 150050 -> "₹1,500.50")
 */
export function formatPaiseToInr(paise: number): string {
  const rupees = paise / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(rupees);
}


export interface ReturnLineInput {
  index: number; // position of the item in the bill
  qty: number;   // quantity being returned now
}

export interface BillSnapshot {
  items: { qty: number; rate: number }[]; // rate in paise
  gstBp: number;
  taxMode: 'INTRA' | 'INTER';
  grandTotal: number;      // paise, original bill total (never changes)
  returnedTotal: number;   // paise already reduced by earlier returns
  returnedQty: Record<string, number>; // item index -> qty already returned
}

export interface ReturnCalculation {
  taxableReduction: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalReduction: number;
  newReturnedQty: Record<string, number>;
}

/**
 * Spec §9.5 / §15.4: a return reduces the bill using the bill's own item rate,
 * GST rate and tax mode snapshot. Quantity per line cannot exceed
 * original qty - already returned. When the return covers everything still
 * returnable, the reduction is exactly what remains of the grand total so
 * document-level rounding never leaves stray paise on a fully returned bill.
 */
export function computeReturn(bill: BillSnapshot, lines: ReturnLineInput[]): ReturnCalculation {
  const active = lines.filter(l => l.qty > 0);
  if (active.length === 0) throw new Error('Select at least one item and quantity to return');

  const newReturnedQty: Record<string, number> = { ...bill.returnedQty };
  let taxable = 0;
  for (const l of active) {
    const item = bill.items[l.index];
    if (!item) throw new Error(`Item ${l.index + 1} does not exist on this bill`);
    if (!Number.isInteger(l.qty)) throw new Error('Return quantity must be a whole number');
    const already = bill.returnedQty[String(l.index)] ?? 0;
    const remaining = item.qty - already;
    if (l.qty > remaining) {
      throw new Error(`Item ${l.index + 1}: only ${remaining} left to return`);
    }
    newReturnedQty[String(l.index)] = already + l.qty;
    taxable += l.qty * item.rate;
  }

  const fullyReturned = bill.items.every((it, i) => (newReturnedQty[String(i)] ?? 0) === it.qty);
  let tax = Math.round((taxable * bill.gstBp) / 10000);
  let total = taxable + tax;
  if (fullyReturned) {
    total = bill.grandTotal - bill.returnedTotal;
    tax = total - taxable;
  }

  if (bill.taxMode === 'INTRA') {
    const sgst = Math.floor(tax / 2);
    return { taxableReduction: taxable, cgst: tax - sgst, sgst, igst: 0, totalReduction: total, newReturnedQty };
  }
  return { taxableReduction: taxable, cgst: 0, sgst: 0, igst: tax, totalReduction: total, newReturnedQty };
}
