import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCircle2, XCircle, Clock, Search, LogOut, Loader2, ShieldCheck, X } from 'lucide-react';
import { Shop, ShopDocument, ShopVerification, getStateByCode } from '@yorbalance/shared';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import type { AdminNotification } from '../lib/data/session';

type Filter = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL';
const DOC_LABEL: Record<string, string> = {
  GST_CERTIFICATE: 'GST registration certificate', ADDRESS_PROOF: 'Shop address proof',
  OWNERSHIP_PROOF: 'Ownership / constitution proof', SHOP_FRONT_PHOTO: 'Shop front photo'
};
const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '—');

/** §4 Admin review: queue of shops, per-document review, approve / reject with reason, audit history. */
export const AdminDashboardPage: React.FC = () => {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('PENDING');
  const [q, setQ] = useState('');
  const [shops, setShops] = useState<Shop[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inbox, setInbox] = useState<AdminNotification[]>([]);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const seen = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setShops((await api.getAdminShops(filter)).shops);
    } catch (e: any) {
      setError(e.message);
      setShops([]);
    }
  }, [filter]);
  useEffect(() => { load(); }, [load]);

  // Live inbox; a system notification for new registrations while this page is open (no server push on Spark).
  useEffect(() => api.watchAdminNotifications(items => {
    setInbox(items);
    if (seen.current) {
      const fresh = items.filter(i => !i.read && !seen.current!.has(i.id));
      if (fresh.length) {
        load();
        if ('Notification' in window && Notification.permission === 'granted') {
          fresh.forEach(i => new Notification('YorLedger admin', { body: `${i.kind === 'SHOP_REGISTERED' ? 'New shop' : 'Resubmitted'}: ${i.shop_name}` }));
        }
      }
    }
    seen.current = new Set(items.map(i => i.id));
  }), [load]);
  useEffect(() => { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); }, []);

  const unread = inbox.filter(i => !i.read).length;
  const list = (shops ?? []).filter(s => {
    const n = q.trim().toLowerCase();
    return !n || s.name.toLowerCase().includes(n) || s.gstin.toLowerCase().includes(n) || s.owner_name.toLowerCase().includes(n) || s.phone.includes(n);
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 h-16 px-4 flex items-center justify-between">
        <div className="flex items-center gap-2"><ShieldCheck className="w-6 h-6 text-indigo-700" /><span className="text-lg font-bold">YorLedger Admin</span></div>
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline text-sm text-slate-500">{user?.email}</span>
          <button onClick={() => setInboxOpen(true)} aria-label="Notifications" className="relative w-12 h-12 rounded-full hover:bg-slate-100 flex items-center justify-center">
            <Bell className="w-6 h-6" />
            {unread > 0 && <span className="absolute top-1 right-1 min-w-[20px] h-5 px-1 rounded-full bg-rose-600 text-white text-xs font-bold flex items-center justify-center">{unread}</span>}
          </button>
          <button onClick={async () => { await logout(); navigate('/admin-login'); }} className="h-11 px-3 rounded-xl border-2 border-slate-200 text-base font-semibold text-rose-700 flex items-center gap-2">
            <LogOut className="w-5 h-5" /> Sign out
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 space-y-4">
        <h1 className="text-2xl font-bold">Shop verification</h1>
        <div className="flex gap-2 overflow-x-auto">
          {(['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as Filter[]).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`h-11 px-4 shrink-0 rounded-full text-base font-semibold ${filter === f ? 'bg-indigo-700 text-white' : 'bg-white border-2 border-slate-200'}`}>
              {f === 'ALL' ? 'All' : f[0] + f.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="w-5 h-5 absolute left-3 top-3.5 text-slate-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search shop, GSTIN, owner or phone"
            className="w-full h-12 pl-10 pr-3 rounded-xl border-2 border-slate-200 bg-white text-base focus:border-indigo-600 focus:outline-none" />
        </div>
        {error && <p className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800">{error}</p>}
        {shops === null && <p className="py-8 text-center text-slate-500">Loading…</p>}
        {shops && !list.length && <p className="py-8 text-center text-slate-500">No shops here.</p>}
        <div className="space-y-2">
          {list.map(s => (
            <button key={s.id} onClick={() => setOpenId(s.id)} className="w-full text-left p-4 rounded-2xl bg-white border border-slate-200 hover:border-indigo-300">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-lg font-bold truncate">{s.name}</p>
                  <p className="text-sm text-slate-600">{s.owner_name} · {s.phone} · <span className="font-mono">{s.gstin}</span></p>
                  <p className="text-sm text-slate-500">Submitted {fmt(s.updated_at)}</p>
                </div>
                <StatusPill status={s.status} />
              </div>
            </button>
          ))}
        </div>
      </main>

      {inboxOpen && (
        <Panel title="Notifications" onClose={() => setInboxOpen(false)}>
          {!inbox.length && <p className="py-8 text-center text-slate-500">No notifications</p>}
          {inbox.map(n => (
            <button key={n.id} onClick={() => { api.markAdminNotificationRead(n.id); setInboxOpen(false); setOpenId(n.shop_id); }}
              className={`w-full text-left p-3 mb-2 rounded-xl border-2 ${n.read ? 'border-slate-200' : 'border-indigo-300 bg-indigo-50'}`}>
              <p className="text-base font-semibold">{n.kind === 'SHOP_REGISTERED' ? 'New shop registered' : 'Shop resubmitted after rejection'}: {n.shop_name}</p>
              <p className="text-sm text-slate-500">{fmt(n.created_at)}</p>
            </button>
          ))}
        </Panel>
      )}

      {openId && <ShopReview shopId={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  );
};

const StatusPill: React.FC<{ status: string }> = ({ status }) => {
  const m: Record<string, string> = { PENDING: 'bg-amber-100 text-amber-900', APPROVED: 'bg-emerald-100 text-emerald-800', REJECTED: 'bg-rose-100 text-rose-800' };
  return <span className={`shrink-0 px-3 py-1 rounded-full text-sm font-bold ${m[status] ?? ''}`}>{status}</span>;
};

const Panel: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-end sm:items-center justify-center">
    <div role="dialog" aria-modal="true" aria-label={title} className="w-full sm:max-w-2xl max-h-[100dvh] sm:max-h-[92vh] overflow-y-auto bg-white rounded-t-3xl sm:rounded-3xl">
      <div className="sticky top-0 bg-white border-b border-slate-200 h-16 px-4 flex items-center justify-between z-10">
        <h2 className="text-xl font-bold">{title}</h2>
        <button onClick={onClose} aria-label="Close" className="w-12 h-12 rounded-full hover:bg-slate-100 flex items-center justify-center"><X className="w-6 h-6" /></button>
      </div>
      <div className="p-4 sm:p-6">{children}</div>
    </div>
  </div>
);

const ShopReview: React.FC<{ shopId: string; onClose: () => void; onChanged: () => void }> = ({ shopId, onClose, onChanged }) => {
  const [data, setData] = useState<{ shop: Shop; documents: ShopDocument[]; history: ShopVerification[] } | null>(null);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const d = await api.getAdminShopDetails(shopId) as any;
      setData(d);
      setComments(Object.fromEntries(d.documents.map((x: ShopDocument) => [x.type, x.admin_comment ?? ''])));
    } catch (e: any) { setError(e.message); }
  }, [shopId]);
  useEffect(() => { reload(); }, [reload]);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try { await fn(); await reload(); onChanged(); } catch (e: any) { setError(e.message); } finally { setBusy(null); }
  };

  if (!data) return <Panel title="Shop" onClose={onClose}>{error ? <p className="text-rose-700">{error}</p> : <Loader2 className="w-8 h-8 mx-auto animate-spin text-slate-400" />}</Panel>;
  const { shop, documents, history } = data;
  const row = (l: string, v?: string | null) => <div className="flex justify-between gap-4 py-2 border-b border-slate-100"><span className="text-slate-500">{l}</span><span className="font-semibold text-right break-all">{v || '—'}</span></div>;
  const ST = { PENDING: Clock, APPROVED: CheckCircle2, REJECTED: XCircle } as const;

  return (
    <Panel title={shop.name} onClose={onClose}>
      <div className="space-y-5">
        <div className="flex items-center justify-between"><StatusPill status={shop.status} /><span className="text-sm text-slate-500">Registered {fmt(shop.created_at)}</span></div>
        {error && <p className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800">{error}</p>}
        <section>
          {row('Owner', shop.owner_name)}{row('GSTIN', shop.gstin)}{row('State', `${getStateByCode(shop.state_code)?.name ?? ''} (${shop.state_code})`)}
          {row('Mobile', shop.phone)}{row('Email', shop.email)}{row('Address', shop.address)}{row('PIN', shop.pin_code)}
          {row('Default GST', `${shop.default_gst_bp / 100}%`)}
        </section>

        <section>
          <h3 className="text-lg font-bold mb-2">Documents</h3>
          {!documents.length && <p className="text-slate-500">No documents uploaded.</p>}
          <div className="space-y-3">
            {documents.map(d => {
              const I = ST[d.verification_status];
              return (
                <div key={d.type} className="p-3 rounded-2xl border-2 border-slate-200">
                  <div className="flex gap-3">
                    <button onClick={() => setZoom(d.data_url)} className="w-24 h-24 shrink-0 rounded-xl overflow-hidden bg-slate-100">
                      <img src={d.data_url} alt={DOC_LABEL[d.type]} className="w-full h-full object-cover" />
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-bold">{DOC_LABEL[d.type]}</p>
                      <p className="text-sm text-slate-500 truncate">{d.file_name} · {fmt(d.uploaded_at)}</p>
                      <p className="text-sm font-semibold flex items-center gap-1"><I className="w-4 h-4" /> {d.verification_status}</p>
                    </div>
                  </div>
                  <input value={comments[d.type] ?? ''} onChange={e => setComments({ ...comments, [d.type]: e.target.value })}
                    placeholder="Comment (required to reject)" className="mt-2 w-full h-11 px-3 rounded-xl border-2 border-slate-200 text-base" />
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button disabled={!!busy} onClick={() => run(`a-${d.type}`, () => api.adminReviewDocument(shop.id, d.type, 'APPROVED', comments[d.type] || null))}
                      className="h-11 rounded-xl bg-emerald-700 text-white font-bold disabled:opacity-60">Approve</button>
                    <button disabled={!!busy} onClick={() => run(`r-${d.type}`, () => api.adminReviewDocument(shop.id, d.type, 'REJECTED', comments[d.type] || null))}
                      className="h-11 rounded-xl border-2 border-rose-300 text-rose-700 font-bold disabled:opacity-60">Reject</button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-lg font-bold">Decision</h3>
          <textarea rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (required to reject; shown to the shop owner)"
            className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 text-base" />
          <div className="grid grid-cols-2 gap-2">
            <button disabled={!!busy} onClick={() => run('approve', () => api.recordAdminDecision(shop.id, { decision: 'APPROVED', reason: reason || undefined }))}
              className="h-14 rounded-2xl bg-emerald-700 text-white text-lg font-bold disabled:opacity-60">{busy === 'approve' ? '…' : 'Approve shop'}</button>
            <button disabled={!!busy} onClick={() => run('reject', () => api.recordAdminDecision(shop.id, { decision: 'REJECTED', reason }))}
              className="h-14 rounded-2xl bg-rose-700 text-white text-lg font-bold disabled:opacity-60">{busy === 'reject' ? '…' : 'Reject shop'}</button>
          </div>
        </section>

        <section>
          <h3 className="text-lg font-bold mb-2">Review history</h3>
          {!history.length && <p className="text-slate-500">No decisions yet.</p>}
          {history.map(h => (
            <div key={h.id} className="py-2 border-b border-slate-100">
              <p className="font-semibold">{h.decision} · {fmt(h.decided_at)} · {h.decided_by}</p>
              {h.reason && <p className="text-slate-700">{h.reason}</p>}
            </div>
          ))}
        </section>
      </div>
      {zoom && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4" onClick={() => setZoom(null)}>
          <img src={zoom} alt="Document" className="max-w-full max-h-full object-contain" />
        </div>
      )}
    </Panel>
  );
};
