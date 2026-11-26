import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';

if (!getApps().length) {
  initializeApp();
}

export const db = getFirestore();

export type AdminRole = 'super_admin' | 'support' | 'viewer';

export interface AdminActor {
  uid: string;
  email: string;
  role: AdminRole;
}

const VALID_ROLES: AdminRole[] = ['super_admin', 'support', 'viewer'];

/**
 * Enforces Firebase custom claims for admin roles on every Cloud Function call.
 * Legacy `{ admin: true }` without `adminRole` maps to `super_admin`.
 */
export function requireAdminRole(
  request: CallableRequest<unknown>,
  allowed: AdminRole[] = ['super_admin', 'support', 'viewer']
): AdminActor {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required.');
  }
  const token = request.auth.token;
  if (token.admin !== true) {
    throw new HttpsError('permission-denied', 'Administrator privileges required.');
  }
  const rawRole = typeof token.adminRole === 'string' ? token.adminRole : 'super_admin';
  const role: AdminRole = VALID_ROLES.includes(rawRole as AdminRole) ? (rawRole as AdminRole) : 'viewer';
  if (!allowed.includes(role)) {
    throw new HttpsError('permission-denied', `Requires role: ${allowed.join(' or ')}.`);
  }
  return {
    uid: request.auth.uid,
    email: String(token.email ?? ''),
    role
  };
}

export async function writeAdminAudit(params: {
  actor: AdminActor;
  action: string;
  targetShopId?: string | null;
  targetShopName?: string | null;
  reason?: string | null;
  meta?: Record<string, unknown> | null;
}) {
  await db.collection('adminAudit').add({
    admin_uid: params.actor.uid,
    admin_email: params.actor.email,
    admin_role: params.actor.role,
    action: params.action,
    target_shop_id: params.targetShopId ?? null,
    target_shop_name: params.targetShopName ?? null,
    reason: params.reason ?? null,
    meta: params.meta ?? null,
    created_at: FieldValue.serverTimestamp()
  });
}

export function maskPhone(phone?: string | null): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length < 6) return digits ? '******' : '—';
  return `${digits.slice(0, 2)}****${digits.slice(-4)}`;
}

export function maskGstin(gstin?: string | null): string {
  const g = (gstin ?? '').trim().toUpperCase();
  if (g.length !== 15) return g ? '***************' : '—';
  return `${g.slice(0, 2)}*****${g.slice(10)}`;
}

const GSTIN_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export function validateGSTINServer(raw: string): { valid: boolean; error?: string } {
  const gstin = (raw ?? '').trim().toUpperCase();
  if (gstin.length !== 15) return { valid: false, error: 'GSTIN must be 15 characters' };
  if (!GSTIN_REGEX.test(gstin)) return { valid: false, error: 'Invalid GSTIN format' };
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const val = GSTIN_CHARS.indexOf(gstin[i]);
    const factor = i % 2 === 0 ? 1 : 2;
    const prod = val * factor;
    sum += Math.floor(prod / 36) + (prod % 36);
  }
  const checkChar = GSTIN_CHARS[(36 - (sum % 36)) % 36];
  if (gstin[14] !== checkChar) {
    return { valid: false, error: `Invalid GSTIN checksum (expected ${checkChar})` };
  }
  return { valid: true };
}

export function toIso(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (typeof (v as { toDate?: () => Date }).toDate === 'function') {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof v === 'string') return v;
  return null;
}

export function istDateStr(d = new Date()): string {
  const istMs = d.getTime() + 330 * 60 * 1000;
  return new Date(istMs).toISOString().slice(0, 10);
}
