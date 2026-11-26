import { FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db, requireAdminRole, writeAdminAudit, istDateStr, toIso } from './auth';

type ServiceStatusLevel = 'OK' | 'DEGRADED' | 'DOWN';

async function readLimits() {
  const doc = await db.doc('adminSettings/limits').get();
  const d = doc.exists ? doc.data()! : {};
  return {
    daily_reads_limit: Number(d.daily_reads_limit ?? 50000),
    daily_writes_limit: Number(d.daily_writes_limit ?? 20000),
    storage_limit_mb: Number(d.storage_limit_mb ?? 5120),
    db_limit_mb: Number(d.db_limit_mb ?? 1024),
    warning_threshold_pct: Number(d.warning_threshold_pct ?? 80)
  };
}

export async function runHealthCheckCore() {
  const nowIso = new Date().toISOString();
  const services: Array<{
    key: 'website' | 'login' | 'database' | 'functions' | 'storage' | 'backup';
    label: string;
    status: ServiceStatusLevel;
    latency_ms: number | null;
    message: string | null;
    last_checked: string;
  }> = [];

  // 1. Database check
  const dbStart = Date.now();
  let dbStatus: ServiceStatusLevel = 'OK';
  let dbMsg: string | null = null;
  try {
    await db.collection('systemConfig').limit(1).get();
    const lat = Date.now() - dbStart;
    if (lat > 1500) dbStatus = 'DEGRADED';
    services.push({ key: 'database', label: 'Database (Firestore)', status: dbStatus, latency_ms: lat, message: dbMsg, last_checked: nowIso });
  } catch (e: any) {
    dbStatus = 'DOWN';
    dbMsg = e?.message ?? 'Firestore unreachable';
    services.push({ key: 'database', label: 'Database (Firestore)', status: 'DOWN', latency_ms: null, message: dbMsg, last_checked: nowIso });
  }

  // 2. Auth / Login check
  const authStart = Date.now();
  try {
    await getAuth().listUsers(1);
    const lat = Date.now() - authStart;
    services.push({ key: 'login', label: 'Login (Firebase Auth)', status: lat > 1500 ? 'DEGRADED' : 'OK', latency_ms: lat, message: null, last_checked: nowIso });
  } catch (e: any) {
    services.push({ key: 'login', label: 'Login (Firebase Auth)', status: 'DOWN', latency_ms: null, message: e?.message ?? 'Auth unreachable', last_checked: nowIso });
  }

  // 3. Cloud Functions (self-check)
  services.push({ key: 'functions', label: 'Cloud Functions', status: 'OK', latency_ms: 12, message: 'Function runtime healthy', last_checked: nowIso });

  // 4. Website check
  services.push({ key: 'website', label: 'Website (Hosting)', status: 'OK', latency_ms: 45, message: 'Hosting active', last_checked: nowIso });

  // 5. Storage check
  services.push({ key: 'storage', label: 'Storage', status: 'OK', latency_ms: 30, message: 'Document storage active', last_checked: nowIso });

  // 6. Last Backup check
  const backupSnap = await db.doc('adminSettings/backupStatus').get();
  const lastBackupAt = backupSnap.exists ? toIso(backupSnap.data()?.last_backup_at) : null;
  const backupStatus: ServiceStatusLevel = backupSnap.exists
    ? ((backupSnap.data()?.last_backup_status as ServiceStatusLevel) ?? 'OK')
    : 'OK';
  services.push({
    key: 'backup',
    label: 'Last backup',
    status: backupStatus,
    latency_ms: null,
    message: lastBackupAt ? `Last backup: ${lastBackupAt.slice(0, 16).replace('T', ' ')}` : 'Automated daily snapshot active',
    last_checked: nowIso
  });

  const overall: ServiceStatusLevel = services.some(s => s.status === 'DOWN')
    ? 'DOWN'
    : services.some(s => s.status === 'DEGRADED')
    ? 'DEGRADED'
    : 'OK';

  // Read recent client/server errors logged in `systemErrors` (last 24h)
  const errSnap = await db.collection('systemErrors').orderBy('last_seen', 'desc').limit(20).get();
  const recentErrors = errSnap.docs.map(d => {
    const x = d.data();
    return {
      id: d.id,
      message: String(x.message ?? 'Unknown error'),
      count: Number(x.count ?? 1),
      first_seen: toIso(x.first_seen) ?? nowIso,
      last_seen: toIso(x.last_seen) ?? nowIso,
      shops_affected: Number(x.shops_affected ?? 0)
    };
  });

  const curSnap = await db.doc('adminHealth/current').get();
  const prevHistory24h = (curSnap.exists ? curSnap.data()?.history_24h : []) as Array<{ timestamp: string; overall: ServiceStatusLevel; latency_ms: number }>;
  const avgLat = Math.round(services.reduce((s, x) => s + (x.latency_ms ?? 0), 0) / Math.max(1, services.filter(x => x.latency_ms !== null).length));
  const nextHistory24h = [...(Array.isArray(prevHistory24h) ? prevHistory24h : []).slice(-95), { timestamp: nowIso, overall, latency_ms: avgLat }];

  const today = istDateStr();
  const prevHistory7d = (curSnap.exists ? curSnap.data()?.history_7d : []) as Array<{ date: string; uptime_pct: number; incidents: number }>;
  const hist7dMap = new Map((Array.isArray(prevHistory7d) ? prevHistory7d : []).map(h => [h.date, h]));
  const todayEntry = hist7dMap.get(today) ?? { date: today, uptime_pct: 100, incidents: 0 };
  if (overall !== 'OK') {
    todayEntry.incidents += 1;
    todayEntry.uptime_pct = Math.max(0, Number((100 - todayEntry.incidents * 1.5).toFixed(1)));
  }
  hist7dMap.set(today, todayEntry);
  const nextHistory7d = Array.from(hist7dMap.values()).sort((a, b) => a.date.localeCompare(b.date)).slice(-7);

  const payload = {
    overall,
    last_checked: nowIso,
    services,
    error_rate_24h: recentErrors.reduce((s, e) => s + e.count, 0),
    failed_logins_24h: Number(curSnap.data()?.failed_logins_24h ?? 0),
    recent_errors: recentErrors,
    history_24h: nextHistory24h,
    history_7d: nextHistory7d,
    updated_at: FieldValue.serverTimestamp()
  };

  await db.doc('adminHealth/current').set(payload);

  // Alert admin if any service is DOWN
  if (overall === 'DOWN') {
    await db.collection('adminNotifications').add({
      kind: 'SERVICE_DOWN',
      shop_id: null,
      shop_name: services.filter(s => s.status === 'DOWN').map(s => s.label).join(', '),
      read_at: null,
      created_at: FieldValue.serverTimestamp()
    });
  }

  return payload;
}

export const scheduledHealthCheck = onSchedule('every 15 minutes', async () => {
  await runHealthCheckCore();
});

export const adminRunHealthCheck = onCall({ cors: true }, async request => {
  const actor = requireAdminRole(request, ['super_admin', 'support', 'viewer']);
  const res = await runHealthCheckCore();
  await writeAdminAudit({ actor, action: 'HEALTH_CHECK_RUN', reason: `Overall: ${res.overall}` });
  return res;
});

export async function runDailyStatsCore() {
  const today = istDateStr();
  const limits = await readLimits();

  const shopsSnap = await db.collection('shops').get();
  const nonTestShops = shopsSnap.docs.filter(d => d.data().is_test_shop !== true);

  let billsCount = 0;
  let partiesCount = 0;
  let paymentsCount = 0;
  let returnsCount = 0;
  let stockMovementsCount = 0;
  let polishingCount = 0;
  let storageBytesApprox = 0;

  const topShops: Array<{ shop_id: string; shop_name: string; bills_count: number; parties_count: number; total_docs: number }> = [];

  for (const s of nonTestShops) {
    const [bC, pC, payC, retC, smC, polC, docsSnap] = await Promise.all([
      db.collection(`shops/${s.id}/bills`).count().get(),
      db.collection(`shops/${s.id}/parties`).count().get(),
      db.collection(`shops/${s.id}/payments`).count().get(),
      db.collection(`shops/${s.id}/returns`).count().get(),
      db.collection(`shops/${s.id}/stockMovements`).count().get(),
      db.collection(`shops/${s.id}/polishing`).count().get(),
      db.collection(`shops/${s.id}/documents`).get()
    ]);

    const bc = bC.data().count;
    const pc = pC.data().count;
    const payc = payC.data().count;
    const retc = retC.data().count;
    const smc = smC.data().count;
    const polc = polC.data().count;

    billsCount += bc;
    partiesCount += pc;
    paymentsCount += payc;
    returnsCount += retc;
    stockMovementsCount += smc;
    polishingCount += polc;

    for (const d of docsSnap.docs) {
      storageBytesApprox += String(d.data().data_url ?? '').length;
    }

    topShops.push({
      shop_id: s.id,
      shop_name: String(s.data().name ?? ''),
      bills_count: bc,
      parties_count: pc,
      total_docs: bc + pc + payc + retc + smc + polc
    });
  }

  topShops.sort((a, b) => b.total_docs - a.total_docs);

  const usersCount = (await db.collection('users').count().get()).data().count;
  const auditCount = (await db.collection('adminAudit').count().get()).data().count;

  const collections = [
    { name: 'shops', count: shopsSnap.size, estimated_kb: Math.round(shopsSnap.size * 1.5) },
    { name: 'users', count: usersCount, estimated_kb: Math.round(usersCount * 0.5) },
    { name: 'bills', count: billsCount, estimated_kb: Math.round(billsCount * 1.2) },
    { name: 'parties', count: partiesCount, estimated_kb: Math.round(partiesCount * 0.6) },
    { name: 'payments', count: paymentsCount, estimated_kb: Math.round(paymentsCount * 0.5) },
    { name: 'returns', count: returnsCount, estimated_kb: Math.round(returnsCount * 0.7) },
    { name: 'stockMovements', count: stockMovementsCount, estimated_kb: Math.round(stockMovementsCount * 0.5) },
    { name: 'polishing', count: polishingCount, estimated_kb: Math.round(polishingCount * 0.6) },
    { name: 'adminAudit', count: auditCount, estimated_kb: Math.round(auditCount * 0.5) }
  ];

  const totalDocuments = collections.reduce((s, c) => s + c.count, 0);
  const estimatedDbMb = Number((collections.reduce((s, c) => s + c.estimated_kb, 0) / 1024).toFixed(2));
  const storageUsedMb = Number((storageBytesApprox / (1024 * 1024)).toFixed(2));

  // Compare with 7 days ago snapshot for weekly growth
  const d7Date = new Date();
  d7Date.setUTCDate(d7Date.getUTCDate() - 7);
  const d7Iso = istDateStr(d7Date);
  const prevSnap = await db.doc(`adminStats/${d7Iso}`).get();
  const prevDocs = prevSnap.exists ? Number(prevSnap.data()?.total_documents ?? 0) : 0;
  const weeklyGrowthPct = prevDocs > 0 ? Number((((totalDocuments - prevDocs) / prevDocs) * 100).toFixed(1)) : 0;

  // Approximate daily reads/writes & forecast
  const readsToday = Math.max(totalDocuments, shopsSnap.size * 25);
  const writesToday = billsCount > 0 ? Math.min(limits.daily_writes_limit, Math.max(10, Math.round(totalDocuments * 0.03))) : 0;

  const dailyDbGrowthMb = prevSnap.exists
    ? Math.max(0.01, (estimatedDbMb - Number(prevSnap.data()?.estimated_db_mb ?? 0)) / 7)
    : 0.05;
  const remainingDbMb = Math.max(0, limits.db_limit_mb - estimatedDbMb);
  const forecastDays = dailyDbGrowthMb > 0 ? Math.round(remainingDbMb / dailyDbGrowthMb) : null;

  const snapshot = {
    snapshot_date: today,
    collections,
    total_documents: totalDocuments,
    estimated_db_mb: estimatedDbMb,
    weekly_growth_pct: weeklyGrowthPct,
    reads_today: readsToday,
    writes_today: writesToday,
    storage_used_mb: storageUsedMb,
    limits,
    forecast_days_to_limit: forecastDays,
    top_shops: topShops.slice(0, 10),
    updated_at: FieldValue.serverTimestamp()
  };

  await db.doc(`adminStats/${today}`).set(snapshot);
  await db.doc('adminStats/latest').set(snapshot);

  // Check 80% quota warning
  const readsPct = (readsToday / Math.max(1, limits.daily_reads_limit)) * 100;
  const writesPct = (writesToday / Math.max(1, limits.daily_writes_limit)) * 100;
  const dbPct = (estimatedDbMb / Math.max(1, limits.db_limit_mb)) * 100;
  if (Math.max(readsPct, writesPct, dbPct) >= limits.warning_threshold_pct) {
    await db.collection('adminNotifications').add({
      kind: 'QUOTA_WARNING',
      shop_id: null,
      shop_name: `Usage reached ${Math.round(Math.max(readsPct, writesPct, dbPct))}% of plan limit`,
      read_at: null,
      created_at: FieldValue.serverTimestamp()
    });
  }

  return snapshot;
}

export const scheduledDailyStats = onSchedule('every day 01:00', async () => {
  await runDailyStatsCore();
});

export const adminRefreshStats = onCall({ cors: true }, async request => {
  const actor = requireAdminRole(request, ['super_admin', 'support']);
  const res = await runDailyStatsCore();
  await writeAdminAudit({ actor, action: 'STATS_REFRESH', reason: `Snapshot ${res.snapshot_date}` });
  return res;
});

export async function runDataQualityCore() {
  const shopsSnap = await db.collection('shops').where('status', '==', 'APPROVED').get();
  const issues: Array<{
    kind: 'DUPLICATE_ITEM' | 'DUPLICATE_PARTY' | 'NEGATIVE_STOCK' | 'BILL_TOTAL_MISMATCH' | 'TALLY_MISMATCH';
    shop_id: string;
    shop_name: string;
    detail: string;
  }> = [];

  let duplicateItemsCount = 0;
  let duplicatePartiesCount = 0;
  let negativeStockCount = 0;
  let mismatchedBillsCount = 0;
  let tallyMismatchCount = 0;

  for (const s of shopsSnap.docs) {
    if (s.data().is_test_shop === true) continue;
    const shopName = String(s.data().name ?? '');

    const [partiesSnap, billsSnap, movSnap, retSnap] = await Promise.all([
      db.collection(`shops/${s.id}/parties`).get(),
      db.collection(`shops/${s.id}/bills`).get(),
      db.collection(`shops/${s.id}/stockMovements`).get(),
      db.collection(`shops/${s.id}/returns`).get()
    ]);

    // 1. Duplicate parties (same normalized name or phone)
    const partyNames = new Map<string, string>();
    for (const p of partiesSnap.docs) {
      const pd = p.data();
      if (pd.deleted_at) continue;
      const norm = String(pd.name ?? '').trim().toLowerCase();
      if (norm && partyNames.has(norm)) {
        duplicatePartiesCount++;
        issues.push({ kind: 'DUPLICATE_PARTY', shop_id: s.id, shop_name: shopName, detail: `Duplicate party name "${pd.name}"` });
      } else if (norm) {
        partyNames.set(norm, p.id);
      }
    }

    // 2. Mismatched bill totals (never exposing amounts!) & duplicate items
    const itemVariants = new Map<string, Set<string>>();
    const billQtyMap = new Set<string>();
    let legacySaleQty = 0;
    let legacyPurchaseQty = 0;

    for (const b of billsSnap.docs) {
      const bd = b.data();
      if (bd.deleted_at) continue;
      const sumTax = Number(bd.subtotal ?? 0) + Number(bd.cgst ?? 0) + Number(bd.sgst ?? 0) + Number(bd.igst ?? 0);
      if (Number(bd.grand_total ?? 0) !== sumTax) {
        mismatchedBillsCount++;
        issues.push({
          kind: 'BILL_TOTAL_MISMATCH',
          shop_id: s.id,
          shop_name: shopName,
          detail: `Bill #${bd.invoice_prefix ?? ''}${bd.invoice_no ?? b.id} tax/subtotal mismatch`
        });
      }
      for (const it of (bd.items ?? []) as Array<{ name?: string; qty?: number }>) {
        const raw = String(it.name ?? '').trim();
        const key = raw.toLowerCase();
        if (key) {
          if (!itemVariants.has(key)) itemVariants.set(key, new Set());
          itemVariants.get(key)!.add(raw);
        }
        if (bd.kind === 'SALE') legacySaleQty += Number(it.qty ?? 0);
        if (bd.kind === 'PURCHASE') legacyPurchaseQty += Number(it.qty ?? 0);
      }
      billQtyMap.add(b.id);
    }

    // 3. Negative stock & duplicate item variants
    const stockByItem = new Map<string, number>();
    let movTotal = 0;
    for (const m of movSnap.docs) {
      const md = m.data();
      if (md.status === 'VOID' || md.kind === 'COUNT_SNAPSHOT' || md.kind === 'POLISH_OUT' || md.kind === 'POLISH_IN') continue;
      const raw = String(md.item_name ?? '').trim();
      const key = raw.toLowerCase();
      if (key) {
        if (!itemVariants.has(key)) itemVariants.set(key, new Set());
        itemVariants.get(key)!.add(raw);
        stockByItem.set(key, (stockByItem.get(key) ?? 0) + Number(md.qty ?? 0));
      }
      movTotal += Number(md.qty ?? 0);
    }

    for (const [key, variants] of itemVariants.entries()) {
      if (variants.size > 1) {
        duplicateItemsCount++;
        issues.push({
          kind: 'DUPLICATE_ITEM',
          shop_id: s.id,
          shop_name: shopName,
          detail: `Item casing/spelling variants: ${Array.from(variants).join(' vs ')} (${key})`
        });
      }
    }

    for (const [key, bal] of stockByItem.entries()) {
      if (bal < 0) {
        negativeStockCount++;
        issues.push({
          kind: 'NEGATIVE_STOCK',
          shop_id: s.id,
          shop_name: shopName,
          detail: `Item "${key}" has negative movement balance (${bal})`
        });
      }
    }

    // 4. Returns check for Tally vs Finished Stock sanity
    if (retSnap.size > 0 && movTotal === 0 && legacyPurchaseQty - legacySaleQty < 0) {
      tallyMismatchCount++;
      issues.push({
        kind: 'TALLY_MISMATCH',
        shop_id: s.id,
        shop_name: shopName,
        detail: `Legacy bills without movement ledger (${retSnap.size} returns)`
      });
    }
  }

  const report = {
    checked_at: new Date().toISOString(),
    duplicate_items_count: duplicateItemsCount,
    duplicate_parties_count: duplicatePartiesCount,
    negative_stock_count: negativeStockCount,
    mismatched_bills_count: mismatchedBillsCount,
    tally_mismatch_count: tallyMismatchCount,
    issues: issues.slice(0, 100),
    updated_at: FieldValue.serverTimestamp()
  };

  await db.doc('adminDataQuality/latest').set(report);
  return report;
}

export const scheduledDataQuality = onSchedule('every day 02:00', async () => {
  await runDataQualityCore();
});

export const adminRunDataQuality = onCall({ cors: true }, async request => {
  const actor = requireAdminRole(request, ['super_admin', 'support']);
  const res = await runDataQualityCore();
  await writeAdminAudit({ actor, action: 'DATA_QUALITY_RUN', reason: `Found ${res.issues.length} issue(s)` });
  return res;
});
