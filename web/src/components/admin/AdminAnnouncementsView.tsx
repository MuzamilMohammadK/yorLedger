import React, { useEffect, useState } from 'react';
import { Megaphone, AlertTriangle, MessageSquare } from 'lucide-react';
import { AdminAnnouncementConfig, AdminFeedbackItem, AdminRole } from '@yorbalance/shared';
import { adminApi } from '../../lib/adminApi';

export const AdminAnnouncementsView: React.FC<{ adminRole: AdminRole | null }> = ({ adminRole }) => {
  const [form, setForm] = useState<AdminAnnouncementConfig>({
    message: '',
    type: 'info',
    start_date: '',
    end_date: '',
    active: false,
    maintenance_mode: false,
    maintenance_message: 'Scheduled maintenance in progress.'
  });
  const [feedback, setFeedback] = useState<AdminFeedbackItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canAct = adminRole === 'super_admin' || adminRole === 'support';

  const load = async () => {
    try {
      const [ann, fb] = await Promise.all([adminApi.getAnnouncement(), adminApi.listFeedback()]);
      if (ann) setForm(ann);
      setFeedback(fb);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load announcements');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const saveBanner = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSavedMsg(null);
    try {
      await adminApi.saveAnnouncement(form);
      setSavedMsg('Announcement & maintenance settings saved.');
    } catch (err: any) {
      setError(err?.message ?? 'Failed to save announcement');
    } finally {
      setBusy(false);
    }
  };

  const setFbStatus = async (id: string, status: 'NEW' | 'IN_PROGRESS' | 'DONE') => {
    try {
      await adminApi.updateFeedbackStatus({ id, status });
      setFeedback(prev => prev.map(f => (f.id === id ? { ...f, status } : f)));
    } catch (e: any) {
      setError(e?.message ?? 'Failed to update feedback status');
    }
  };

  return (
    <div className="space-y-6">
      {savedMsg && <p className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800">{savedMsg}</p>}
      {error && <p className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">{error}</p>}

      {/* Banner + Maintenance Mode */}
      <form onSubmit={saveBanner} className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Megaphone className="w-5 h-5 text-indigo-700" />
          <h2 className="text-base font-bold text-slate-900">Global announcement banner &amp; maintenance mode</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="text-xs font-bold text-slate-600">
            Banner tone
            <select
              disabled={!canAct}
              value={form.type}
              onChange={e => setForm({ ...form, type: e.target.value as any })}
              className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm font-normal"
            >
              <option value="info">Info (Blue)</option>
              <option value="warning">Warning (Amber)</option>
              <option value="critical">Critical (Red)</option>
            </select>
          </label>
          <label className="text-xs font-bold text-slate-600">
            Start date
            <input
              type="date"
              disabled={!canAct}
              value={form.start_date}
              onChange={e => setForm({ ...form, start_date: e.target.value })}
              className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-300 text-sm font-normal"
            />
          </label>
          <label className="text-xs font-bold text-slate-600">
            End date
            <input
              type="date"
              disabled={!canAct}
              value={form.end_date}
              onChange={e => setForm({ ...form, end_date: e.target.value })}
              className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-300 text-sm font-normal"
            />
          </label>
        </div>

        <label className="block text-xs font-bold text-slate-600">
          Banner message
          <textarea
            rows={2}
            disabled={!canAct}
            value={form.message}
            onChange={e => setForm({ ...form, message: e.target.value })}
            placeholder="e.g. GST filing deadline reminder or planned update..."
            className="mt-1 w-full p-3 rounded-xl border border-slate-300 text-sm font-normal"
          />
        </label>

        <div className="flex flex-wrap items-center gap-6 pt-1">
          <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-800">
            <input
              type="checkbox"
              disabled={!canAct}
              checked={form.active}
              onChange={e => setForm({ ...form, active: e.target.checked })}
            />
            <span>Show announcement banner to all shops</span>
          </label>

          <label className="inline-flex items-center gap-2 text-xs font-bold text-rose-700">
            <input
              type="checkbox"
              disabled={!canAct}
              checked={form.maintenance_mode}
              onChange={e => setForm({ ...form, maintenance_mode: e.target.checked })}
            />
            <AlertTriangle className="w-4 h-4" />
            <span>Enable maintenance mode</span>
          </label>
        </div>

        {form.maintenance_mode && (
          <label className="block text-xs font-bold text-rose-700">
            Maintenance notice
            <input
              type="text"
              disabled={!canAct}
              value={form.maintenance_message}
              onChange={e => setForm({ ...form, maintenance_message: e.target.value })}
              className="mt-1 w-full h-10 px-3 rounded-xl border border-rose-300 bg-rose-50/40 text-sm font-normal"
            />
          </label>
        )}

        {canAct && (
          <button
            type="submit"
            disabled={busy}
            className="h-10 px-5 rounded-xl bg-indigo-700 text-white text-xs font-bold disabled:opacity-50"
          >
            {busy ? 'Saving...' : 'Save banner & maintenance settings'}
          </button>
        )}
      </form>

      {/* Feedback Inbox */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-indigo-700" />
          <h3 className="text-sm font-bold text-slate-900">Feedback inbox ({feedback.length})</h3>
        </div>
        {feedback.length === 0 ? (
          <p className="p-8 text-center text-xs text-slate-500">
            No user feedback messages yet. Feedback submitted by shop owners appears here.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {feedback.map(f => (
              <div key={f.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-bold text-slate-900">{f.subject}</p>
                  <p className="text-xs text-slate-600">{f.message}</p>
                  <p className="text-[11px] text-slate-500">
                    {f.email} {f.shop_name ? `· ${f.shop_name}` : ''} · {f.created_at.slice(0, 10)}
                  </p>
                </div>
                <select
                  disabled={!canAct}
                  value={f.status}
                  onChange={e => setFbStatus(f.id, e.target.value as any)}
                  className="h-9 px-3 rounded-xl border border-slate-300 bg-white text-xs font-bold shrink-0"
                >
                  <option value="NEW">New</option>
                  <option value="IN_PROGRESS">In progress</option>
                  <option value="DONE">Done</option>
                </select>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
