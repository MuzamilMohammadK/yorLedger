import React, { useEffect, useState } from 'react';
import { Search, RefreshCw } from 'lucide-react';
import { AdminAuditRecord } from '@yorbalance/shared';
import { adminApi } from '../../lib/adminApi';

export const AdminAuditView: React.FC = () => {
  const [records, setRecords] = useState<AdminAuditRecord[]>([]);
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('ALL');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.listAudit({ action, search, from: from || undefined, to: to || undefined });
      setRecords(res.records);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load audit log');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [action]);

  const actions = [
    'ALL',
    'SHOP_APPROVED',
    'SHOP_REJECTED',
    'SHOP_SUSPENDED',
    'SHOP_REACTIVATED',
    'REVEAL_SENSITIVE',
    'DOCUMENT_APPROVED',
    'DOCUMENT_REJECTED',
    'SHOP_META_UPDATED',
    'USER_FORCE_LOGOUT',
    'ADMIN_ROLE_UPDATED',
    'ANNOUNCEMENT_UPDATED',
    'ADMIN_SETTINGS_UPDATED',
    'BACKUP_EXPORT_REQUESTED',
    'BACKUP_DELETE_REQUESTED'
  ];

  return (
    <div className="space-y-4">
      {/* Fixed Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search admin, action, shop, or reason..."
            className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-300 text-sm"
          />
        </div>
        <select
          value={action}
          onChange={e => setAction(e.target.value)}
          className="h-10 px-3 rounded-xl border border-slate-300 text-sm bg-white"
        >
          {actions.map(a => (
            <option key={a} value={a}>
              {a === 'ALL' ? 'All actions' : a}
            </option>
          ))}
        </select>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-10 px-2.5 rounded-xl border border-slate-300 text-xs" />
        <input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-10 px-2.5 rounded-xl border border-slate-300 text-xs" />
        <button
          type="button"
          onClick={load}
          className="h-10 px-4 rounded-xl bg-indigo-700 text-white text-sm font-semibold inline-flex items-center gap-1.5"
        >
          <RefreshCw className="w-4 h-4" /> Apply
        </button>
      </div>

      {error && <p className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">{error}</p>}

      {loading ? (
        <div className="h-64 rounded-2xl bg-slate-200/70 animate-pulse" />
      ) : records.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-sm text-slate-500">
          No audit records match these filters. Clear the search or date range to see all admin actions.
        </div>
      ) : (
        <>
          {/* Desktop sticky-header scrollable body table */}
          <div className="hidden md:block bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="max-h-[65vh] overflow-y-auto">
              <table className="w-full text-left border-collapse text-[13px]">
                <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-[11px] uppercase font-bold text-slate-500">
                  <tr>
                    <th className="px-4 py-3 whitespace-nowrap">Time</th>
                    <th className="px-4 py-3">Admin</th>
                    <th className="px-4 py-3 whitespace-nowrap">Action</th>
                    <th className="px-4 py-3">Shop</th>
                    <th className="px-4 py-3">Reason / Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {records.map(r => (
                    <tr key={r.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-2.5 whitespace-nowrap text-slate-600 tabular-nums">
                        {r.created_at ? new Date(r.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="font-semibold text-slate-900">{r.admin_email}</span>
                        <span className="ml-1.5 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                          {r.admin_role}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap font-mono text-xs font-semibold text-indigo-700">
                        {r.action}
                      </td>
                      <td className="px-4 py-2.5 text-slate-800">{r.target_shop_name ?? '—'}</td>
                      <td className="px-4 py-2.5 text-slate-600">{r.reason ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile list (< 768px) */}
          <div className="md:hidden space-y-2">
            {records.map(r => (
              <div key={r.id} className="bg-white rounded-2xl border border-slate-200 p-3.5 space-y-1 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-bold text-indigo-700">{r.action}</span>
                  <span className="text-slate-500">
                    {r.created_at ? new Date(r.created_at).toLocaleDateString('en-IN') : '—'}
                  </span>
                </div>
                <p className="font-semibold text-slate-900">{r.admin_email} ({r.admin_role})</p>
                {r.target_shop_name && <p className="text-slate-700">Shop: {r.target_shop_name}</p>}
                {r.reason && <p className="text-slate-600">{r.reason}</p>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
