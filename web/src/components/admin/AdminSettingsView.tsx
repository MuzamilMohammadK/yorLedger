import React, { useEffect, useState } from 'react';
import { ShieldCheck, Bell, Database, HardDriveDownload } from 'lucide-react';
import { AdminBackupStatus, AdminRole, AdminSettingsConfig, AdminShopSummary } from '@yorbalance/shared';
import { adminApi } from '../../lib/adminApi';

export const AdminSettingsView: React.FC<{ adminRole: AdminRole | null }> = ({ adminRole }) => {
  const [settings, setSettings] = useState<AdminSettingsConfig | null>(null);
  const [backup, setBackup] = useState<AdminBackupStatus | null>(null);
  const [shops, setShops] = useState<AdminShopSummary[]>([]);

  const [roleEmail, setRoleEmail] = useState('');
  const [roleTarget, setRoleTarget] = useState<AdminRole | 'NONE'>('support');

  const [backupShopId, setBackupShopId] = useState('');
  const [backupAction, setBackupAction] = useState<'EXPORT' | 'DELETE'>('EXPORT');
  const [backupReason, setBackupReason] = useState('');

  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isSuper = adminRole === 'super_admin';

  const load = async () => {
    try {
      const [s, b, sh] = await Promise.all([
        adminApi.getSettings(),
        adminApi.getBackupStatus(),
        adminApi.listShops()
      ]);
      setSettings(s);
      setBackup(b);
      setShops(sh.shops);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load settings');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setBusy('settings');
    setError(null);
    setMsg(null);
    try {
      await adminApi.saveSettings(settings);
      setMsg('Admin settings saved.');
    } catch (err: any) {
      setError(err?.message ?? 'Failed to save settings');
    } finally {
      setBusy(null);
    }
  };

  const assignRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleEmail.trim()) return;
    setBusy('role');
    setError(null);
    setMsg(null);
    try {
      const res = await adminApi.manageRoles({ email: roleEmail.trim(), role: roleTarget });
      setMsg(`Updated ${res.email} role to ${res.role}. User must sign out and back in.`);
      setRoleEmail('');
    } catch (err: any) {
      setError(err?.message ?? 'Failed to update admin role');
    } finally {
      setBusy(null);
    }
  };

  const submitBackupReq = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!backupShopId || !backupReason.trim()) return;
    setBusy('backup');
    setError(null);
    setMsg(null);
    try {
      await adminApi.requestBackupAction({ shopId: backupShopId, action: backupAction, reason: backupReason.trim() });
      setMsg(`Submitted ${backupAction} request with audit record.`);
      setBackupReason('');
      setBackup(await adminApi.getBackupStatus());
    } catch (err: any) {
      setError(err?.message ?? 'Backup request failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      {!isSuper && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          Read-only view: only <strong>Super Admin</strong> can change roles, limits, alert thresholds, or request shop export/deletion.
        </div>
      )}

      {msg && <p className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800">{msg}</p>}
      {error && <p className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">{error}</p>}

      {/* Admin Roles Management */}
      <form onSubmit={assignRole} className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-indigo-700" />
          <h2 className="text-base font-bold text-slate-900">Admin roles management</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input
            type="email"
            disabled={!isSuper}
            required
            value={roleEmail}
            onChange={e => setRoleEmail(e.target.value)}
            placeholder="Existing Firebase user email"
            className="h-10 px-3 rounded-xl border border-slate-300 text-sm"
          />
          <select
            disabled={!isSuper}
            value={roleTarget}
            onChange={e => setRoleTarget(e.target.value as any)}
            className="h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm"
          >
            <option value="super_admin">Super Admin</option>
            <option value="support">Support</option>
            <option value="viewer">Viewer (read-only)</option>
            <option value="NONE">Revoke Admin</option>
          </select>
          <button
            type="submit"
            disabled={!isSuper || busy === 'role'}
            className="h-10 px-4 rounded-xl bg-indigo-700 text-white text-xs font-bold disabled:opacity-50"
          >
            {busy === 'role' ? 'Updating...' : 'Update role'}
          </button>
        </div>
      </form>

      {/* Plan Limits, Alert Thresholds & 2-Step Security */}
      {settings && (
        <form onSubmit={saveSettings} className="bg-white rounded-2xl border border-slate-200 p-5 space-y-5">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-indigo-700" />
              <h2 className="text-base font-bold text-slate-900">Plan limits &amp; quota thresholds</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <label className="text-xs font-bold text-slate-600">
                Daily reads limit
                <input
                  type="number"
                  disabled={!isSuper}
                  value={settings.limits.daily_reads_limit}
                  onChange={e =>
                    setSettings({
                      ...settings,
                      limits: { ...settings.limits, daily_reads_limit: Number(e.target.value) || 0 }
                    })
                  }
                  className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-300 text-sm font-normal"
                />
              </label>
              <label className="text-xs font-bold text-slate-600">
                Daily writes limit
                <input
                  type="number"
                  disabled={!isSuper}
                  value={settings.limits.daily_writes_limit}
                  onChange={e =>
                    setSettings({
                      ...settings,
                      limits: { ...settings.limits, daily_writes_limit: Number(e.target.value) || 0 }
                    })
                  }
                  className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-300 text-sm font-normal"
                />
              </label>
              <label className="text-xs font-bold text-slate-600">
                DB limit (MB)
                <input
                  type="number"
                  disabled={!isSuper}
                  value={settings.limits.db_limit_mb}
                  onChange={e =>
                    setSettings({
                      ...settings,
                      limits: { ...settings.limits, db_limit_mb: Number(e.target.value) || 0 }
                    })
                  }
                  className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-300 text-sm font-normal"
                />
              </label>
              <label className="text-xs font-bold text-slate-600">
                Storage limit (MB)
                <input
                  type="number"
                  disabled={!isSuper}
                  value={settings.limits.storage_limit_mb}
                  onChange={e =>
                    setSettings({
                      ...settings,
                      limits: { ...settings.limits, storage_limit_mb: Number(e.target.value) || 0 }
                    })
                  }
                  className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-300 text-sm font-normal"
                />
              </label>
              <label className="text-xs font-bold text-slate-600">
                Warning (%)
                <input
                  type="number"
                  disabled={!isSuper}
                  value={settings.limits.warning_threshold_pct}
                  onChange={e =>
                    setSettings({
                      ...settings,
                      limits: { ...settings.limits, warning_threshold_pct: Number(e.target.value) || 80 }
                    })
                  }
                  className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-300 text-sm font-normal"
                />
              </label>
            </div>
          </div>

          <div className="space-y-3 pt-3 border-t border-slate-200">
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-indigo-700" />
              <h2 className="text-base font-bold text-slate-900">Alerts &amp; 2-step login</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="text-xs font-bold text-slate-600">
                Super admin alert email
                <input
                  type="email"
                  disabled={!isSuper}
                  value={settings.alerts.super_admin_email}
                  onChange={e =>
                    setSettings({ ...settings, alerts: { ...settings.alerts, super_admin_email: e.target.value } })
                  }
                  className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-300 text-sm font-normal"
                />
              </label>
              <label className="text-xs font-bold text-slate-600">
                WhatsApp alert number
                <input
                  type="text"
                  disabled={!isSuper}
                  value={settings.alerts.whatsapp_number}
                  onChange={e =>
                    setSettings({ ...settings, alerts: { ...settings.alerts, whatsapp_number: e.target.value } })
                  }
                  className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-300 text-sm font-normal"
                />
              </label>
              <label className="text-xs font-bold text-slate-600">
                Pending verification alert (hours)
                <input
                  type="number"
                  disabled={!isSuper}
                  value={settings.alerts.pending_hours_threshold}
                  onChange={e =>
                    setSettings({
                      ...settings,
                      alerts: { ...settings.alerts, pending_hours_threshold: Number(e.target.value) || 24 }
                    })
                  }
                  className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-300 text-sm font-normal"
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-5 pt-1">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  disabled={!isSuper}
                  checked={settings.alerts.notify_on_service_down}
                  onChange={e =>
                    setSettings({ ...settings, alerts: { ...settings.alerts, notify_on_service_down: e.target.checked } })
                  }
                />
                <span>Alert on service down</span>
              </label>
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  disabled={!isSuper}
                  checked={settings.alerts.notify_on_backup_fail}
                  onChange={e =>
                    setSettings({ ...settings, alerts: { ...settings.alerts, notify_on_backup_fail: e.target.checked } })
                  }
                />
                <span>Alert on backup failure</span>
              </label>
              <label className="inline-flex items-center gap-2 text-xs font-bold text-indigo-800">
                <input
                  type="checkbox"
                  disabled={!isSuper}
                  checked={settings.security.require_2step_for_admins}
                  onChange={e =>
                    setSettings({
                      ...settings,
                      security: { ...settings.security, require_2step_for_admins: e.target.checked }
                    })
                  }
                />
                <span>Require 2-step login (MFA) for admins</span>
              </label>
            </div>
          </div>

          {isSuper && (
            <button
              type="submit"
              disabled={busy === 'settings'}
              className="h-10 px-5 rounded-xl bg-indigo-700 text-white text-xs font-bold disabled:opacity-50"
            >
              {busy === 'settings' ? 'Saving...' : 'Save limits, alerts & security'}
            </button>
          )}
        </form>
      )}

      {/* Backups & Data Export / Deletion Workflow */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <HardDriveDownload className="w-5 h-5 text-indigo-700" />
            <h2 className="text-base font-bold text-slate-900">Backups &amp; shop data export / deletion</h2>
          </div>
          <span className="text-xs font-semibold text-slate-600">
            Last backup: {backup?.last_backup_at ? new Date(backup.last_backup_at).toLocaleString('en-IN') : 'Automated daily'} · Status:{' '}
            <b className="text-emerald-700">{backup?.last_backup_status ?? 'OK'}</b>
          </span>
        </div>

        <form onSubmit={submitBackupReq} className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <select
            disabled={!isSuper}
            required
            value={backupShopId}
            onChange={e => setBackupShopId(e.target.value)}
            className="h-10 px-3 rounded-xl border border-slate-300 bg-white text-xs"
          >
            <option value="">-- Select shop --</option>
            {shops.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            disabled={!isSuper}
            value={backupAction}
            onChange={e => setBackupAction(e.target.value as any)}
            className="h-10 px-3 rounded-xl border border-slate-300 bg-white text-xs font-semibold"
          >
            <option value="EXPORT">Request data export</option>
            <option value="DELETE">Request data deletion</option>
          </select>
          <input
            type="text"
            disabled={!isSuper}
            required
            value={backupReason}
            onChange={e => setBackupReason(e.target.value)}
            placeholder="Reason (required for audit)"
            className="h-10 px-3 rounded-xl border border-slate-300 text-xs"
          />
          <button
            type="submit"
            disabled={!isSuper || busy === 'backup'}
            className="h-10 px-4 rounded-xl bg-slate-900 text-white text-xs font-bold disabled:opacity-50"
          >
            {busy === 'backup' ? 'Submitting...' : 'Submit request'}
          </button>
        </form>

        {backup && backup.requests.length > 0 && (
          <div className="divide-y divide-slate-100 text-xs pt-2">
            {backup.requests.map(r => (
              <div key={r.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-mono font-bold text-indigo-700 mr-2">{r.action}</span>
                  <span className="font-semibold text-slate-900">{r.shop_name}</span>
                  <span className="text-slate-500 ml-2">({r.reason})</span>
                </div>
                <span className="px-2 py-0.5 rounded bg-slate-100 font-semibold">{r.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
