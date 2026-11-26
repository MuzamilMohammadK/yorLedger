import { FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import {
  db,
  requireAdminRole,
  writeAdminAudit,
  maskPhone,
  maskGstin,
  validateGSTINServer,
  toIso,
  istDateStr
} from './auth';

function addDaysIso(isoDate: string, delta: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export const adminGetOverview = onCall({ cors: true }, async request => {
  requireAdminRole(request, ['super_admin', 'support', 'viewer']);

  const today = istDateStr();
  const d7 = addDaysIso(today, -6);
  const d30 = addDaysIso(today, -29);
  const d60 = addDaysIso(today, -59);
  const monthStart = `${today.slice(0, 7)}-01`;
  const prevMonthDate = new Date(`${monthStart}T00:00:00Z`);
  prevMonthDate.setUTCMonth(prevMonthDate.getUTCMonth() - 1);
  const prevMonthStart = prevMonthDate.toISOString().slice(0, 10);

  const shopsSnap = await db.collection('shops').get();
  const nonTestShops = shopsSnap.docs.filter(d => d.data().is_test_shop !== true);
  const testShopIds = new Set(shopsSnap.docs.filter(d => d.data().is_test_shop === true).map(d => d.id));

  let pending = 0;
  let approved = 0;
  let rejected = 0;
  let suspended = 0;
  let signupsToday = 0;
  let signups7d = 0;
  let signups30d = 0;
  let prevSignups30d = 0;

  const signupBuckets = new Map<string, number>();
  for (let i = 13; i >= 0; i--) {
    signupBuckets.set(addDaysIso(today, -i), 0);
  }

  const ownerUids = new Map<string, string>();
  for (const doc of nonTestShops) {
    const s = doc.data();
    if (s.status === 'PENDING') pending++;
    else if (s.status === 'APPROVED') approved++;
    else if (s.status === 'REJECTED') rejected++;
    else if (s.status === 'SUSPENDED') suspended++;

    if (s.owner_uid) ownerUids.set(String(s.owner_uid), doc.id);

    const createdIso = toIso(s.created_at) ?? '';
    const createdDay = createdIso.slice(0, 10);
    if (createdDay === today) signupsToday++;
    if (createdDay >= d7 && createdDay <= today) signups7d++;
    if (createdDay >= d30 && createdDay <= today) signups30d++;
    else if (createdDay >= d60 && createdDay < d30) prevSignups30d++;

    if (signupBuckets.has(createdDay)) {
      signupBuckets.set(createdDay, (signupBuckets.get(createdDay) ?? 0) + 1);
    }
  }

  // Active & inactive shops via Auth lastSignInTime (aggregated counts only)
  let activeDaily = 0;
  let activeWeekly = 0;
  let activeMonthly = 0;
  let inactive30d = 0;
  const authLastSignIn = new Map<string, string>();

  let pageToken: string | undefined;
  do {
    const page = await getAuth().listUsers(1000, pageToken);
    for (const u of page.users) {
      if (u.metadata.lastSignInTime) {
        authLastSignIn.set(u.uid, new Date(u.metadata.lastSignInTime).toISOString().slice(0, 10));
      }
    }
    pageToken = page.pageToken;
  } while (pageToken);

  for (const doc of nonTestShops) {
    const s = doc.data();
    if (s.status !== 'APPROVED') continue;
    const lastDay = authLastSignIn.get(String(s.owner_uid ?? '')) ?? (toIso(s.last_active_at)?.slice(0, 10) ?? '');
    if (!lastDay || lastDay < d30) {
      inactive30d++;
    } else {
      activeMonthly++;
      if (lastDay >= d7) activeWeekly++;
      if (lastDay === today) activeDaily++;
    }
  }

  // Bills counts & daily trend (selecting ONLY bill_date, never financial amounts)
  let billsToday = 0;
  let billsMonth = 0;
  let prevBillsMonth = 0;
  const billBuckets = new Map<string, number>();
  for (let i = 13; i >= 0; i--) {
    billBuckets.set(addDaysIso(today, -i), 0);
  }
  const shopsWithBills = new Set<string>();

  for (const doc of nonTestShops) {
    if (testShopIds.has(doc.id)) continue;
    const billsSnap = await db.collection(`shops/${doc.id}/bills`).select('bill_date', 'deleted_at').get();
    let hasActiveBill = false;
    for (const b of billsSnap.docs) {
      const bd = b.data();
      if (bd.deleted_at) continue;
      hasActiveBill = true;
      const day = String(bd.bill_date ?? '').slice(0, 10);
      if (day === today) billsToday++;
      if (day >= monthStart && day <= today) billsMonth++;
      else if (day >= prevMonthStart && day < monthStart) prevBillsMonth++;
      if (billBuckets.has(day)) {
        billBuckets.set(day, (billBuckets.get(day) ?? 0) + 1);
      }
    }
    if (hasActiveBill) shopsWithBills.add(doc.id);
  }

  return {
    total_shops: nonTestShops.length,
    pending_verification: pending,
    approved_shops: approved,
    rejected_shops: rejected,
    suspended_shops: suspended,
    signups_today: signupsToday,
    signups_7d: signups7d,
    signups_30d: signups30d,
    active_daily: activeDaily,
    active_weekly: activeWeekly,
    active_monthly: activeMonthly,
    bills_today: billsToday,
    bills_month: billsMonth,
    inactive_30d: inactive30d,
    prev_signups_30d: prevSignups30d,
    prev_bills_month: prevBillsMonth,
    signups_series: Array.from(signupBuckets.entries()).map(([date, count]) => ({ date, count })),
    bills_series: Array.from(billBuckets.entries()).map(([date, count]) => ({ date, count })),
    funnel: {
      submitted: nonTestShops.length,
      approved,
      first_bill: shopsWithBills.size
    }
  };
});

export const adminListShops = onCall({ cors: true }, async request => {
  requireAdminRole(request, ['super_admin', 'support', 'viewer']);
  const snap = await db.collection('shops').orderBy('created_at', 'desc').get();

  const gstinCounts = new Map<string, number>();
  for (const doc of snap.docs) {
    const g = String(doc.data().gstin ?? '').trim().toUpperCase();
    if (g) gstinCounts.set(g, (gstinCounts.get(g) ?? 0) + 1);
  }

  const shops = snap.docs.map(doc => {
    const d = doc.data();
    const gstin = String(d.gstin ?? '').trim().toUpperCase();
    const gv = validateGSTINServer(gstin);
    return {
      id: doc.id,
      name: String(d.name ?? ''),
      owner_name: String(d.owner_name ?? ''),
      masked_phone: maskPhone(d.phone),
      masked_gstin: maskGstin(gstin),
      email: String(d.email ?? ''),
      state_code: String(d.state_code ?? ''),
      state: d.state ?? '',
      status: String(d.status ?? 'PENDING'),
      is_test_shop: Boolean(d.is_test_shop),
      gstin_valid: gv.valid,
      gstin_error: gv.error ?? null,
      duplicate_gstin: (gstinCounts.get(gstin) ?? 0) > 1,
      plan: String(d.plan ?? 'FREE'),
      created_at: toIso(d.created_at) ?? new Date().toISOString(),
      updated_at: toIso(d.updated_at) ?? new Date().toISOString(),
      last_active_at: toIso(d.last_active_at),
      verified_at: toIso(d.verified_at),
      verified_by: d.verified_by ?? null
    };
  });

  return { shops };
});

export const adminGetShopDetail = onCall({ cors: true }, async request => {
  requireAdminRole(request, ['super_admin', 'support', 'viewer']);
  const shopId = String((request.data as { shopId?: string })?.shopId ?? '').trim();
  if (!shopId) throw new HttpsError('invalid-argument', 'shopId is required');

  const doc = await db.doc(`shops/${shopId}`).get();
  if (!doc.exists) throw new HttpsError('not-found', 'Shop not found');
  const d = doc.data()!;
  const gstin = String(d.gstin ?? '').trim().toUpperCase();
  const gv = validateGSTINServer(gstin);

  const [dupSnap, billsCount, partiesCount, itemsCount, docsSnap, verifSnap] = await Promise.all([
    gstin ? db.collection('shops').where('gstin', '==', gstin).count().get() : Promise.resolve(null),
    db.collection(`shops/${shopId}/bills`).count().get(),
    db.collection(`shops/${shopId}/parties`).count().get(),
    db.collection(`shops/${shopId}/stockMovements`).count().get(),
    db.collection(`shops/${shopId}/documents`).get(),
    db.collection(`shops/${shopId}/verifications`).orderBy('decided_at', 'desc').get()
  ]);

  let lastActive = toIso(d.last_active_at);
  if (!lastActive && d.owner_uid) {
    try {
      const u = await getAuth().getUser(String(d.owner_uid));
      if (u.metadata.lastSignInTime) lastActive = new Date(u.metadata.lastSignInTime).toISOString();
    } catch { /* ignore */ }
  }

  return {
    id: doc.id,
    name: String(d.name ?? ''),
    owner_name: String(d.owner_name ?? ''),
    masked_phone: maskPhone(d.phone),
    masked_gstin: maskGstin(gstin),
    email: String(d.email ?? ''),
    address: String(d.address ?? ''),
    state_code: String(d.state_code ?? ''),
    state: d.state ?? '',
    pin_code: d.pin_code ?? null,
    default_gst_bp: Number(d.default_gst_bp ?? 500),
    status: String(d.status ?? 'PENDING'),
    is_test_shop: Boolean(d.is_test_shop),
    gstin_valid: gv.valid,
    gstin_error: gv.error ?? null,
    duplicate_gstin: (dupSnap?.data().count ?? 0) > 1,
    plan: String(d.plan ?? 'FREE'),
    rejection_reason: d.rejection_reason ?? null,
    suspension_reason: d.suspension_reason ?? null,
    admin_notes: d.admin_notes ?? null,
    feature_flags: (d.feature_flags as Record<string, boolean>) ?? {},
    created_at: toIso(d.created_at) ?? new Date().toISOString(),
    updated_at: toIso(d.updated_at) ?? new Date().toISOString(),
    last_active_at: lastActive,
    verified_at: toIso(d.verified_at),
    verified_by: d.verified_by ?? null,
    counts: {
      bills: billsCount.data().count,
      parties: partiesCount.data().count,
      items: itemsCount.data().count
    },
    documents: docsSnap.docs.map(x => {
      const xd = x.data();
      return {
        type: x.id,
        data_url: String(xd.data_url ?? ''),
        file_name: String(xd.file_name ?? `${x.id}.jpg`),
        uploaded_at: toIso(xd.uploaded_at) ?? '',
        verification_status: xd.verification_status ?? 'PENDING',
        admin_comment: xd.admin_comment ?? null
      };
    }),
    history: verifSnap.docs.map(x => {
      const xd = x.data();
      return {
        id: x.id,
        decision: String(xd.decision ?? ''),
        reason: xd.reason ?? null,
        decided_by: String(xd.decided_by ?? ''),
        decided_at: toIso(xd.decided_at) ?? ''
      };
    })
  };
});

export const adminRevealSensitive = onCall({ cors: true }, async request => {
  const actor = requireAdminRole(request, ['super_admin', 'support']);
  const shopId = String((request.data as { shopId?: string })?.shopId ?? '').trim();
  if (!shopId) throw new HttpsError('invalid-argument', 'shopId is required');

  const doc = await db.doc(`shops/${shopId}`).get();
  if (!doc.exists) throw new HttpsError('not-found', 'Shop not found');
  const d = doc.data()!;

  await writeAdminAudit({
    actor,
    action: 'REVEAL_SENSITIVE',
    targetShopId: shopId,
    targetShopName: String(d.name ?? ''),
    reason: 'Admin revealed masked phone and GSTIN'
  });

  return {
    phone: String(d.phone ?? ''),
    gstin: String(d.gstin ?? '')
  };
});

export const adminReviewDocument = onCall({ cors: true }, async request => {
  const actor = requireAdminRole(request, ['super_admin', 'support']);
  const { shopId, type, status, comment } = request.data as {
    shopId?: string;
    type?: string;
    status?: 'APPROVED' | 'REJECTED';
    comment?: string | null;
  };
  if (!shopId || !type || (status !== 'APPROVED' && status !== 'REJECTED')) {
    throw new HttpsError('invalid-argument', 'Invalid document review payload');
  }
  if (status === 'REJECTED' && !comment?.trim()) {
    throw new HttpsError('invalid-argument', 'Comment is required to reject a document');
  }

  const shopDoc = await db.doc(`shops/${shopId}`).get();
  if (!shopDoc.exists) throw new HttpsError('not-found', 'Shop not found');

  await db.doc(`shops/${shopId}/documents/${type}`).update({
    verification_status: status,
    admin_comment: comment?.trim() || null
  });

  await writeAdminAudit({
    actor,
    action: `DOCUMENT_${status}`,
    targetShopId: shopId,
    targetShopName: String(shopDoc.data()?.name ?? ''),
    reason: comment?.trim() || null,
    meta: { document_type: type }
  });

  return { ok: true };
});

export const adminDecideShop = onCall({ cors: true }, async request => {
  const actor = requireAdminRole(request, ['super_admin', 'support']);
  const { shopId, decision, reason } = request.data as {
    shopId?: string;
    decision?: 'APPROVED' | 'REJECTED' | 'SUSPENDED' | 'REACTIVATED';
    reason?: string;
  };
  if (!shopId || !decision || !['APPROVED', 'REJECTED', 'SUSPENDED', 'REACTIVATED'].includes(decision)) {
    throw new HttpsError('invalid-argument', 'Valid shopId and decision are required');
  }
  if ((decision === 'REJECTED' || decision === 'SUSPENDED') && !reason?.trim()) {
    throw new HttpsError('invalid-argument', 'A reason is required for this action');
  }

  const shopRef = db.doc(`shops/${shopId}`);
  const shopSnap = await shopRef.get();
  if (!shopSnap.exists) throw new HttpsError('not-found', 'Shop not found');
  const d = shopSnap.data()!;

  const nextStatus = decision === 'REACTIVATED' ? 'APPROVED' : decision;
  const batch = db.batch();

  batch.update(shopRef, {
    status: nextStatus,
    verified_at: nextStatus === 'APPROVED' ? FieldValue.serverTimestamp() : d.verified_at ?? null,
    verified_by: actor.email || actor.uid,
    rejection_reason: decision === 'REJECTED' ? reason!.trim() : null,
    suspension_reason: decision === 'SUSPENDED' ? reason!.trim() : null,
    updated_at: FieldValue.serverTimestamp()
  });

  batch.set(db.collection(`shops/${shopId}/verifications`).doc(), {
    submitted_details: { name: d.name, gstin: maskGstin(d.gstin), owner_name: d.owner_name },
    decision,
    reason: reason?.trim() || null,
    decided_by: actor.email || actor.uid,
    decided_at: FieldValue.serverTimestamp()
  });

  if (d.owner_uid) {
    batch.set(db.collection(`users/${d.owner_uid}/notifications`).doc(), {
      kind: `SHOP_${decision}`,
      payload: { shop_id: shopId, shop_name: d.name, reason: reason?.trim() || null },
      read_at: null,
      created_at: FieldValue.serverTimestamp()
    });
  }

  await batch.commit();

  await writeAdminAudit({
    actor,
    action: `SHOP_${decision}`,
    targetShopId: shopId,
    targetShopName: String(d.name ?? ''),
    reason: reason?.trim() || null
  });

  return { ok: true, status: nextStatus };
});

export const adminUpdateShopMeta = onCall({ cors: true }, async request => {
  const actor = requireAdminRole(request, ['super_admin', 'support']);
  const { shopId, is_test_shop, admin_notes, feature_flags, plan } = request.data as {
    shopId?: string;
    is_test_shop?: boolean;
    admin_notes?: string | null;
    feature_flags?: Record<string, boolean>;
    plan?: string;
  };
  if (!shopId) throw new HttpsError('invalid-argument', 'shopId is required');
  const shopRef = db.doc(`shops/${shopId}`);
  const snap = await shopRef.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Shop not found');

  const patch: Record<string, unknown> = { updated_at: FieldValue.serverTimestamp() };
  if (typeof is_test_shop === 'boolean') patch.is_test_shop = is_test_shop;
  if (admin_notes !== undefined) patch.admin_notes = admin_notes?.trim() || null;
  if (feature_flags !== undefined) patch.feature_flags = feature_flags;
  if (plan !== undefined) patch.plan = plan;

  await shopRef.update(patch);

  await writeAdminAudit({
    actor,
    action: 'SHOP_META_UPDATED',
    targetShopId: shopId,
    targetShopName: String(snap.data()?.name ?? ''),
    reason: 'Updated shop metadata / flags / notes',
    meta: { is_test_shop, plan, feature_flags }
  });

  return { ok: true };
});

export const adminListAudit = onCall({ cors: true }, async request => {
  requireAdminRole(request, ['super_admin', 'support', 'viewer']);
  const { action, search, from, to, limitCount } = (request.data ?? {}) as {
    action?: string;
    search?: string;
    from?: string;
    to?: string;
    limitCount?: number;
  };

  const cap = Math.min(Math.max(limitCount ?? 200, 10), 500);
  const snap = await db.collection('adminAudit').orderBy('created_at', 'desc').limit(cap).get();
  const q = (search ?? '').trim().toLowerCase();

  const records = snap.docs
    .map(doc => {
      const d = doc.data();
      const created = toIso(d.created_at) ?? '';
      return {
        id: doc.id,
        admin_uid: String(d.admin_uid ?? ''),
        admin_email: String(d.admin_email ?? ''),
        admin_role: String(d.admin_role ?? 'viewer'),
        action: String(d.action ?? ''),
        target_shop_id: d.target_shop_id ?? null,
        target_shop_name: d.target_shop_name ?? null,
        reason: d.reason ?? null,
        meta: d.meta ?? null,
        created_at: created
      };
    })
    .filter(r => {
      if (action && action !== 'ALL' && r.action !== action) return false;
      const day = r.created_at.slice(0, 10);
      if (from && day < from) return false;
      if (to && day > to) return false;
      if (q) {
        const hay = `${r.admin_email} ${r.action} ${r.target_shop_name ?? ''} ${r.reason ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

  return { records };
});
