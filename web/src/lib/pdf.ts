// Bill PDF, generated on the device (no server). Standard PDF fonts have no
// rupee glyph, so amounts print as "Rs." to stay readable everywhere.
import type { Shop, Transaction } from '@yorbalance/shared';
import { cache } from './data/cache';
import { shareFile } from './platform';

const TITLE: Record<string, string> = { SALE: 'TAX INVOICE', PURCHASE: 'PURCHASE BILL', JOB_WORK: 'JOB WORK BILL' };

function money(paise: number): string {
  const neg = paise < 0;
  const s = (Math.abs(paise) / 100).toFixed(2);
  const [w, f] = s.split('.');
  // Indian grouping: 12,34,567.00
  const last3 = w.slice(-3);
  const rest = w.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}Rs. ${rest ? `${rest},${last3}` : last3}.${f}`;
}

function dmy(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export async function buildBillPdf(shop: Shop, bill: Transaction): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, L = 14, R = W - 14;
  const party = cache.rawParty(bill.party_id);
  let y = 16;

  // Header: our shop for a sale; for purchases the bill is our own record of it.
  doc.setFont('helvetica', 'bold').setFontSize(16).text(shop.name, L, y);
  doc.setFontSize(12).text(TITLE[bill.type] ?? 'BILL', R, y, { align: 'right' });
  doc.setFont('helvetica', 'normal').setFontSize(9);
  y += 6;
  doc.splitTextToSize(shop.address || '', 110).forEach((line: string) => { doc.text(line, L, y); y += 4.5; });
  doc.text(`GSTIN: ${shop.gstin}   Ph: ${shop.phone}`, L, y);
  doc.text(`Bill No: ${bill.invoice_number}`, R, 22, { align: 'right' });
  doc.text(`Date: ${dmy(bill.invoice_date)}`, R, 27, { align: 'right' });
  y += 7;
  doc.setDrawColor(180).line(L, y, R, y);
  y += 6;

  // Party
  doc.setFont('helvetica', 'bold').setFontSize(10).text(bill.type === 'SALE' ? 'Bill To' : bill.type === 'PURCHASE' ? 'Supplier' : 'Artisan', L, y);
  doc.setFont('helvetica', 'normal').setFontSize(10);
  y += 5;
  doc.text(bill.party_name, L, y);
  y += 4.5;
  doc.setFontSize(9);
  if (party?.address) doc.splitTextToSize(String(party.address), 120).forEach((line: string) => { doc.text(line, L, y); y += 4.5; });
  const contact = [party?.gstin ? `GSTIN: ${party.gstin}` : '', party?.phone ? `Ph: ${party.phone}` : ''].filter(Boolean).join('   ');
  if (contact) { doc.text(contact, L, y); y += 4.5; }
  y += 4;

  // Items table
  const cols = [L, L + 10, 130, 150, R];
  const head = () => {
    doc.setFillColor(238, 240, 250).rect(L, y - 4.5, R - L, 7, 'F');
    doc.setFont('helvetica', 'bold').setFontSize(9);
    doc.text('#', cols[0] + 1, y); doc.text('Item', cols[1], y);
    doc.text('Qty', cols[2], y, { align: 'right' }); doc.text('Rate', cols[3] + 12, y, { align: 'right' });
    doc.text('Amount', cols[4] - 1, y, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    y += 7;
  };
  head();
  (bill.items ?? []).forEach((it, i) => {
    const nameLines: string[] = doc.splitTextToSize(it.item_name, cols[2] - cols[1] - 14);
    if (y + nameLines.length * 4.5 > 260) { doc.addPage(); y = 20; head(); }
    doc.text(String(i + 1), cols[0] + 1, y);
    doc.text(nameLines, cols[1], y);
    doc.text(String(it.quantity), cols[2], y, { align: 'right' });
    doc.text(money(it.rate_paise), cols[3] + 12, y, { align: 'right' });
    doc.text(money(it.amount_paise), cols[4] - 1, y, { align: 'right' });
    y += Math.max(1, nameLines.length) * 4.5 + 2;
  });
  doc.line(L, y - 2, R, y - 2);
  y += 3;

  // Totals
  const pct = ((bill.items?.[0]?.gst_rate_bp ?? 0) / 100).toString();
  const rows: [string, string, boolean?][] = [['Taxable value', money(bill.subtotal_paise)]];
  if (bill.igst_paise > 0) rows.push([`IGST @ ${pct}%`, money(bill.igst_paise)]);
  else rows.push([`CGST @ ${Number(pct) / 2}%`, money(bill.cgst_paise)], [`SGST @ ${Number(pct) / 2}%`, money(bill.sgst_paise)]);
  rows.push(['Bill total', money(bill.grand_total_paise), true]);
  if ((bill.return_paise ?? 0) > 0) rows.push(['Less: returns', money(-(bill.return_paise ?? 0))]);
  if (bill.paid_paise > 0) rows.push(['Less: paid', money(-bill.paid_paise)]);
  if ((bill.return_paise ?? 0) > 0 || bill.paid_paise > 0) rows.push(['Balance', money(bill.pending_paise), true]);
  for (const [label, value, bold] of rows) {
    if (y > 275) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(bold ? 11 : 9.5);
    doc.text(label, 140, y, { align: 'right' });
    doc.text(value, R - 1, y, { align: 'right' });
    y += bold ? 7 : 5.5;
  }

  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(120);
  doc.text('Computer generated bill. Made with YorLedger.', W / 2, 288, { align: 'center' });
  return doc.output('blob');
}

export async function shareBillPdf(shop: Shop, bill: Transaction) {
  const blob = await buildBillPdf(shop, bill);
  const kind = bill.type === 'SALE' ? 'Bill' : bill.type === 'PURCHASE' ? 'Purchase' : 'JobWork';
  await shareFile(blob, `${kind}-${bill.invoice_number}-${bill.party_name.replace(/[^A-Za-z0-9]+/g, '_')}.pdf`, `${kind} ${bill.invoice_number}`);
}
