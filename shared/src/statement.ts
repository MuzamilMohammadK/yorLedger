// Party ledger statement (§7.5 "open party ledger", §8.1 Party view).
// Sign convention: positive balance = the party owes the shop.

export interface StmtBill { id: string; kind: 'SALE' | 'PURCHASE' | 'JOB_WORK'; invoice_no: string; date: string; grand_total: number; created?: string }
export interface StmtPayment { id: string; bill_id: string; date: string; amount: number; mode: string; created?: string }
export interface StmtReturn { id: string; bill_id: string; date: string; total: number; created?: string }

export interface StatementRow {
  id: string; date: string; type: 'BILL' | 'PAYMENT' | 'RETURN';
  kind: 'SALE' | 'PURCHASE' | 'JOB_WORK'; invoice_no: string; detail?: string;
  amount: number;   // signed paise effect on the balance
  balance: number;  // running balance after this row
  bill_id: string;
}

export function partyStatement(bills: StmtBill[], payments: StmtPayment[], returns: StmtReturn[]): StatementRow[] {
  const byId = new Map(bills.map(b => [b.id, b]));
  const rows: Omit<StatementRow, 'balance'>[] = [];
  for (const b of bills) {
    rows.push({ id: b.id, date: b.date, type: 'BILL', kind: b.kind, invoice_no: b.invoice_no, bill_id: b.id,
                amount: b.kind === 'SALE' ? b.grand_total : -b.grand_total });
  }
  for (const p of payments) {
    const b = byId.get(p.bill_id);
    if (!b) continue;
    rows.push({ id: p.id, date: p.date, type: 'PAYMENT', kind: b.kind, invoice_no: b.invoice_no, bill_id: b.id, detail: p.mode,
                amount: b.kind === 'SALE' ? -p.amount : p.amount });
  }
  for (const r of returns) {
    const b = byId.get(r.bill_id);
    if (!b) continue;
    rows.push({ id: r.id, date: r.date, type: 'RETURN', kind: b.kind, invoice_no: b.invoice_no, bill_id: b.id,
                amount: b.kind === 'SALE' ? -r.total : r.total });
  }
  const order = { BILL: 0, RETURN: 1, PAYMENT: 2 };
  rows.sort((a, b) => a.date.localeCompare(b.date) || order[a.type] - order[b.type]);
  let bal = 0;
  return rows.map(r => ({ ...r, balance: (bal += r.amount) }));
}
