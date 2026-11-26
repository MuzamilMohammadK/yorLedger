import React, { useEffect, useMemo, useState } from 'react';
import { Search, LogOut, RefreshCw } from 'lucide-react';
import { AdminRole, AdminUserSummary } from '@yorbalance/shared';
import { adminApi } from '../../lib/adminApi';

export const AdminUsersView: React.FC<{ adminRole: AdminRole | null }> = ({ adminRole }) => {
  const [users, setUsers] = useState<AdminUserSummary[] | null>(null);
  const [search, setSearch] = useState('');
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canAct = adminRole === 'super_admin' || adminRole === 'support';

  const load = async () => {
    setError(null);
    try {
      const res = await adminApi.listUsers();
      setUsers(res.users);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load users');
      setUsers([]);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (users ?? []).filter(
      u =>
        !q ||
        u.email.toLowerCase().includes(q) ||
        (u.shop_name ?? '').toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q)
    );
  }, [users, search]);

  const forceLogout = async (u: AdminUserSummary) => {
    setBusyUid(u.uid);
    setError(null);
    setMessage(null);
    try {
      await adminApi.forceLogout({ uid: u.uid, reason: 'Admin forced session logout' });
      setMessage(`Revoked active sessions for ${u.email}.`);
    } catch (e: any) {
      setError(e?.message ?? 'Force logout failed');
    } finally {
      setBusyUid(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 p-3.5 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search user email, shop, or role..."
            className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-300 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={load}
          className="h-10 px-4 rounded-xl border border-slate-300 bg-white text-xs font-semibold inline-flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {message && <p className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800">{message}</p>}
      {error && <p className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">{error}</p>}

      {users === null ? (
        <div className="h-64 rounded-2xl bg-slate-200/70 animate-pulse" />
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-sm text-slate-500">
          No users match your search. Clear the search box to see all Firebase Auth users.
        </div>
      ) : (
        <>
          <div className="hidden md:block bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="max-h-[65vh] overflow-y-auto">
              <table className="w-full text-left border-collapse text-[13px]">
                <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-[11px] uppercase font-bold text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Shop</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3 whitespace-nowrap">Last login</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map(u => (
                    <tr key={u.uid} className="hover:bg-slate-50/70">
                      <td className="px-4 py-2.5 font-semibold text-slate-900">{u.email || u.uid}</td>
                      <td className="px-4 py-2.5 text-slate-700">{u.shop_name ?? '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold">
                          {u.role}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-xs text-slate-500">
                        {u.last_login_at ? new Date(u.last_login_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Never'}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {canAct && (
                          <button
                            type="button"
                            disabled={busyUid === u.uid}
                            onClick={() => forceLogout(u)}
                            className="px-2.5 py-1 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-50"
                          >
                            <LogOut className="w-3.5 h-3.5" /> Force logout
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="md:hidden space-y-2">
            {filtered.map(u => (
              <div key={u.uid} className="bg-white rounded-2xl border border-slate-200 p-3.5 space-y-1.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-900 truncate">{u.email}</span>
                  <span className="px-2 py-0.5 rounded bg-slate-100 font-semibold">{u.role}</span>
                </div>
                <p className="text-slate-600">Shop: {u.shop_name ?? '—'}</p>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-slate-500">
                    Last login: {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString('en-IN') : 'Never'}
                  </span>
                  {canAct && (
                    <button
                      type="button"
                      disabled={busyUid === u.uid}
                      onClick={() => forceLogout(u)}
                      className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 font-semibold"
                    >
                      Force logout
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
