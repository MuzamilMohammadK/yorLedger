// Bill PDF, generated on the device (no server). Standard PDF fonts have no
// rupee glyph, so amounts print as "Rs." to stay readable everywhere.
import type { InvoiceSettings, Shop, Transaction } from '@yorbalance/shared';
import { cache } from './data/cache';
import { isAndroidApp, isDesktopApp, shareFile } from './platform';
import { api } from './api';
import { formatDate } from '../i18n';

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

const INVOICE_DATE_FORMATS = ['DD/MM/YYYY', 'DD-MMM-YYYY', 'YYYY-MM-DD'] as const;

type Inv = InvoiceSettings | undefined;

export async function buildBillPdf(shop: Shop, bill: Transaction): Promise<Blob> {
  return buildBillsPdf(shop, [bill]);
}

/** §14.7 one, many or all bills in a single PDF (one bill per page). */
export async function buildBillsPdf(shop: Shop, bills: Transaction[]): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const inv = (await api.getShopSettings().catch(() => null))?.invoice_settings;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  bills.forEach((b, i) => {
    if (i) doc.addPage();
    drawBill(doc, shop, b, inv);
  });
  return doc.output('blob');
}

function drawBill(doc: any, shop: Shop, bill: Transaction, inv: Inv) {
  doc.setTextColor(0);
  // §12.5 invoice settings: prefix, date format, logo, GSTIN, tax breakdown, footer, terms.
  const fmt = INVOICE_DATE_FORMATS.includes(inv?.date_format as any) ? (inv!.date_format as typeof INVOICE_DATE_FORMATS[number]) : 'DD/MM/YYYY';
  const dmy = (iso: string) => formatDate(iso, fmt);
  const showGstin = inv?.show_gstin ?? true;
  // If bill.invoice_number already has prefix (or use bill.invoice_prefix / settings prefix for SALE only)
  const billNo = bill.invoice_number.includes(bill.invoice_prefix ?? '') && bill.invoice_prefix
    ? bill.invoice_number
    : `${bill.type === 'SALE' ? (bill.invoice_prefix ?? inv?.invoice_prefix ?? '') : (bill.invoice_prefix ?? '')}${bill.invoice_number}`;
  const W = 210, L = 14, R = W - 14;
  const party = cache.rawParty(bill.party_id);
  let y = 16;

  // Header: our shop for a sale; for purchases the bill is our own record of it.
  let nameX = L;
  if (inv?.show_logo && inv.logo_data_url) {
    try {
      doc.addImage(inv.logo_data_url, L, 8, 16, 16);
      nameX = L + 19;
    } catch { /* unreadable logo: print without it */ }
  }
  doc.setFont('helvetica', 'bold').setFontSize(16).text(shop.name, nameX, y);
  doc.setFontSize(12).text(TITLE[bill.type] ?? 'BILL', R, y, { align: 'right' });
  doc.setFont('helvetica', 'normal').setFontSize(9);
  y += 6;
  doc.splitTextToSize(shop.address || '', 110).forEach((line: string) => { doc.text(line, nameX, y); y += 4.5; });
  doc.text(showGstin ? `GSTIN: ${shop.gstin}   Ph: ${shop.phone}` : `Ph: ${shop.phone}`, nameX, y);
  doc.text(`Bill No: ${billNo}`, R, 22, { align: 'right' });
  doc.text(`Date: ${dmy(bill.invoice_date)}`, R, 27, { align: 'right' });
  y += 7;
  doc.setDrawColor(180).line(L, y, R, y);
  y += 6;

  // Party
  doc.setFont('helvetica', 'bold').setFontSize(10).text(bill.type === 'SALE' ? 'Bill To' : bill.type === 'PURCHASE' ? 'Supplier' : 'Customer', L, y);
  doc.setFont('helvetica', 'normal').setFontSize(10);
  y += 5;
  doc.text(bill.party_name, L, y);
  y += 4.5;
  doc.setFontSize(9);
  if (party?.address) doc.splitTextToSize(String(party.address), 120).forEach((line: string) => { doc.text(line, L, y); y += 4.5; });
  const phone = (bill as any).customer_phone || (bill as any).party_phone || party?.phone;
  const contact = [showGstin && party?.gstin ? `GSTIN: ${party.gstin}` : '', phone ? `Ph: ${phone}` : ''].filter(Boolean).join('   ');
  if (contact) { doc.text(contact, L, y); y += 4.5; }
  y += 4;

  // Items table
  const showHsnCol = bill.type !== 'JOB_WORK';
  const cols = showHsnCol ? [L, L + 9, 98, 135, 166, R] : [L, L + 10, 130, 150, R];
  const head = () => {
    doc.setFillColor(238, 240, 250).rect(L, y - 4.5, R - L, 7, 'F');
    doc.setFont('helvetica', 'bold').setFontSize(9);
    doc.text('#', cols[0] + 1, y);
    doc.text('Item', cols[1], y);
    if (showHsnCol) {
      doc.text('HSN/SAC', cols[2], y);
      doc.text('Qty', cols[3], y, { align: 'right' });
      doc.text('Rate', cols[4], y, { align: 'right' });
      doc.text('Amount', cols[5] - 1, y, { align: 'right' });
    } else {
      doc.text('Qty', cols[2], y, { align: 'right' });
      doc.text('Rate', cols[3] + 12, y, { align: 'right' });
      doc.text('Amount', cols[4] - 1, y, { align: 'right' });
    }
    doc.setFont('helvetica', 'normal');
    y += 7;
  };
  head();
  (bill.items ?? []).forEach((it, i) => {
    const itemMaxW = showHsnCol ? (cols[2] - cols[1] - 3) : (cols[2] - cols[1] - 14);
    const nameLines: string[] = doc.splitTextToSize(it.item_name, itemMaxW);
    if (y + nameLines.length * 4.5 > 260) { doc.addPage(); y = 20; head(); }
    doc.text(String(i + 1), cols[0] + 1, y);
    doc.text(nameLines, cols[1], y);
    if (showHsnCol) {
      doc.text(it.hsn_code || '-', cols[2], y);
      doc.text(String(it.quantity), cols[3], y, { align: 'right' });
      doc.text(money(it.rate_paise), cols[4], y, { align: 'right' });
      doc.text(money(it.amount_paise), cols[5] - 1, y, { align: 'right' });
    } else {
      doc.text(String(it.quantity), cols[2], y, { align: 'right' });
      doc.text(money(it.rate_paise), cols[3] + 12, y, { align: 'right' });
      doc.text(money(it.amount_paise), cols[4] - 1, y, { align: 'right' });
    }
    y += Math.max(1, nameLines.length) * 4.5 + 2;
  });
  doc.line(L, y - 2, R, y - 2);
  y += 3;

  // Totals
  const pct = ((bill.items?.[0]?.gst_rate_bp ?? 0) / 100).toString();
  const rows: [string, string, boolean?][] = [['Taxable value', money(bill.subtotal_paise)]];
  if (inv && !inv.show_tax_breakdown) rows.push([`GST @ ${pct}%`, money(bill.cgst_paise + bill.sgst_paise + bill.igst_paise)]);
  else if (bill.igst_paise > 0) rows.push([`IGST @ ${pct}%`, money(bill.igst_paise)]);
  else rows.push([`CGST @ ${Number(pct) / 2}%`, money(bill.cgst_paise)], [`SGST @ ${Number(pct) / 2}%`, money(bill.sgst_paise)]);
  rows.push(['Bill total', money(bill.grand_total_paise), true]);
  if ((bill.return_paise ?? 0) > 0) {
    const retTotal = bill.return_paise ?? 0;
    const rets = bill.returns ?? [];
    const retGoods = rets.length
      ? rets.reduce((s, r) => s + (r.taxable_paise ?? 0), 0)
      : (bill.grand_total_paise > 0 ? Math.round((retTotal * bill.subtotal_paise) / bill.grand_total_paise) : retTotal);
    const retTax = Math.max(0, retTotal - retGoods);
    const isInterBill = bill.igst_paise > 0;
    const retIgst = rets.length ? rets.reduce((s, r) => s + (r.igst_paise ?? 0), 0) : (isInterBill ? retTax : 0);
    const retCgst = rets.length ? rets.reduce((s, r) => s + (r.cgst_paise ?? 0), 0) : (isInterBill ? 0 : retTax - Math.floor(retTax / 2));
    const retSgst = rets.length ? rets.reduce((s, r) => s + (r.sgst_paise ?? 0), 0) : (isInterBill ? 0 : Math.floor(retTax / 2));

    rows.push(['Less: Returned goods', money(-retGoods)]);
    if (Number(pct) > 0 || retTax > 0) {
      if (isInterBill) {
        rows.push([`Less: GST on returns (IGST ${pct}%)`, money(-retIgst)]);
      } else {
        rows.push([`Less: CGST on returns (${Number(pct) / 2}%)`, money(-retCgst)]);
        rows.push([`Less: SGST on returns (${Number(pct) / 2}%)`, money(-retSgst)]);
      }
    }
    rows.push(['Total returned', money(-retTotal)]);
    rows.push(['Net bill value', money(Math.max(0, bill.grand_total_paise - retTotal)), true]);
  }
  if (bill.paid_paise > 0) rows.push(['Less: paid', money(-bill.paid_paise)]);
  if ((bill.return_paise ?? 0) > 0 || bill.paid_paise > 0) rows.push(['Balance', money(bill.pending_paise), true]);
  for (const [label, value, bold] of rows) {
    if (y > 275) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(bold ? 11 : 9.5);
    doc.text(label, 140, y, { align: 'right' });
    doc.text(value, R - 1, y, { align: 'right' });
    y += bold ? 7 : 5.5;
  }

  // Optional HSN-wise summary when bill has more than one distinct HSN
  if (showHsnCol) {
    const distinctHsns = new Set((bill.items ?? []).map(it => it.hsn_code?.trim()).filter(Boolean));
    if (distinctHsns.size > 1) {
      const groups = new Map<string, number>();
      for (const it of bill.items ?? []) {
        const key = it.hsn_code?.trim() || '-';
        groups.set(key, (groups.get(key) ?? 0) + (it.amount_paise || 0));
      }
      const totalTax = bill.cgst_paise + bill.sgst_paise + bill.igst_paise;
      const entries = Array.from(groups.entries());
      y += 3;
      if (y > 245) { doc.addPage(); y = 20; }
      doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(0);
      doc.text('HSN-wise Summary', L, y);
      y += 4;
      const hsnHead = () => {
        doc.setFillColor(242, 244, 248).rect(L, y - 4, R - L, 6, 'F');
        doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(50);
        doc.text('HSN/SAC', L + 1, y);
        doc.text('Taxable value', 145, y, { align: 'right' });
        doc.text('Tax', R - 1, y, { align: 'right' });
        doc.setFont('helvetica', 'normal').setTextColor(0);
        y += 5.5;
      };
      hsnHead();
      let allocatedTax = 0;
      entries.forEach(([hsn, taxable], idx) => {
        if (y > 270) { doc.addPage(); y = 20; hsnHead(); }
        const tax = idx === entries.length - 1
          ? totalTax - allocatedTax
          : (bill.subtotal_paise > 0 ? Math.round((totalTax * taxable) / bill.subtotal_paise) : 0);
        allocatedTax += tax;
        doc.setFontSize(8);
        doc.text(hsn, L + 1, y);
        doc.text(money(taxable), 145, y, { align: 'right' });
        doc.text(money(tax), R - 1, y, { align: 'right' });
        y += 4.5;
      });
    }
  }

  // Payment Details table (§3)
  const payments = bill.payments ?? [];
  if (payments.length > 0) {
    y += 4;
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(0);
    doc.text('Payment Details', L, y);
    y += 4.5;

    const payCols = [L, L + 28, L + 75, L + 115, R];
    const payHead = () => {
      doc.setFillColor(242, 244, 248).rect(L, y - 4, R - L, 6, 'F');
      doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(50);
      doc.text('Date', payCols[0] + 1, y);
      doc.text('Amount paid', payCols[1] + 16, y, { align: 'right' });
      doc.text('Payment mode', payCols[2], y);
      doc.text('Receipt no.', payCols[3], y);
      doc.setFont('helvetica', 'normal').setTextColor(0);
      y += 5.5;
    };
    payHead();

    const sortedPays = [...payments].sort((a, b) => (a.payment_date || '').localeCompare(b.payment_date || ''));
    sortedPays.forEach(p => {
      if (y > 265) { doc.addPage(); y = 20; payHead(); }
      const pDate = p.payment_date ? formatDate(p.payment_date, 'DD/MM/YYYY') : dmy(bill.invoice_date);
      const receiptNo = p.reference_number || (p.cheque_number ? `CHQ-${p.cheque_number}` : (p.id ? `RCP-${p.id.slice(-6).toUpperCase()}` : '—'));
      doc.setFontSize(8);
      doc.text(pDate, payCols[0] + 1, y);
      doc.text(money(p.amount_paise), payCols[1] + 16, y, { align: 'right' });
      doc.text(p.payment_mode || '—', payCols[2], y);
      doc.text(receiptNo, payCols[3], y);
      y += 4.5;
    });

    doc.line(L, y - 1, R, y - 1);
    y += 3.5;
    if (y > 270) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold').setFontSize(8.5);
    const paidTotal = payments.reduce((sum, p) => sum + (p.amount_paise || 0), 0);
    const remainingTotal = Math.max(0, bill.grand_total_paise - (bill.return_paise || 0) - paidTotal);
    doc.text(`Total paid: ${money(paidTotal)}      Remaining: ${money(remainingTotal)}`, R, y, { align: 'right' });
    y += 5;
  }

  // Footer text and terms (§12.5).
  y += 4;
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(60);
  for (const block of [inv?.terms_and_conditions, inv?.invoice_footer]) {
    if (!block?.trim()) continue;
    const lines: string[] = doc.splitTextToSize(block.trim(), R - L);
    if (y + lines.length * 4.2 > 282) { doc.addPage(); y = 20; }
    doc.text(lines, L, y);
    y += lines.length * 4.2 + 3;
  }
  doc.setFontSize(8).setTextColor(120);
  doc.text('Computer generated bill. Made with YorLedger.', W / 2, 288, { align: 'center' });
}

export async function shareBillPdf(shop: Shop, bill: Transaction) {
  const blob = await buildBillPdf(shop, bill);
  const kind = bill.type === 'SALE' ? 'Bill' : bill.type === 'PURCHASE' ? 'Purchase' : 'JobWork';
  await shareFile(blob, `${kind}-${bill.invoice_number}-${bill.party_name.replace(/[^A-Za-z0-9]+/g, '_')}.pdf`, `${kind} ${bill.invoice_number}`);
}

/** Open the bill PDF for viewing (§8.3: after saving, open the generated bill). */
export async function openBillPdf(shop: Shop, bill: Transaction) {
  const blob = await buildBillPdf(shop, bill);
  if (isAndroidApp || isDesktopApp) {
    // Android web view cannot show PDFs; the desktop app blocks new windows: share / save instead.
    return shareBillPdf(shop, bill);
  }
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Object URL for an inline preview (website / desktop). Caller revokes it. */
export async function billPdfUrl(shop: Shop, bill: Transaction): Promise<string | null> {
  if (isAndroidApp) return null;
  return URL.createObjectURL(await buildBillPdf(shop, bill));
}

/** Share / save several bills as one PDF. */
export async function shareBillsPdf(shop: Shop, bills: Transaction[]) {
  const blob = await buildBillsPdf(shop, bills);
  const date = new Date().toISOString().slice(0, 10);
  await shareFile(blob, `YorLedger-${bills.length}-bills-${date}.pdf`, `${bills.length} bills`);
}
