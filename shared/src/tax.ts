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

