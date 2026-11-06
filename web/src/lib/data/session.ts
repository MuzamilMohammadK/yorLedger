// Shop registration, approval gate and admin review — Firestore implementation.
import {
  collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, serverTimestamp,
  where, writeBatch, Unsubscribe
} from 'firebase/firestore';
import {
  AdminDecisionPayload, RegisterShopPayload, ResubmitShopPayload, Shop, ShopVerification,
  User, UserSession, validateGSTIN, normalizePhone as sharedNormalizePhone
} from '@yorbalance/shared';
import { auth, db } from '../firebase';
import { AppError, toIso } from './util';

const shopRef = (id: string) => doc(db, 'shops', id);
const docRef = (shopId: string) => doc(db, 'shops', shopId, 'private', 'document');

export function shopFromDoc(id: string, d: Record<string, any>): Shop {
  return {
    id,
    gstin: d.gstin,
    name: d.name,
    owner_name: d.owner_name,
    phone: d.phone,
    email: d.email,
    address: d.address,
    state: d.state,
    state_code: d.state_code,
    pin_code: d.pin_code,
    logo_url: d.logo_url ?? null,
    status: d.status,
    default_gst_bp: d.default_gst_bp,
    document_url: null, // loaded on demand via getShopDocument()
    document_name: d.document_name ?? null,
    verified_at: toIso(d.verified_at),
    verified_by: d.verified_by ?? null,
    created_at: toIso(d.created_at) ?? new Date().toISOString(),
    updated_at: toIso(d.updated_at) ?? new Date().toISOString()
  };
}

function verificationFromDoc(shopId: string, id: string, d: Record<string, any>): ShopVerification {
  return {
    id, shop_id: shopId,
    submitted_details: d.submitted_details ?? {},
    decision: d.decision,
    reason: d.reason ?? null,
    decided_by: d.decided_by,
    decided_at: toIso(d.decided_at) ?? new Date().toISOString()
  };
}

async function isAdminToken(force = false): Promise<boolean> {
  if (!auth.currentUser) return false;
  const t = await auth.currentUser.getIdTokenResult(force);
  return t.claims.admin === true;
}

export async function latestVerification(shopId: string): Promise<ShopVerification | null> {
  const snap = await getDocs(query(collection(db, 'shops', shopId, 'verifications'), orderBy('decided_at', 'desc')));
  const first = snap.docs[0];
  return first ? verificationFromDoc(shopId, first.id, first.data()) : null;
}

/** Current signed-in user's session (user + shop). Returns null user if not registered yet. */
export async function getMe(): Promise<UserSession | null> {
  const fbUser = auth.currentUser;
  if (!fbUser) return null;
  if (await isAdminToken()) {
    return {
      user: { id: fbUser.uid, firebase_uid: fbUser.uid, shop_id: null, email: fbUser.email ?? '',
              role: 'ADMIN', created_at: fbUser.metadata.creationTime ?? new Date().toISOString() },
      shop: null
    };
  }
  const userSnap = await getDoc(doc(db, 'users', fbUser.uid));
  if (!userSnap.exists()) return null;
  const u = userSnap.data();
  const user: User = { id: fbUser.uid, firebase_uid: fbUser.uid, shop_id: u.shop_id, email: u.email,
                       role: 'OWNER', created_at: toIso(u.created_at) ?? new Date().toISOString() };
  const s = await getDoc(shopRef(u.shop_id));
  const shop = s.exists() ? shopFromDoc(s.id, s.data()) : null;
  return { user, shop, latest_verification: shop ? await latestVerification(shop.id) : null };
}

/** Live shop status, so approval/rejection appears instantly without reload. */
export function watchShop(shopId: string, cb: (shop: Shop | null) => void): Unsubscribe {
  return onSnapshot(shopRef(shopId), s => cb(s.exists() ? shopFromDoc(s.id, s.data()) : null));
}

function validateShopFields(p: { gstin?: string; mobile?: string; shop_name?: string; owner_name?: string }) {
  const fields: Record<string, string> = {};
  if (p.gstin !== undefined) {
    const g = validateGSTIN(p.gstin);
    if (!g.valid) fields.gstin = g.error ?? 'GSTIN is not valid';
  }
  if (p.mobile !== undefined && !sharedNormalizePhone(p.mobile)) fields.mobile = 'Enter a 10-digit mobile number';
  if (p.shop_name !== undefined && !p.shop_name.trim()) fields.shop_name = 'Shop name is required';
  if (p.owner_name !== undefined && !p.owner_name.trim()) fields.owner_name = 'Owner name is required';
  if (Object.keys(fields).length) throw new AppError('Please correct the highlighted fields', 'VALIDATION_ERROR', fields);
}

const normalizePhone = (m: string) => sharedNormalizePhone(m)!;
const stateCodeFromGstin = (g: string) => validateGSTIN(g).stateCode;

export async function registerShop(payload: RegisterShopPayload): Promise<{ shop: Shop; user: User }> {
  const fbUser = auth.currentUser;
  if (!fbUser) throw new AppError('Please sign in first', 'UNAUTHORIZED');
  validateShopFields(payload);
  const gstin = payload.gstin.toUpperCase().trim();

  const shopId = doc(collection(db, 'shops')).id;
  const batch = writeBatch(db);
  batch.set(shopRef(shopId), {
    owner_uid: fbUser.uid,
    gstin,
    name: payload.shop_name.trim(),
    owner_name: payload.owner_name.trim(),
    phone: normalizePhone(payload.mobile),
    email: payload.email.trim().toLowerCase(),
    address: payload.address.trim(),
    state_code: stateCodeFromGstin(gstin) ?? payload.state_code,
    status: 'PENDING',
    default_gst_bp: payload.default_gst_bp,
    document_name: payload.document_name ?? null,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp()
  });
  batch.set(doc(db, 'users', fbUser.uid), {
    shop_id: shopId, role: 'OWNER', email: payload.email.trim().toLowerCase(), created_at: serverTimestamp()
  });
  if (payload.document_url) {
    batch.set(docRef(shopId), { data_url: payload.document_url, name: payload.document_name ?? 'document.jpg',
                                uploaded_at: serverTimestamp() });
  }
  await batch.commit();
  const me = await getMe();
  return { shop: me!.shop!, user: me!.user };
}

export async function resubmitShop(shopId: string, payload: ResubmitShopPayload): Promise<Shop> {
  validateShopFields(payload);
  const batch = writeBatch(db);
  const patch: Record<string, unknown> = { status: 'PENDING', updated_at: serverTimestamp() };
  if (payload.shop_name !== undefined) patch.name = payload.shop_name.trim();
  if (payload.owner_name !== undefined) patch.owner_name = payload.owner_name.trim();
  if (payload.gstin !== undefined) {
    patch.gstin = payload.gstin.toUpperCase().trim();
    patch.state_code = stateCodeFromGstin(patch.gstin as string) ?? payload.state_code;
  }
  if (payload.mobile !== undefined) patch.phone = normalizePhone(payload.mobile);
  if (payload.address !== undefined) patch.address = payload.address.trim();
  if (payload.default_gst_bp !== undefined) patch.default_gst_bp = payload.default_gst_bp;
  if (payload.document_url) {
    patch.document_name = payload.document_name ?? 'document.jpg';
    batch.set(docRef(shopId), { data_url: payload.document_url, name: patch.document_name, uploaded_at: serverTimestamp() });
  }
  batch.update(shopRef(shopId), patch);
  await batch.commit();
  const s = await getDoc(shopRef(shopId));
  return shopFromDoc(s.id, s.data()!);
}

export async function getShopDocument(shopId: string): Promise<{ data_url: string; name: string } | null> {
  const s = await getDoc(docRef(shopId));
  return s.exists() ? { data_url: s.data().data_url, name: s.data().name } : null;
}

// ---------------- Admin ----------------

export async function adminListShops(status?: string): Promise<Shop[]> {
  const base = collection(db, 'shops');
  const q = status && status !== 'ALL'
    ? query(base, where('status', '==', status), orderBy('created_at', 'desc'))
    : query(base, orderBy('created_at', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => shopFromDoc(d.id, d.data()));
}

export async function adminShopDetails(shopId: string) {
  const s = await getDoc(shopRef(shopId));
  if (!s.exists()) throw new AppError('Shop not found', 'NOT_FOUND');
  const shop = shopFromDoc(s.id, s.data());
  const document = await getShopDocument(shopId);
  shop.document_url = document?.data_url ?? null;
  return { shop, latest_verification: await latestVerification(shopId) };
}

export async function adminDecide(shopId: string, payload: AdminDecisionPayload) {
  const admin = auth.currentUser;
  if (!admin || !(await isAdminToken())) throw new AppError('Administrator access required', 'FORBIDDEN_NOT_ADMIN');
  if (payload.decision === 'REJECTED' && !payload.reason?.trim()) {
    throw new AppError('A reason is required to reject', 'VALIDATION_ERROR', { reason: 'Reason is required' });
  }
  const s = await getDoc(shopRef(shopId));
  if (!s.exists()) throw new AppError('Shop not found', 'NOT_FOUND');
  const d = s.data();

  const batch = writeBatch(db);
  const vRef = doc(collection(db, 'shops', shopId, 'verifications'));
  const snapshotDetails = { gstin: d.gstin, name: d.name, owner_name: d.owner_name, phone: d.phone,
                            email: d.email, address: d.address, state_code: d.state_code };
  batch.set(vRef, { submitted_details: snapshotDetails, decision: payload.decision,
                    reason: payload.reason?.trim() || null, decided_by: admin.email, decided_at: serverTimestamp() });
  batch.update(shopRef(shopId), {
    status: payload.decision,
    verified_at: payload.decision === 'APPROVED' ? serverTimestamp() : null,
    verified_by: admin.email,
    rejection_reason: payload.decision === 'REJECTED' ? payload.reason!.trim() : null,
    updated_at: serverTimestamp()
  });
  // In-app notification for the shop owner.
  batch.set(doc(collection(db, 'users', d.owner_uid, 'notifications')), {
    kind: payload.decision === 'APPROVED' ? 'SHOP_APPROVED' : 'SHOP_REJECTED',
    payload: { shop_id: shopId, shop_name: d.name, reason: payload.reason ?? null },
    read_at: null, created_at: serverTimestamp()
  });
  batch.set(doc(collection(db, 'shops', shopId, 'audit')), {
    actor_uid: admin.uid, entity: 'shop', entity_id: shopId, action: `ADMIN_${payload.decision}`,
    before: { status: d.status }, after: { status: payload.decision, reason: payload.reason ?? null },
    at: serverTimestamp()
  });
  await batch.commit();
  return adminShopDetails(shopId);
}
