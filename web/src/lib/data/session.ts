// §4 Shop registration, verification documents, approval gate and admin review — Firestore.
import {
  collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp,
  updateDoc, where, writeBatch, Unsubscribe, WriteBatch
} from 'firebase/firestore';
import {
  AdminDecisionPayload, INDIAN_STATES, REQUIRED_SHOP_DOCUMENTS, RegisterShopPayload, ResubmitShopPayload,
  SHOP_DOCUMENT_TYPES, Shop, ShopDocument, ShopDocumentType, ShopDocumentUpload, ShopVerification,
  User, UserSession, validateGSTIN, normalizePhone, validatePinCode
} from '@yorbalance/shared';
import { auth, db } from '../firebase';
import { AppError, toIso } from './util';

const shopRef = (id: string) => doc(db, 'shops', id);
const documentRef = (shopId: string, type: ShopDocumentType) => doc(db, 'shops', shopId, 'documents', type);

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
    document_url: null,
    document_name: null,
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
  const snap = await getDocs(query(collection(db, 'shops', shopId, 'verifications'), orderBy('decided_at', 'desc'), limit(1)));
  const first = snap.docs[0];
  return first ? verificationFromDoc(shopId, first.id, first.data()) : null;
}

/** All review rounds (newest first) — kept for audit history (§4.3 step 13). */
export async function verificationHistory(shopId: string): Promise<ShopVerification[]> {
  const snap = await getDocs(query(collection(db, 'shops', shopId, 'verifications'), orderBy('decided_at', 'desc')));
  return snap.docs.map(d => verificationFromDoc(shopId, d.id, d.data()));
}

/** Current signed-in user's session (user + shop). Returns null if not registered yet. */
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

// ---------------- validation ----------------

function validateShopFields(p: { gstin?: string; mobile?: string; shop_name?: string; owner_name?: string; address?: string; pin_code?: string }) {
  const fields: Record<string, string> = {};
  if (p.gstin !== undefined) {
    const g = validateGSTIN(p.gstin);
    if (!g.valid) fields.gstin = g.error ?? 'GSTIN is not valid';
  }
  if (p.mobile !== undefined && !normalizePhone(p.mobile)) fields.mobile = 'Enter a 10-digit mobile number';
  if (p.shop_name !== undefined && !p.shop_name.trim()) fields.shop_name = 'Shop name is required';
  if (p.owner_name !== undefined && !p.owner_name.trim()) fields.owner_name = 'Owner name is required';
  if (p.address !== undefined && !p.address.trim()) fields.address = 'Address is required';
  if (p.pin_code && !validatePinCode(p.pin_code)) fields.pin_code = 'Enter a 6-digit PIN code';
  if (Object.keys(fields).length) throw new AppError('Please correct the highlighted fields', 'VALIDATION_ERROR', fields);
}

function validateDocuments(uploads: ShopDocumentUpload[], alreadyStored: ShopDocumentType[] = []) {
  const fields: Record<string, string> = {};
  for (const u of uploads) {
    if (!SHOP_DOCUMENT_TYPES.includes(u.type)) fields[`documents.${u.type}`] = 'Unknown document type';
    else if (!u.data_url.startsWith('data:image/jpeg')) fields[`documents.${u.type}`] = 'Only JPEG / JPG photos are accepted';
    else if (u.data_url.length > 900_000) fields[`documents.${u.type}`] = 'Photo is too large';
  }
  for (const req of REQUIRED_SHOP_DOCUMENTS) {
    if (!uploads.some(u => u.type === req) && !alreadyStored.includes(req)) fields[`documents.${req}`] = 'This document is required';
  }
  if (Object.keys(fields).length) throw new AppError('Please add the required documents', 'VALIDATION_ERROR', fields);
}

function putDocuments(batch: WriteBatch, shopId: string, uploads: ShopDocumentUpload[]) {
  for (const u of uploads) {
    batch.set(documentRef(shopId, u.type), {
      type: u.type, data_url: u.data_url, file_name: u.file_name || `${u.type}.jpg`,
      uploaded_at: serverTimestamp(), verification_status: 'PENDING', admin_comment: null
    });
  }
}

function notifyAdmins(batch: WriteBatch, shopId: string, kind: 'SHOP_REGISTERED' | 'SHOP_RESUBMITTED', shopName: string) {
  batch.set(doc(collection(db, 'adminNotifications')), {
    kind, shop_id: shopId, shop_name: shopName, owner_uid: auth.currentUser!.uid, read_at: null, created_at: serverTimestamp()
  });
}

const stateName = (code: string) => INDIAN_STATES.find(s => s.code === code)?.name ?? '';

// ---------------- registration ----------------

export async function registerShop(payload: RegisterShopPayload): Promise<{ shop: Shop; user: User }> {
  const fbUser = auth.currentUser;
  if (!fbUser) throw new AppError('Please sign in first', 'UNAUTHORIZED');
  validateShopFields(payload);
  const uploads = payload.documents ?? [];
  validateDocuments(uploads);
  const gstin = payload.gstin.toUpperCase().trim();
  const stateCode = validateGSTIN(gstin).stateCode ?? payload.state_code;

  const shopId = doc(collection(db, 'shops')).id;
  const batch = writeBatch(db);
  batch.set(shopRef(shopId), {
    owner_uid: fbUser.uid,
    gstin,
    name: payload.shop_name.trim(),
    owner_name: payload.owner_name.trim(),
    phone: normalizePhone(payload.mobile)!,
    email: payload.email.trim().toLowerCase(),
    address: payload.address.trim(),
    state_code: stateCode,
    state: stateName(stateCode),
    pin_code: payload.pin_code?.trim() || null,
    status: 'PENDING',
    default_gst_bp: payload.default_gst_bp,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp()
  });
  batch.set(doc(db, 'users', fbUser.uid), {
    shop_id: shopId, role: 'OWNER', email: payload.email.trim().toLowerCase(), created_at: serverTimestamp()
  });
  putDocuments(batch, shopId, uploads);
  notifyAdmins(batch, shopId, 'SHOP_REGISTERED', payload.shop_name.trim());
  await batch.commit();
  const me = await getMe();
  return { shop: me!.shop!, user: me!.user };
}

/** Rejected shop corrects details / documents and goes back to PENDING (§4.3 step 12). */
export async function resubmitShop(shopId: string, payload: ResubmitShopPayload): Promise<Shop> {
  validateShopFields(payload);
  const stored = (await listShopDocuments(shopId)).map(d => d.type)
    .filter(t => !(payload.removed_documents ?? []).includes(t));
  validateDocuments(payload.documents ?? [], stored);

  const batch = writeBatch(db);
  const patch: Record<string, unknown> = { status: 'PENDING', updated_at: serverTimestamp() };
  if (payload.shop_name !== undefined) patch.name = payload.shop_name.trim();
  if (payload.owner_name !== undefined) patch.owner_name = payload.owner_name.trim();
  if (payload.gstin !== undefined) {
    patch.gstin = payload.gstin.toUpperCase().trim();
    patch.state_code = validateGSTIN(patch.gstin as string).stateCode ?? payload.state_code;
    patch.state = stateName(patch.state_code as string);
  }
  if (payload.mobile !== undefined) patch.phone = normalizePhone(payload.mobile);
  if (payload.address !== undefined) patch.address = payload.address.trim();
  if (payload.pin_code !== undefined) patch.pin_code = payload.pin_code.trim() || null;
  if (payload.default_gst_bp !== undefined) patch.default_gst_bp = payload.default_gst_bp;
  batch.update(shopRef(shopId), patch);
  putDocuments(batch, shopId, payload.documents ?? []);
  for (const t of payload.removed_documents ?? []) batch.delete(documentRef(shopId, t));
  notifyAdmins(batch, shopId, 'SHOP_RESUBMITTED', String(patch.name ?? ''));
  await batch.commit();
  const s = await getDoc(shopRef(shopId));
  return shopFromDoc(s.id, s.data()!);
}

export async function listShopDocuments(shopId: string): Promise<ShopDocument[]> {
  const snap = await getDocs(collection(db, 'shops', shopId, 'documents'));
  return snap.docs.map(d => {
    const x = d.data();
    return {
      type: d.id as ShopDocumentType, data_url: x.data_url, file_name: x.file_name,
      uploaded_at: toIso(x.uploaded_at) ?? '', verification_status: x.verification_status ?? 'PENDING',
      admin_comment: x.admin_comment ?? null
    };
  }).sort((a, b) => SHOP_DOCUMENT_TYPES.indexOf(a.type) - SHOP_DOCUMENT_TYPES.indexOf(b.type));
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
  const [documents, history] = await Promise.all([listShopDocuments(shopId), verificationHistory(shopId)]);
  return { shop, documents, history, latest_verification: history[0] ?? null };
}

async function requireAdmin() {
  const admin = auth.currentUser;
  // Force-refresh the token on admin actions so a revoked admin claim takes effect (§17.2).
  if (!admin || !(await isAdminToken(true))) throw new AppError('Administrator access required', 'FORBIDDEN_NOT_ADMIN');
  return admin;
}

/** Approve or reject one document with an optional comment (§4.6). */
export async function adminReviewDocument(shopId: string, type: ShopDocumentType, status: 'APPROVED' | 'REJECTED', comment: string | null) {
  const admin = await requireAdmin();
  if (status === 'REJECTED' && !comment?.trim()) {
    throw new AppError('Please write why this document is rejected', 'VALIDATION_ERROR', { comment: 'Required' });
  }
  const batch = writeBatch(db);
  batch.update(documentRef(shopId, type), { verification_status: status, admin_comment: comment?.trim() || null });
  batch.set(doc(collection(db, 'shops', shopId, 'audit')), {
    actor_uid: admin.uid, entity: 'shop_document', entity_id: type, action: `DOCUMENT_${status}`,
    before: null, after: { status, comment: comment?.trim() || null }, at: serverTimestamp()
  });
  await batch.commit();
}

export async function adminDecide(shopId: string, payload: AdminDecisionPayload) {
  const admin = await requireAdmin();
  if (payload.decision === 'REJECTED' && !payload.reason?.trim()) {
    throw new AppError('A reason is required to reject', 'VALIDATION_ERROR', { reason: 'Reason is required' });
  }
  const s = await getDoc(shopRef(shopId));
  if (!s.exists()) throw new AppError('Shop not found', 'NOT_FOUND');
  const d = s.data();
  const docs = await listShopDocuments(shopId);
  if (payload.decision === 'APPROVED') {
    const missing = REQUIRED_SHOP_DOCUMENTS.filter(t => !docs.some(x => x.type === t && x.verification_status === 'APPROVED'));
    if (missing.length) {
      throw new AppError('Approve the required documents first', 'DOCUMENTS_NOT_APPROVED', { documents: missing.join(', ') });
    }
  }

  const batch = writeBatch(db);
  const snapshotDetails = {
    gstin: d.gstin, name: d.name, owner_name: d.owner_name, phone: d.phone, email: d.email, address: d.address,
    state_code: d.state_code, pin_code: d.pin_code ?? null,
    documents: docs.map(x => ({ type: x.type, status: x.verification_status, comment: x.admin_comment }))
  };
  batch.set(doc(collection(db, 'shops', shopId, 'verifications')), {
    submitted_details: snapshotDetails, decision: payload.decision,
    reason: payload.reason?.trim() || null, decided_by: admin.email, decided_at: serverTimestamp()
  });
  batch.update(shopRef(shopId), {
    status: payload.decision,
    verified_at: payload.decision === 'APPROVED' ? serverTimestamp() : null,
    verified_by: admin.email,
    rejection_reason: payload.decision === 'REJECTED' ? payload.reason!.trim() : null,
    updated_at: serverTimestamp()
  });
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

export interface AdminNotification {
  id: string; kind: 'SHOP_REGISTERED' | 'SHOP_RESUBMITTED'; shop_id: string; shop_name: string; read: boolean; created_at: string;
}

/** Admin inbox: new and resubmitted shop registrations, live (§16 event 1). */
export function watchAdminNotifications(cb: (items: AdminNotification[]) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'adminNotifications'), orderBy('created_at', 'desc'), limit(50)),
    snap => cb(snap.docs.map(d => ({
      id: d.id, kind: d.data().kind, shop_id: d.data().shop_id, shop_name: d.data().shop_name,
      read: !!d.data().read_at, created_at: toIso(d.data().created_at) ?? ''
    }))),
    () => cb([])
  );
}

export async function markAdminNotificationRead(id: string) {
  await updateDoc(doc(db, 'adminNotifications', id), { read_at: serverTimestamp() });
}
