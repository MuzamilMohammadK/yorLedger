import { Timestamp } from 'firebase/firestore';

/** Error shape shared by every data function (spec §14: code, message, fields). */
export class AppError extends Error {
  code: string;
  fields?: Record<string, string>;
  status: number;
  constructor(message: string, code: string, fields?: Record<string, string>, status = 400) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.fields = fields;
    this.status = status;
  }
}

export function toIso(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (typeof v === 'string') return v;
  if (v instanceof Date) return v.toISOString();
  return null;
}

/** Today's date in Asia/Kolkata as YYYY-MM-DD (spec: display time zone is IST). */
export function todayIST(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

/** Rupees (may be fractional, from a form input) -> integer paise without float drift. */
export function rupeesToPaise(r: number | string): number {
  const s = String(r).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new AppError('Enter a valid amount', 'VALIDATION_ERROR', { amount: 'Invalid amount' });
  const [whole, frac = ''] = s.split('.');
  return parseInt(whole, 10) * 100 + parseInt((frac + '00').slice(0, 2), 10);
}
