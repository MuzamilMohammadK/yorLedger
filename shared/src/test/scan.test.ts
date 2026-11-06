import { test } from 'node:test';
import assert from 'node:assert';
import { calculateGstinChecksum } from '../gst.js';
import { findGstins, parseAmount, findDates, parseInvoiceText, parsePaymentText, matchParty } from '../scan.js';

const g = (first14: string) => first14 + calculateGstinChecksum(first14);
const SUPPLIER = g('33AABCK1234M1Z'); // Tamil Nadu
const SHOP = g('37AAACH7409R1Z');     // Andhra Pradesh

test('amounts in Indian format', () => {
  assert.strictEqual(parseAmount('1,23,456.50'), 12345650);
  assert.strictEqual(parseAmount('2500/-'), 250000);
  assert.strictEqual(parseAmount('₹ 999'), 99900);
  assert.strictEqual(parseAmount('abc'), null);
});

test('GSTIN with OCR mistakes is corrected and checksum-verified', () => {
  const garbled = SUPPLIER.replace(/^33/, '3S').replace('AABCK', 'AA8CK'); // S for 5? no: 3S -> 35 would change state
  // Only position-safe fixes: digit slots read as letters, letter slots read as digits.
  const ocr = 'GSTIN: ' + SUPPLIER.slice(0, 7).replace('B', '8') + SUPPLIER.slice(7).replace('1', 'I');
  assert.deepStrictEqual(findGstins(ocr), [SUPPLIER]);
  assert.deepStrictEqual(findGstins('GSTIN ' + SUPPLIER.slice(0, 14) + 'Q'), []); // bad checksum rejected
  void garbled;
});

test('GSTIN split by a space is still found', () => {
  assert.deepStrictEqual(findGstins(`GSTIN ${SUPPLIER.slice(0, 7)} ${SUPPLIER.slice(7)}`), [SUPPLIER]);
});

test('dates: Indian order and month names', () => {
  assert.deepStrictEqual(findDates('Date: 07/11/2026'), ['2026-11-07']);
  assert.deepStrictEqual(findDates('Dated 7-Nov-26'), ['2026-11-07']);
  assert.deepStrictEqual(findDates('31/02/2026'), []);
});

const INVOICE = `
SRI KAMAKSHI SILK WEAVERS
12 Gandhi Road, Kanchipuram  Ph: 98401 22334
GSTIN: ${SUPPLIER}
TAX INVOICE
Invoice No: KSW/26-27/0042        Date: 05/11/2026
Bill To: Sri Lakshmi Silks  GSTIN ${SHOP}
Sl Description           HSN    Qty   Rate      Amount
1  Kanchi Pattu Saree    5007   10    12,500.00 1,25,000.00
2  Silk Dupatta          5007    5    1,200.00   6,000.00
Taxable Value                               1,31,000.00
IGST @ 5%                                       6,550.00
Grand Total                                 1,37,550.00
`;

test('invoice: number, date, GSTIN (not our own), items, totals, GST %', () => {
  const r = parseInvoiceText(INVOICE, SHOP);
  assert.deepStrictEqual(r.gstins, [SUPPLIER]);
  assert.strictEqual(r.invoiceNo, '42');
  assert.strictEqual(r.invoiceNoRaw, 'KSW/26-27/0042');
  assert.strictEqual(r.date, '2026-11-05');
  assert.deepStrictEqual(r.phones, ['9840122334']);
  assert.strictEqual(r.sellerName, 'SRI KAMAKSHI SILK WEAVERS');
  assert.deepStrictEqual(r.items, [
    { name: 'Kanchi Pattu Saree', qty: 10, rate: 1250000, amount: 12500000 },
    { name: 'Silk Dupatta', qty: 5, rate: 120000, amount: 600000 }
  ]);
  assert.strictEqual(r.taxable, 13100000);
  assert.strictEqual(r.igst, 655000);
  assert.strictEqual(r.total, 13755000);
  assert.strictEqual(r.gstPercent, 5);
});

test('invoice: CGST + SGST rate doubles to total GST %', () => {
  const r = parseInvoiceText('Bill No 7\nSaree 2 1000 2000\nCGST @ 2.5% 50\nSGST @ 2.5% 50\nTotal 2100');
  assert.strictEqual(r.gstPercent, 5);
  assert.strictEqual(r.cgst, 5000);
  assert.strictEqual(r.total, 210000);
});

test('noise lines are not items (qty x rate must match amount)', () => {
  const r = parseInvoiceText('Phone 98480 22338 12 34\nSaree 3 500 1499\nCGST 9 9 81');
  assert.deepStrictEqual(r.items, []);
});

test('cheque: number from MICR line, amount, date boxes', () => {
  const r = parsePaymentText(`STATE BANK OF INDIA  IFSC SBIN0001234
Pay  SRI LAKSHMI SILKS  or bearer
Rupees Twenty Five Thousand only   ₹ 25,000/-
07112026
"482913" 560002011: 004512" 29`);
  assert.strictEqual(r.mode, 'CHEQUE');
  assert.strictEqual(r.chequeNo, '482913');
  assert.strictEqual(r.amount, 2500000);
  assert.strictEqual(r.date, '2026-11-07');
  assert.strictEqual(r.ifsc, 'SBIN0001234');
});

test('bank screenshot: UTR, amount, date', () => {
  const r = parsePaymentText(`Transfer successful
Amount ₹ 15,500.00
UTR No: SBIN426311223344
06 Nov 2026, 4:12 PM`);
  assert.strictEqual(r.mode, 'NEFT');
  assert.strictEqual(r.utr, 'SBIN426311223344');
  assert.strictEqual(r.amount, 1550000);
  assert.strictEqual(r.date, '2026-11-06');
});

test('UPI reference (12 digits)', () => {
  assert.strictEqual(parsePaymentText('Paid ₹500\nUPI Ref No 432198765432').utr, '432198765432');
});

test('party match: GSTIN beats phone beats name', () => {
  const parties = [
    { id: 'a', name: 'Kamakshi Silk Weavers', phone: '9000000001', gstin: null },
    { id: 'b', name: 'Other', phone: '9840122334', gstin: null },
    { id: 'c', name: 'X', phone: '9000000003', gstin: SUPPLIER }
  ];
  assert.strictEqual(matchParty(parties, { gstins: [SUPPLIER], phones: ['9840122334'], sellerName: null })?.party.id, 'c');
  assert.strictEqual(matchParty(parties, { gstins: [], phones: ['9840122334'], sellerName: null })?.by, 'phone');
  assert.strictEqual(matchParty(parties, { gstins: [], phones: [], sellerName: 'SRI KAMAKSHI SILK WEAVERS' })?.party.id, 'a');
  assert.strictEqual(matchParty(parties, { gstins: [], phones: [], sellerName: 'Random Traders' }), null);
});
