// §10.6–10.7 payment validation — one discriminated union, used by the form and the save.
import type { PaymentPayload } from './types.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Returns field errors (empty object = valid).
 * CASH: amount, payment date, collected by. CHEQUE: amount, cheque date (deposit / clearing
 * may stay empty until they happen). NEFT: amount, UTR, transaction date. Amount ≤ amount due.
 */
export function validatePayment(p: PaymentPayload, amountDue: number): Record<string, string> {
  const e: Record<string, string> = {};
  if (!Number.isInteger(p.amount) || p.amount <= 0) e.amount = 'Enter the amount';
  else if (p.amount > amountDue) e.amount = 'Amount is more than the amount due';
  switch (p.mode) {
    case 'CASH':
      if (!DATE.test(p.paid_on ?? '')) e.paid_on = 'Payment date is required';
      if (!p.collected_by?.trim()) e.collected_by = 'Who collected / paid the cash?';
      break;
    case 'CHEQUE':
      if (!DATE.test(p.cheque_date ?? '')) e.cheque_date = 'Cheque date is required';
      if (p.deposit_date && !DATE.test(p.deposit_date)) e.deposit_date = 'Invalid date';
      if (p.clearing_date && !DATE.test(p.clearing_date)) e.clearing_date = 'Invalid date';
      if (p.deposit_date && p.clearing_date && p.clearing_date < p.deposit_date) e.clearing_date = 'Clearing date is before deposit date';
      break;
    case 'NEFT':
      if (!/^[A-Za-z0-9]{6,22}$/.test(p.utr_no?.trim() ?? '')) e.utr_no = 'Enter the UTR number (letters and digits)';
      if (!DATE.test(p.txn_date ?? '')) e.txn_date = 'Transaction date is required';
      break;
    default:
      e.mode = 'Choose cash, cheque or NEFT';
  }
  return e;
}
