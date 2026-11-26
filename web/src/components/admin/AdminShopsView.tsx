import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Search,
  Download,
  Eye,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  PauseCircle,
  PlayCircle,
  Clock,
  X,
  Loader2,
  FlaskConical
} from 'lucide-react';
import { AdminRole, AdminShopDetail, AdminShopSummary, getStateByCode, toCsv } from '@yorbalance/shared';
import { adminApi } from '../../lib/adminApi';
import { shareFile } from '../../lib/platform';

type StatusTab = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' | 'ALL';

const DOC_LABEL: Record<string, string> = {
  GST_CERTIFICATE: 'GST registration certificate',
  ADDRESS_PROOF: 'Shop address proof',
  OWNERSHIP_PROOF: 'Ownership / constitution proof',
  SHOP_FRONT_PHOTO: 'Shop front photo'
};

const fmtIst = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '—';

const StatusPill: React.FC<{ status: string }> = ({ status }) => {
  const cls =
    status === 'APPROVED'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : status === 'PENDING'
      ? 'bg-amber-50 text-amber-800 border-amber-200'
      : status === 'SUSPENDED'
      ? 'bg-slate-100 text-slate-700 border-slate-300'
      : 'bg-rose-50 text-rose-700 border-rose-200';
  return <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${cls}`}>{status}</span>;
};

interface Props {
  adminRole: AdminRole | null;
  initialTab?: StatusTab;
  openShopId?: string | null;
  onClearOpenShop?: () => void;
}

export const AdminShopsView: React.FC<Props> = ({
  adminRole,
  initialTab = 'PENDING',
  openShopId,
  onClearOpenShop
}) => {
  const [shops, setShops] = useState<AdminShopSummary[] | null>(null);
  const [tab, setTab] = useState<StatusTab>(initialTab);
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'name'>('newest');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(openShopId ?? null);
  const [error, setError] = useState<string | null>(null);

  const canAct = adminRole === 'super_admin' || adminRole === 'support';
  const PAGE_SIZE = 15;

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await adminApi.listShops();
      setShops(res.shops);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load shops');
      setShops([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (openShopId) setSelectedId(openShopId);
  }, [openShopId]);

  const counts = useMemo(() => {
    const list = shops ?? [];
    return {
      PENDING: list.filter(s => s.status === 'PENDING').length,
      APPROVED: list.filter(s => s.status === 'APPROVED').length,
      REJECTED: list.filter(s => s.status === 'REJECTED').length,
      SUSPENDED: list.filter(s => s.status === 'SUSPENDED').length,
      ALL: list.length
    };
  }, [shops]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (shops ?? []).filter(s => {
      if (tab !== 'ALL' && s.status !== tab) return false;
      const day = s.created_at.slice(0, 10);
      if (from && day < from) return false;
      if (to && day > to) return false;
      if (q) {
        const hay = `${s.name} ${s.owner_name} ${s.email} ${s.masked_gstin} ${s.masked_phone}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    if (sortBy === 'oldest') list.sort((a, b) => a.created_at.localeCompare(b.created_at));
    else if (sortBy === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    else list.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return list;
  }, [shops, tab, search, from, to, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const exportCsv = async () => {
    const csv = toCsv(
      { shop: 'YorLedger Admin', gstin: '', report: `Shops (${tab})`, period: `${from || 'All'} to ${to || 'All'}` },
      [
        { key: 'name', label: 'Shop' },
        { key: 'owner_name', label: 'Owner' },
        { key: 'masked_phone', label: 'Phone (masked)' },
        { key: 'masked_gstin', label: 'GSTIN (masked)' },
        { key: 'status', label: 'Status' },
        { key: 'plan', label: 'Plan' },
        { key: 'is_test', label: 'Test shop' },
        { key: 'created_at', label: 'Signed up' }
      ],
      filtered.map(s => ({
        name: s.name,
        owner_name: s.owner_name,
        masked_phone: s.masked_phone,
        masked_gstin: s.masked_gstin,
        status: s.status,
        plan: s.plan,
        is_test: s.is_test_shop ? 'Yes' : 'No',
        created_at: s.created_at.slice(0, 10)
      }))
    );
    await shareFile(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }), 'yorledger-shops.csv', 'Shops CSV');
  };

  return (
    <div className="space-y-4">
      {/* Status Tabs with counts */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {(['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED', 'ALL'] as StatusTab[]).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTab(t);
                setPage(1);
              }}
              className={`h-9 px-3.5 rounded-full text-xs font-bold transition-colors ${
                tab === t
                  ? 'bg-indigo-700 text-white'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              {t === 'ALL' ? 'All' : t[0] + t.slice(1).toLowerCase()} ({counts[t]})
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={exportCsv}
          className="h-9 px-3.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5"
        >
          <Download className="w-3.5 h-3.5" /> Export CSV
        </button>
      </div>

      {/* Fixed Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3.5 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={search}
            onChange={e => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search shop, owner, or email..."
            className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-300 text-sm"
          />
        </div>
        <input
          type="date"
          value={from}
          onChange={e => {
            setFrom(e.target.value);
            setPage(1);
          }}
          className="h-10 px-2.5 rounded-xl border border-slate-300 text-xs"
        />
        <span className="text-xs text-slate-400">to</span>
        <input
          type="date"
          value={to}
          onChange={e => {
            setTo(e.target.value);
            setPage(1);
          }}
          className="h-10 px-2.5 rounded-xl border border-slate-300 text-xs"
        />
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as any)}
          className="h-10 px-3 rounded-xl border border-slate-300 text-xs bg-white font-semibold"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="name">Name (A-Z)</option>
        </select>
      </div>

      {error && <p className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">{error}</p>}

      {shops === null ? (
        <div className="h-64 rounded-2xl bg-slate-200/70 animate-pulse" />
      ) : paged.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-sm text-slate-500">
          No shops in this status/filter. Switch tabs above or clear the search filter.
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="max-h-[62vh] overflow-y-auto">
              <table className="w-full text-left border-collapse text-[13px]">
                <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-[11px] uppercase font-bold text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Shop</th>
                    <th className="px-4 py-3">Owner</th>
                    <th className="px-4 py-3 whitespace-nowrap">Phone</th>
                    <th className="px-4 py-3 whitespace-nowrap">GSTIN</th>
                    <th className="px-4 py-3 whitespace-nowrap">Status</th>
                    <th className="px-4 py-3 whitespace-nowrap">Signed up</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paged.map(s => (
                    <tr
                      key={s.id}
                      onClick={() => setSelectedId(s.id)}
                      className="hover:bg-indigo-50/40 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-900">{s.name}</span>
                          {s.is_test_shop && (
                            <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 text-[10px] font-bold">
                              TEST
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-slate-700">{s.owner_name}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{s.masked_phone}</td>
                      <td className="px-4 py-2.5 font-mono text-xs">
                        <span className="text-slate-700">{s.masked_gstin}</span>
                        {!s.gstin_valid && (
                          <span className="ml-1.5 text-[10px] font-bold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded">
                            INVALID
                          </span>
                        )}
                        {s.duplicate_gstin && (
                          <span className="ml-1.5 text-[10px] font-bold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded">
                            DUP
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <StatusPill status={s.status} />
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-xs text-slate-500">
                        {s.created_at.slice(0, 10)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="text-xs font-semibold text-indigo-700">Open</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile List */}
          <div className="md:hidden space-y-2">
            {paged.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedId(s.id)}
                className="w-full text-left bg-white rounded-2xl border border-slate-200 p-3.5 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-900 truncate">{s.name}</span>
                  <StatusPill status={s.status} />
                </div>
                <p className="text-xs text-slate-600">
                  {s.owner_name} · {s.masked_phone} · <span className="font-mono">{s.masked_gstin}</span>
                </p>
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <span>{s.created_at.slice(0, 10)}</span>
                  {s.is_test_shop && <span className="text-purple-700 font-bold">TEST SHOP</span>}
                  {s.duplicate_gstin && <span className="text-amber-700 font-bold">DUPLICATE GSTIN</span>}
                </div>
              </button>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-xs text-slate-600 pt-1">
              <span>
                Page {page} of {totalPages} ({filtered.length} shops)
              </span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white disabled:opacity-40"
                >
                  Prev
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {selectedId && (
        <ShopDetailModal
          shopId={selectedId}
          canAct={canAct}
          onClose={() => {
            setSelectedId(null);
            onClearOpenShop?.();
          }}
          onChanged={load}
        />
      )}
    </div>
  );
};

const ShopDetailModal: React.FC<{
  shopId: string;
  canAct: boolean;
  onClose: () => void;
  onChanged: () => void;
}> = ({ shopId, canAct, onClose, onChanged }) => {
  const [detail, setDetail] = useState<AdminShopDetail | null>(null);
  const [revealed, setRevealed] = useState<{ phone: string; gstin: string } | null>(null);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [plan, setPlan] = useState('FREE');
  const [isTest, setIsTest] = useState(false);
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [docComments, setDocComments] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const d = await adminApi.getShopDetail({ shopId });
      setDetail(d);
      setNotes(d.admin_notes ?? '');
      setPlan(d.plan || 'FREE');
      setIsTest(Boolean(d.is_test_shop));
      setFlags(d.feature_flags ?? {});
      setDocComments(Object.fromEntries(d.documents.map(x => [x.type, x.admin_comment ?? ''])));
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load shop detail');
    }
  }, [shopId]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await load();
      onChanged();
    } catch (e: any) {
      setError(e?.message ?? 'Action failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-end sm:items-center justify-center">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full sm:max-w-3xl max-h-[100dvh] sm:max-h-[92vh] overflow-y-auto bg-white rounded-t-3xl sm:rounded-3xl"
      >
        <div className="sticky top-0 bg-white border-b border-slate-200 h-16 px-5 flex items-center justify-between z-10">
          <h2 className="text-lg font-bold text-slate-900 truncate">{detail?.name ?? 'Shop detail'}</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {error && <p className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">{error}</p>}

          {!detail ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
            </div>
          ) : (
            <>
              {/* Header Badges */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill status={detail.status} />
                  {detail.is_test_shop && (
                    <span className="px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 text-xs font-bold inline-flex items-center gap-1">
                      <FlaskConical className="w-3.5 h-3.5" /> Test shop (excluded from stats)
                    </span>
                  )}
                  {!detail.gstin_valid && (
                    <span className="px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 text-xs font-bold inline-flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> {detail.gstin_error ?? 'Invalid GSTIN'}
                    </span>
                  )}
                  {detail.duplicate_gstin && (
                    <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 text-xs font-bold">
                      Duplicate GSTIN detected
                    </span>
                  )}
                </div>
                <span className="text-xs text-slate-500">Signed up: {fmtIst(detail.created_at)}</span>
              </div>

              {/* Usage Counts (NO financial amounts) */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
                  <span className="text-[11px] font-bold uppercase text-slate-500">Bills</span>
                  <p className="text-xl font-extrabold text-slate-900 tabular-nums">{detail.counts.bills}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
                  <span className="text-[11px] font-bold uppercase text-slate-500">Parties</span>
                  <p className="text-xl font-extrabold text-slate-900 tabular-nums">{detail.counts.parties}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
                  <span className="text-[11px] font-bold uppercase text-slate-500">Stock movements</span>
                  <p className="text-xl font-extrabold text-slate-900 tabular-nums">{detail.counts.items}</p>
                </div>
              </div>

              {/* Identity + Masked Phone/GSTIN with logged Reveal */}
              <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Owner</span>
                  <span className="font-semibold text-slate-900">{detail.owner_name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Phone</span>
                  <span className="font-mono font-semibold text-slate-900">{revealed ? revealed.phone : detail.masked_phone}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">GSTIN</span>
                  <span className="font-mono font-semibold text-slate-900">{revealed ? revealed.gstin : detail.masked_gstin}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">State</span>
                  <span className="font-semibold">{getStateByCode(detail.state_code)?.name ?? ''} ({detail.state_code})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Last active</span>
                  <span className="font-semibold">{fmtIst(detail.last_active_at)}</span>
                </div>
                {canAct && !revealed && (
                  <div className="pt-2 flex justify-end">
                    <button
                      type="button"
                      disabled={busy === 'reveal'}
                      onClick={async () => {
                        setBusy('reveal');
                        try {
                          const r = await adminApi.revealSensitive({ shopId });
                          setRevealed(r);
                        } catch (e: any) {
                          setError(e?.message ?? 'Reveal failed');
                        } finally {
                          setBusy(null);
                        }
                      }}
                      className="px-3 py-1.5 rounded-xl bg-white border border-indigo-200 text-indigo-700 text-xs font-bold inline-flex items-center gap-1.5 hover:bg-indigo-50"
                    >
                      <Eye className="w-3.5 h-3.5" /> Reveal phone &amp; GSTIN (logged)
                    </button>
                  </div>
                )}
              </div>

              {/* Admin Notes, Test Flag, Plan & Feature Switches */}
              {canAct && (
                <section className="rounded-2xl border border-slate-200 p-4 space-y-3">
                  <h3 className="text-sm font-bold text-slate-900">Shop controls &amp; feature switches</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="text-xs font-bold text-slate-600">
                      Plan
                      <select
                        value={plan}
                        onChange={e => setPlan(e.target.value)}
                        className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm font-normal"
                      >
                        <option value="FREE">Free</option>
                        <option value="PRO">Pro</option>
                        <option value="ENTERPRISE">Enterprise</option>
                      </select>
                    </label>
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-700 pt-5">
                      <input type="checkbox" checked={isTest} onChange={e => setIsTest(e.target.checked)} />
                      <span>Mark as Test shop (exclude from statistics)</span>
                    </label>
                  </div>

                  <div className="flex flex-wrap gap-4 pt-1">
                    {[
                      { k: 'ocr_scan', label: 'OCR Bill Scan' },
                      { k: 'stock_tally', label: 'Stock & Tally' },
                      { k: 'whatsapp_share', label: 'WhatsApp Share' }
                    ].map(f => (
                      <label key={f.k} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                        <input
                          type="checkbox"
                          checked={flags[f.k] !== false}
                          onChange={e => setFlags(prev => ({ ...prev, [f.k]: e.target.checked }))}
                        />
                        <span>{f.label}</span>
                      </label>
                    ))}
                  </div>

                  <textarea
                    rows={2}
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Internal admin notes..."
                    className="w-full p-2.5 rounded-xl border border-slate-300 text-xs"
                  />

                  <button
                    type="button"
                    disabled={busy === 'meta'}
                    onClick={() =>
                      run('meta', () =>
                        adminApi.updateShopMeta({ shopId, is_test_shop: isTest, admin_notes: notes, feature_flags: flags, plan })
                      )
                    }
                    className="h-9 px-4 rounded-xl bg-indigo-700 text-white text-xs font-bold disabled:opacity-50"
                  >
                    {busy === 'meta' ? 'Saving...' : 'Save shop settings'}
                  </button>
                </section>
              )}

              {/* Documents */}
              <section className="space-y-2">
                <h3 className="text-sm font-bold text-slate-900">Verification documents</h3>
                {detail.documents.length === 0 ? (
                  <p className="text-xs text-slate-500">No documents uploaded.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {detail.documents.map(d => {
                      const Icon =
                        d.verification_status === 'APPROVED'
                          ? CheckCircle2
                          : d.verification_status === 'REJECTED'
                          ? XCircle
                          : Clock;
                      return (
                        <div key={d.type} className="p-3 rounded-2xl border border-slate-200 space-y-2">
                          <div className="flex gap-3">
                            <button
                              type="button"
                              onClick={() => setZoom(d.data_url)}
                              className="w-16 h-16 shrink-0 rounded-xl overflow-hidden bg-slate-100"
                            >
                              <img src={d.data_url} alt={DOC_LABEL[d.type] ?? d.type} className="w-full h-full object-cover" />
                            </button>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-900">{DOC_LABEL[d.type] ?? d.type}</p>
                              <p className="text-[11px] text-slate-500 truncate">{d.file_name}</p>
                              <p className="text-xs font-semibold flex items-center gap-1 mt-1">
                                <Icon className="w-3.5 h-3.5" /> {d.verification_status}
                              </p>
                            </div>
                          </div>
                          {canAct && (
                            <>
                              <input
                                value={docComments[d.type] ?? ''}
                                onChange={e => setDocComments({ ...docComments, [d.type]: e.target.value })}
                                placeholder="Comment (required to reject)"
                                className="w-full h-8 px-2.5 rounded-lg border border-slate-300 text-xs"
                              />
                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  type="button"
                                  disabled={!!busy}
                                  onClick={() =>
                                    run(`da-${d.type}`, () =>
                                      adminApi.reviewDocument({
                                        shopId,
                                        type: d.type,
                                        status: 'APPROVED',
                                        comment: docComments[d.type] || null
                                      })
                                    )
                                  }
                                  className="h-8 rounded-lg bg-emerald-700 text-white text-xs font-bold"
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  disabled={!!busy}
                                  onClick={() =>
                                    run(`dr-${d.type}`, () =>
                                      adminApi.reviewDocument({
                                        shopId,
                                        type: d.type,
                                        status: 'REJECTED',
                                        comment: docComments[d.type] || null
                                      })
                                    )
                                  }
                                  className="h-8 rounded-lg border border-rose-300 text-rose-700 text-xs font-bold"
                                >
                                  Reject
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Decisions: Approve / Reject / Suspend / Reactivate */}
              {canAct && (
                <section className="space-y-2">
                  <h3 className="text-sm font-bold text-slate-900">Status actions</h3>
                  <textarea
                    rows={2}
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="Reason (required for Reject or Suspend; sent to shop owner & logged in audit)"
                    className="w-full p-2.5 rounded-xl border border-slate-300 text-xs"
                  />
                  <div className="flex flex-wrap gap-2">
                    {detail.status !== 'APPROVED' && (
                      <button
                        type="button"
                        disabled={!!busy}
                        onClick={() => run('approve', () => adminApi.decideShop({ shopId, decision: 'APPROVED', reason }))}
                        className="h-10 px-4 rounded-xl bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5"
                      >
                        <CheckCircle2 className="w-4 h-4" /> Approve
                      </button>
                    )}
                    {detail.status !== 'REJECTED' && (
                      <button
                        type="button"
                        disabled={!!busy}
                        onClick={() => run('reject', () => adminApi.decideShop({ shopId, decision: 'REJECTED', reason }))}
                        className="h-10 px-4 rounded-xl bg-rose-700 text-white text-xs font-bold inline-flex items-center gap-1.5"
                      >
                        <XCircle className="w-4 h-4" /> Reject
                      </button>
                    )}
                    {detail.status === 'APPROVED' && (
                      <button
                        type="button"
                        disabled={!!busy}
                        onClick={() => run('suspend', () => adminApi.decideShop({ shopId, decision: 'SUSPENDED', reason }))}
                        className="h-10 px-4 rounded-xl bg-slate-800 text-white text-xs font-bold inline-flex items-center gap-1.5"
                      >
                        <PauseCircle className="w-4 h-4" /> Suspend
                      </button>
                    )}
                    {detail.status === 'SUSPENDED' && (
                      <button
                        type="button"
                        disabled={!!busy}
                        onClick={() => run('reactivate', () => adminApi.decideShop({ shopId, decision: 'REACTIVATED', reason }))}
                        className="h-10 px-4 rounded-xl bg-indigo-700 text-white text-xs font-bold inline-flex items-center gap-1.5"
                      >
                        <PlayCircle className="w-4 h-4" /> Reactivate
                      </button>
                    )}
                  </div>
                </section>
              )}

              {/* Verification History */}
              <section>
                <h3 className="text-sm font-bold text-slate-900 mb-2">Review history</h3>
                {detail.history.length === 0 ? (
                  <p className="text-xs text-slate-500">No decisions yet.</p>
                ) : (
                  <div className="divide-y divide-slate-100 text-xs">
                    {detail.history.map(h => (
                      <div key={h.id} className="py-2">
                        <p className="font-semibold text-slate-900">
                          {h.decision} · {fmtIst(h.decided_at)} · {h.decided_by}
                        </p>
                        {h.reason && <p className="text-slate-600 mt-0.5">{h.reason}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>

        {zoom && (
          <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4" onClick={() => setZoom(null)}>
            <img src={zoom} alt="Document" className="max-w-full max-h-full object-contain" />
          </div>
        )}
      </div>
    </div>
  );
};
