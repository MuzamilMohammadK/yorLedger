import { FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, requireAdminRole, writeAdminAudit, toIso, AdminRole } from './auth';

export const adminListUsers = onCall({ cors: true }, async request => {
  requireAdminRole(request, ['super_admin', 'support', 'viewer']);

  const [usersSnap, shopsSnap] = await Promise.all([
    db.collection('users').get(),
    db.collection('shops').get()
  ]);

  const shopNames = new Map<string, string>();
  for (const s of shopsSnap.docs) {
    shopNames.set(s.id, String(s.data().name ?? ''));
  }

  const userDocs = new Map<string, { shop_id: string | null; role: string }>();
  for (const u of usersSnap.docs) {
    const ud = u.data();
    userDocs.set(u.id, { shop_id: ud.shop_id ?? null, role: String(ud.role ?? 'OWNER') });
  }

  const users: Array<{
    uid: string;
    email: string;
    shop_id: string | null;
    shop_name: string | null;
    role: string;
    admin_role: AdminRole | null;
    last_login_at: string | null;
    disabled: boolean;
  }> = [];

  let pageToken: string | undefined;
  do {
    const page = await getAuth().listUsers(1000, pageToken);
    for (const fbUser of page.users) {
      const uDoc = userDocs.get(fbUser.uid);
      const claims = fbUser.customClaims ?? {};
      const isAdm = claims.admin === true;
      const admRole: AdminRole | null = isAdm
        ? ((claims.adminRole as AdminRole) ?? 'super_admin')
        : null;
      users.push({
        uid: fbUser.uid,
        email: fbUser.email ?? '',
        shop_id: uDoc?.shop_id ?? null,
        shop_name: uDoc?.shop_id ? (shopNames.get(uDoc.shop_id) ?? null) : null,
        role: isAdm ? `ADMIN (${admRole})` : (uDoc?.role ?? 'OWNER'),
        admin_role: admRole,
        last_login_at: fbUser.metadata.lastSignInTime
          ? new Date(fbUser.metadata.lastSignInTime).toISOString()
          : null,
        disabled: fbUser.disabled
      });
    }
    pageToken = page.pageToken;
  } while (pageToken);

  return { users };
});

export const adminForceLogout = onCall({ cors: true }, async request => {
  const actor = requireAdminRole(request, ['super_admin', 'support']);
  const { uid, reason } = request.data as { uid?: string; reason?: string };
  if (!uid) throw new HttpsError('invalid-argument', 'uid is required');

  const target = await getAuth().getUser(uid);
  await getAuth().revokeRefreshTokens(uid);

  await writeAdminAudit({
    actor,
    action: 'USER_FORCE_LOGOUT',
    reason: reason?.trim() || 'Admin forced session logout',
    meta: { target_uid: uid, target_email: target.email ?? '' }
  });

  return { ok: true };
});

export const adminManageRoles = onCall({ cors: true }, async request => {
  const actor = requireAdminRole(request, ['super_admin']);
  const { email, role } = request.data as { email?: string; role?: AdminRole | 'NONE' };
  if (!email?.trim() || !role) {
    throw new HttpsError('invalid-argument', 'email and role are required');
  }
  const target = await getAuth().getUserByEmail(email.trim().toLowerCase());
  if (target.uid === actor.uid && role === 'NONE') {
    throw new HttpsError('failed-precondition', 'You cannot remove your own admin role');
  }

  const nextClaims = role === 'NONE' ? {} : { admin: true, adminRole: role };
  await getAuth().setCustomUserClaims(target.uid, nextClaims);
  await getAuth().revokeRefreshTokens(target.uid);

  await writeAdminAudit({
    actor,
    action: 'ADMIN_ROLE_UPDATED',
    reason: `Set role=${role} for ${target.email}`,
    meta: { target_uid: target.uid, target_email: target.email, role }
  });

  return { ok: true, uid: target.uid, email: target.email, role };
});

export const adminSaveAnnouncement = onCall({ cors: true }, async request => {
  const actor = requireAdminRole(request, ['super_admin', 'support']);
  const payload = request.data as {
    message?: string;
    type?: 'info' | 'warning' | 'critical';
    start_date?: string;
    end_date?: string;
    active?: boolean;
    maintenance_mode?: boolean;
    maintenance_message?: string;
  };

  await db.doc('systemConfig/announcements').set({
    message: String(payload.message ?? '').trim(),
    type: payload.type ?? 'info',
    start_date: String(payload.start_date ?? ''),
    end_date: String(payload.end_date ?? ''),
    active: Boolean(payload.active),
    maintenance_mode: Boolean(payload.maintenance_mode),
    maintenance_message: String(payload.maintenance_message ?? '').trim() || 'Scheduled maintenance in progress.',
    updated_by: actor.email,
    updated_at: FieldValue.serverTimestamp()
  });

  await writeAdminAudit({
    actor,
    action: 'ANNOUNCEMENT_UPDATED',
    reason: payload.maintenance_mode ? 'Maintenance mode enabled' : 'Updated announcement banner',
    meta: { active: Boolean(payload.active), maintenance_mode: Boolean(payload.maintenance_mode) }
  });

  return { ok: true };
});

export const adminUpdateFeedbackStatus = onCall({ cors: true }, async request => {
  const actor = requireAdminRole(request, ['super_admin', 'support']);
  const { id, status } = request.data as { id?: string; status?: 'NEW' | 'IN_PROGRESS' | 'DONE' };
  if (!id || !status || !['NEW', 'IN_PROGRESS', 'DONE'].includes(status)) {
    throw new HttpsError('invalid-argument', 'Valid feedback id and status are required');
  }
  await db.doc(`feedback/${id}`).update({
    status,
    updated_by: actor.email,
    updated_at: FieldValue.serverTimestamp()
  });

  await writeAdminAudit({
    actor,
    action: 'FEEDBACK_STATUS_UPDATED',
    reason: `Feedback ${id} -> ${status}`
  });

  return { ok: true };
});

export const adminGetSettings = onCall({ cors: true }, async request => {
  requireAdminRole(request, ['super_admin', 'support', 'viewer']);
  const [limitsSnap, alertsSnap, secSnap] = await Promise.all([
    db.doc('adminSettings/limits').get(),
    db.doc('adminSettings/alerts').get(),
    db.doc('adminSettings/security').get()
  ]);

  const l = limitsSnap.exists ? limitsSnap.data()! : {};
  const a = alertsSnap.exists ? alertsSnap.data()! : {};
  const s = secSnap.exists ? secSnap.data()! : {};

  return {
    limits: {
      daily_reads_limit: Number(l.daily_reads_limit ?? 50000),
      daily_writes_limit: Number(l.daily_writes_limit ?? 20000),
      storage_limit_mb: Number(l.storage_limit_mb ?? 5120),
      db_limit_mb: Number(l.db_limit_mb ?? 1024),
      warning_threshold_pct: Number(l.warning_threshold_pct ?? 80)
    },
    alerts: {
      super_admin_email: String(a.super_admin_email ?? ''),
      whatsapp_number: String(a.whatsapp_number ?? ''),
      whatsapp_webhook_url: String(a.whatsapp_webhook_url ?? ''),
      pending_hours_threshold: Number(a.pending_hours_threshold ?? 24),
      quota_warning_pct: Number(a.quota_warning_pct ?? 80),
      notify_on_service_down: a.notify_on_service_down !== false,
      notify_on_backup_fail: a.notify_on_backup_fail !== false
    },
    security: {
      require_2step_for_admins: Boolean(s.require_2step_for_admins)
    }
  };
});

export const adminSaveSettings = onCall({ cors: true }, async request => {
  const actor = requireAdminRole(request, ['super_admin']);
  const { limits, alerts, security } = request.data as {
    limits?: Record<string, unknown>;
    alerts?: Record<string, unknown>;
    security?: Record<string, unknown>;
  };

  const batch = db.batch();
  if (limits) batch.set(db.doc('adminSettings/limits'), { ...limits, updated_at: FieldValue.serverTimestamp() }, { merge: true });
  if (alerts) batch.set(db.doc('adminSettings/alerts'), { ...alerts, updated_at: FieldValue.serverTimestamp() }, { merge: true });
  if (security) batch.set(db.doc('adminSettings/security'), { ...security, updated_at: FieldValue.serverTimestamp() }, { merge: true });
  await batch.commit();

  await writeAdminAudit({
    actor,
    action: 'ADMIN_SETTINGS_UPDATED',
    reason: 'Updated plan limits / alert thresholds / security settings'
  });

  return { ok: true };
});

export const adminGetBackupStatus = onCall({ cors: true }, async request => {
  requireAdminRole(request, ['super_admin', 'support', 'viewer']);
  const [statusSnap, reqSnap] = await Promise.all([
    db.doc('adminSettings/backupStatus').get(),
    db.collection('adminBackupRequests').orderBy('created_at', 'desc').limit(50).get()
  ]);

  return {
    last_backup_at: statusSnap.exists ? toIso(statusSnap.data()?.last_backup_at) : null,
    last_backup_status: statusSnap.exists ? String(statusSnap.data()?.last_backup_status ?? 'OK') : 'OK',
    requests: reqSnap.docs.map(d => {
      const x = d.data();
      return {
        id: d.id,
        shop_id: String(x.shop_id ?? ''),
        shop_name: String(x.shop_name ?? ''),
        action: String(x.action ?? 'EXPORT'),
        status: String(x.status ?? 'PENDING'),
        requested_by: String(x.requested_by ?? ''),
        reason: String(x.reason ?? ''),
        created_at: toIso(x.created_at) ?? ''
      };
    })
  };
});

export const adminRequestBackupAction = onCall({ cors: true }, async request => {
  const actor = requireAdminRole(request, ['super_admin']);
  const { shopId, action, reason } = request.data as {
    shopId?: string;
    action?: 'EXPORT' | 'DELETE';
    reason?: string;
  };
  if (!shopId || !action || !['EXPORT', 'DELETE'].includes(action) || !reason?.trim()) {
    throw new HttpsError('invalid-argument', 'shopId, action (EXPORT|DELETE), and reason are required');
  }
  const shopDoc = await db.doc(`shops/${shopId}`).get();
  if (!shopDoc.exists) throw new HttpsError('not-found', 'Shop not found');
  const shopName = String(shopDoc.data()?.name ?? '');

  const ref = await db.collection('adminBackupRequests').add({
    shop_id: shopId,
    shop_name: shopName,
    action,
    status: 'PENDING',
    requested_by: actor.email || actor.uid,
    reason: reason.trim(),
    created_at: FieldValue.serverTimestamp()
  });

  await writeAdminAudit({
    actor,
    action: `BACKUP_${action}_REQUESTED`,
    targetShopId: shopId,
    targetShopName: shopName,
    reason: reason.trim(),
    meta: { request_id: ref.id }
  });

  return { ok: true, id: ref.id };
});
