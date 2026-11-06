// Turn OCR text from a photographed invoice, cheque or bank screenshot into
// suggested form values. Pure functions (no OCR here) so they are unit-tested.
// Everything returned is a SUGGESTION: the user always reviews before saving.
import { validateGSTIN } from './gst.js';

export interface ScannedItem { name: string; qty: number; rate: number /* paise */; amount: number /* paise */ }

export interface ScannedInvoice {
  gstins: string[];            // checksum-valid GSTINs found, in order of appearance
  invoiceNo: string | null;    // digits only (app invoice numbers are numeric)
  invoiceNoRaw: string | null; // as printed, e.g. "INV/26-27/0042"
  date: string | null;         // YYYY-MM-DD
  phones: string[];            // 10-digit mobiles
  sellerName: string | null;   // best guess from the top of the bill
  items: ScannedItem[];
  taxable: number | null;      // paise
  cgst: number | null;
  sgst: number | null;
  igst: number | null;
  total: number | null;        // paise
  gstPercent: number | null;   // e.g. 5
}

export interface ScannedPayment {
  mode: 'CHEQUE' | 'NEFT' | null;
  amount: number | null;  // paise
  date: string | null;    // YYYY-MM-DD
  chequeNo: string | null;
  ifsc: string | null;
  utr: string | null;
}

// ---------------------------------------------------------------- numbers

/** "1,23,456.50" / "1 500" / "2500/-" -> paise. */
export function parseAmount(s: string): number | null {
  const m = s.replace(/[₹]|rs\.?|inr/gi, '').replace(/\/-$/, '').trim().match(/^\d{1,3}(?:[,\s]\d{2,3})*(?:\.\d{1,2})?$|^\d+(?:\.\d{1,2})?$/);
  if (!m) return null;
  const clean = m[0].replace(/[,\s]/g, '');
  const [w, f = ''] = clean.split('.');
  return parseInt(w, 10) * 100 + parseInt((f + '00').slice(0, 2), 10);
}

const NUM_RE = /\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?/g;

function numbersIn(line: string): { value: number; raw: string; index: number }[] {
  const out: { value: number; raw: string; index: number }[] = [];
  for (const m of line.matchAll(NUM_RE)) {
    const v = parseAmount(m[0]);
    if (v !== null) out.push({ value: v, raw: m[0], index: m.index! });
  }
  return out;
}

// ---------------------------------------------------------------- GSTIN

const DIGIT_FIX: Record<string, string> = { O: '0', D: '0', Q: '0', I: '1', L: '1', S: '5', B: '8', Z: '2', G: '6', T: '7' };
const ALPHA_FIX: Record<string, string> = { '0': 'O', '1': 'I', '5': 'S', '8': 'B', '2': 'Z', '6': 'G', '7': 'T' };
const DIGIT_POS = new Set([0, 1, 7, 8, 9, 10]);
const ALPHA_POS = new Set([2, 3, 4, 5, 6, 11]);

/** Correct typical OCR confusions by position, then keep only checksum-valid GSTINs. */
export function findGstins(text: string): string[] {
  const found: string[] = [];
  const upper = text.toUpperCase();
  // Allow OCR to break a GSTIN with spaces: squeeze runs of [A-Z0-9 ] to candidates.
  const squeezed = upper.replace(/(?<=[A-Z0-9]) (?=[A-Z0-9])/g, '');
  for (const src of [upper, squeezed]) {
    for (const run of src.match(/[A-Z0-9]{15,}/g) ?? []) for (let off = 0; off + 15 <= run.length; off++) {
      const fixed = run.slice(off, off + 15).split('').map((c, i) =>
        DIGIT_POS.has(i) ? (DIGIT_FIX[c] ?? c) : ALPHA_POS.has(i) ? (ALPHA_FIX[c] ?? c) : i === 13 && c === '2' ? 'Z' : c
      ).join('');
      if (validateGSTIN(fixed).valid && !found.includes(fixed)) found.push(fixed);
    }
  }
  return found;
}

// ---------------------------------------------------------------- dates

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

function iso(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return dt.toISOString().slice(0, 10);
}

/** Indian order (DD/MM/YYYY) first, then "12 Oct 2026", then ISO. */
export function findDates(text: string): string[] {
  const out: string[] = [];
  const push = (d: string | null) => { if (d && !out.includes(d)) out.push(d); };
  for (const m of text.matchAll(/\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})\b/g)) push(iso(+m[3], +m[2], +m[1]));
  for (const m of text.matchAll(/\b(\d{1,2})[\s\-.]*([A-Za-z]{3,9})[\s\-.,]*(\d{2}|\d{4})\b/g)) {
    const mon = MONTHS[m[2].toLowerCase().slice(0, 4)] ?? MONTHS[m[2].toLowerCase().slice(0, 3)];
    if (mon) push(iso(+m[3], mon, +m[1]));
  }
  for (const m of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) push(iso(+m[1], +m[2], +m[3]));
  return out;
}

function dateNear(lines: string[], label: RegExp): string | null {
  for (const l of lines) if (label.test(l)) { const d = findDates(l)[0]; if (d) return d; }
  return null;
}

// ---------------------------------------------------------------- phones

export function findPhones(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/(?:\+?91[\s-]?)?\b([6-9]\d{4})[\s-]?(\d{5})\b/g)) {
    const p = m[1] + m[2];
    if (!out.includes(p)) out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------- invoices

const GRAND_TOTAL = /\b(grand\s*total|total\s*amount|net\s*amount|amount\s*payable|invoice\s*(total|value)|bill\s*amount)\b/i;
const SKIP_ITEM_LINE = /\b(total|cgst|sgst|igst|gst|tax|round|discount|balance|paid|amount in words|rupees|bank|ifsc|a\/c)\b/i;

function lastAmount(line: string): number | null {
  const nums = numbersIn(line).filter(n => !/%/.test(line.slice(n.index + n.raw.length, n.index + n.raw.length + 1)));
  return nums.length ? nums[nums.length - 1].value : null;
}

function amountOnLabel(lines: string[], label: RegExp): number | null {
  // Take the last matching line (totals sit at the bottom); amount is the last number on it.
  for (let i = lines.length - 1; i >= 0; i--) if (label.test(lines[i])) {
    const v = lastAmount(lines[i]);
    if (v !== null && v > 0) return v;
  }
  return null;
}

/** qty × rate ≈ amount on one line => an item row. */
function parseItemLine(line: string): ScannedItem | null {
  if (SKIP_ITEM_LINE.test(line)) return null;
  const nums = numbersIn(line);
  if (nums.length < 3) return null;
  for (let a = nums.length - 1; a >= 2; a--) {
    for (let r = a - 1; r >= 1; r--) {
      for (let q = r - 1; q >= 0; q--) {
        const qty = nums[q].value / 100;
        const rate = nums[r].value;
        const amt = nums[a].value;
        if (!Number.isInteger(qty) || qty <= 0 || qty > 100000 || amt <= 0) continue;
        // Only rate rounding may differ: at most 1 paisa per piece.
        if (Math.abs(qty * rate - amt) <= qty) {
          let name = line.slice(0, nums[q].index)
            .replace(/^\s*\d{1,3}[.)]?\s+/, '')      // serial number
            .replace(/\b\d{4,8}\b/g, '')            // HSN / SAC code
            .replace(/[|:;_*]+/g, ' ')
            .replace(/\s{2,}/g, ' ')
            .trim();
          if (!/[A-Za-z]{2,}/.test(name)) continue;
          return { name, qty, rate, amount: amt };
        }
      }
    }
  }
  return null;
}

export function parseInvoiceText(text: string, ownGstin?: string | null): ScannedInvoice {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const gstins = findGstins(text).filter(g => g !== ownGstin?.toUpperCase());

  // Invoice number: the label line, last run of digits ("INV/26-27/0042" -> 42).
  let invoiceNoRaw: string | null = null;
  for (const l of lines) {
    const m = l.match(/\b(?:invoice|inv|bill)\s*(?:no|number|#)?\.?\s*[:\-#]?\s*([A-Z0-9][A-Z0-9/\-]*)/i);
    if (m && /\d/.test(m[1])) { invoiceNoRaw = m[1]; break; }
  }
  const digitRuns = invoiceNoRaw?.match(/\d+/g);
  const invoiceNo = digitRuns ? String(parseInt(digitRuns[digitRuns.length - 1], 10) || '') || null : null;

  const date = dateNear(lines, /\b(date|dated|dt)\b/i) ?? findDates(text)[0] ?? null;

  const items = lines.map(parseItemLine).filter((x): x is ScannedItem => !!x);
  const cgst = amountOnLabel(lines, /\bc\s?gst\b/i);
  const sgst = amountOnLabel(lines, /\b(s|u)\s?gst\b/i);
  const igst = amountOnLabel(lines, /\bi\s?gst\b/i);
  const taxable = amountOnLabel(lines, /\b(taxable\s*(value|amount)|sub\s*total|assessable)\b/i)
    ?? (items.length ? items.reduce((s, i) => s + i.amount, 0) : null);
  const total = amountOnLabel(lines, GRAND_TOTAL) ?? amountOnLabel(lines, /^\s*total\b/i);

  // GST %: printed rate, else derived from tax / taxable.
  let gstPercent: number | null = null;
  const rateM = text.match(/(?:c\s?gst|s\s?gst)\s*@?\s*(\d{1,2}(?:\.\d)?)\s*%/i);
  const igstM = text.match(/i\s?gst\s*@?\s*(\d{1,2}(?:\.\d)?)\s*%/i);
  if (igstM) gstPercent = parseFloat(igstM[1]);
  else if (rateM) gstPercent = parseFloat(rateM[1]) * 2;
  else if (taxable) {
    const tax = (cgst ?? 0) + (sgst ?? 0) + (igst ?? 0);
    if (tax > 0) {
      const p = (tax / taxable) * 100;
      gstPercent = [0, 5, 12, 18, 28].reduce((best, v) => (Math.abs(v - p) < Math.abs(best - p) ? v : best), 5);
    }
  }

  const sellerName = lines.find(l =>
    /[A-Za-z]{3,}/.test(l) && !/(tax\s*invoice|invoice|bill\s*of\s*supply|gstin|original|duplicate|copy|phone|mobile|ph\b|email|@)/i.test(l)
  ) ?? null;

  return { gstins, invoiceNo, invoiceNoRaw, date, phones: findPhones(text), sellerName, items,
           taxable, cgst, sgst, igst, total, gstPercent };
}

// ---------------------------------------------------------------- cheques / bank proofs

export function parsePaymentText(text: string): ScannedPayment {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const upper = text.toUpperCase();
  const ifsc = upper.match(/\b[A-Z]{4}0[A-Z0-9]{6}\b/)?.[0] ?? null;

  // UTR / reference: NEFT UTR (bank code + digits), or 12-digit UPI / IMPS reference.
  let utr: string | null = null;
  for (const l of lines) {
    if (/\b(utr|ref(erence)?|txn|transaction)\b/i.test(l)) {
      const m = l.toUpperCase().match(/\b([A-Z]{4}[A-Z0-9]{12,18}|\d{12,22})\b/);
      if (m) { utr = m[1]; break; }
    }
  }
  if (!utr) utr = upper.match(/\b[A-Z]{4}[RH]?\d{11,17}\b/)?.[0] ?? null;

  // Cheque number: 6-digit group on the MICR line (bottom of the cheque).
  let chequeNo: string | null = null;
  const isCheque = /\b(cheque|chq|pay\s|or\s*bearer|a\/c\s*payee)\b/i.test(text) || /\b\d{6}\b.*\b\d{9}\b/.test(text);
  if (isCheque) {
    for (let i = lines.length - 1; i >= 0 && !chequeNo; i--) {
      const m = lines[i].match(/(?:^|[^\d])(\d{6})(?:[^\d]|$)/);
      if (m) chequeNo = m[1];
    }
  }

  // Amount: labelled first, else the "₹ 25,000/-" style, else the largest amount.
  let amount: number | null = null;
  for (const l of lines) {
    if (/(amount|paid|sent|credited|debited|rs\.?|₹|inr)/i.test(l)) {
      const nums = numbersIn(l).filter(n => n.value >= 100 && !/^\d{6,}$/.test(n.raw));
      if (nums.length) { amount = nums[0].value; break; }
    }
  }

  // Cheque date boxes are often read as 8 digits: DDMMYYYY.
  let date: string | null = findDates(text)[0] ?? null;
  if (!date) {
    const m = text.match(/\b(\d{2})(\d{2})(20\d{2})\b/);
    if (m) date = iso(+m[3], +m[2], +m[1]);
  }

  return { mode: chequeNo && !utr ? 'CHEQUE' : utr ? 'NEFT' : chequeNo ? 'CHEQUE' : null, amount, date, chequeNo, ifsc, utr };
}

// ---------------------------------------------------------------- party matching

export interface PartyLike { id: string; name: string; gstin?: string | null; phone: string; additional_phones?: string[] }

function words(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
    .filter(w => w.length > 2 && !['and', 'the', 'pvt', 'ltd', 'private', 'limited', 'sons', 'shop', 'store', 'stores'].includes(w));
}

/** Best existing party for a scan: GSTIN (exact) > phone (exact) > name words. */
export function matchParty<P extends PartyLike>(parties: P[], scan: { gstins: string[]; phones: string[]; sellerName: string | null }):
  { party: P; by: 'gstin' | 'phone' | 'name' } | null {
  for (const g of scan.gstins) {
    const p = parties.find(x => x.gstin?.toUpperCase() === g);
    if (p) return { party: p, by: 'gstin' };
  }
  for (const ph of scan.phones) {
    const p = parties.find(x => x.phone === ph || (x.additional_phones ?? []).includes(ph));
    if (p) return { party: p, by: 'phone' };
  }
  if (scan.sellerName) {
    const target = words(scan.sellerName);
    let best: { p: P; score: number } | null = null;
    for (const p of parties) {
      const w = words(p.name);
      const common = w.filter(x => target.includes(x)).length;
      const score = common / Math.max(w.length, target.length, 1);
      if (common >= 1 && score >= 0.5 && (!best || score > best.score)) best = { p, score };
    }
    if (best) return { party: best.p, by: 'name' };
  }
  return null;
}
