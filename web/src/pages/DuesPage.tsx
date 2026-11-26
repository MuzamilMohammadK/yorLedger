import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, MessageCircle, SlidersHorizontal } from 'lucide-react';
import { formatPaiseToINR } from '@yorbalance/shared';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { useLive } from '../lib/useLiveData';
import { useShell } from '../components/layout/AppShell';
import { statusOf } from '../components/simple/BillRow';
import { StatusBadge } from '../components/ui/StatusBadge';
import { openWhatsApp, reminderMessage } from '../lib/whatsapp';

type Tab = 'pending' | 'completed';
type Dir = 'all' | 'collect' | 'pay';

/**
 * §10 Dues. Amount due = grand total − returns − payments (original total never changes).
 * SALE → Collect; PURCHASE / JOB_WORK → Pay. Pending: due > 0. Completed: due ≤ 0.
 * Partial / Overdue are display labels only; overdue needs a due (reminder) date in the past.
 */
export const DuesPage: React.FC = () => {
  const { t, fmtDate } = useI18n();
  const { shop } = useAuth();
  const shell = useShell();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const legacy = params.get('tab'); // Dashboard links: ?tab=collect | pay
  const tab: Tab = legacy === 'completed' || legacy === 'done' ? 'completed' : 'pending';
  const [dir, setDir] = useState<Dir>(legacy === 'collect' ? 'collect' : legacy === 'pay' ? 'pay' : 'all');
  const [q, setQ] = useState('');
  const [partyId, setPartyId] = useState('');
  const [billFrom, setBillFrom] = useState('');
  const [billTo, setBillTo] = useState('');
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const listScrollRef = useRef<HTMLDivElement>(null);
  const rs = (p: number) => formatPaiseToINR(p, true);

  useEffect(() => {
    if (listScrollRef.current) listScrollRef.current.scrollTop = 0;
  }, [tab, dir, q, partyId, billFrom, billTo, dueFrom, dueTo]);

  const { data: bills } = useLive(() => api.getAllBills(), []);
  const { data: partyData } = useLive(() => api.getParties(), []);
  const parties = partyData?.parties ?? [];
  const phoneOf = useMemo(() => new Map(parties.map(p => [p.id, p.phone])), [parties]);

  // §10.2 summary cards: net receivable/payable per party (unused return/advance credit reduces party dues) and overdue totals.
  const summary = useMemo(() => {
    const byParty = new Map<string, { saleNet: number; purNet: number; odRec: number; odPay: number }>();
    for (const b of bills ?? []) {
      const due = b.grand_total_paise - (b.return_paise ?? 0) - b.paid_paise;
      const cur = byParty.get(b.party_id) ?? { saleNet: 0, purNet: 0, odRec: 0, odPay: 0 };
      const late = b.pending_paise > 0 && statusOf(b) === 'OVERDUE';
      if (b.type === 'SALE') {
        cur.saleNet += due;
        if (late) cur.odRec += b.pending_paise;
      } else {
        cur.purNet += due;
        if (late) cur.odPay += b.pending_paise;
      }
      byParty.set(b.party_id, cur);
    }
    let rec = 0, pay = 0, odRec = 0, odPay = 0;
    for (const v of byParty.values()) {
      const netSale = Math.max(0, v.saleNet);
      const netPur = Math.max(0, v.purNet);
      rec += netSale;
      pay += netPur;
      odRec += Math.min(netSale, v.odRec);
      odPay += Math.min(netPur, v.odPay);
    }
    return { rec, pay, odRec, odPay };
  }, [bills]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const digits = needle.replace(/\D/g, '');
    return (bills ?? [])
      .filter(b => (tab === 'pending' ? b.pending_paise > 0 : b.pending_paise <= 0))
      .filter(b => dir === 'all' || (dir === 'collect' ? b.type === 'SALE' : b.type !== 'SALE'))
      .filter(b => !partyId || b.party_id === partyId)
      .filter(b => (!billFrom || b.invoice_date >= billFrom) && (!billTo || b.invoice_date <= billTo))
      .filter(b => (!dueFrom || (b.due_date ?? '') >= dueFrom) && (!dueTo || (!!b.due_date && b.due_date <= dueTo)))
      .filter(b => !needle || b.party_name.toLowerCase().includes(needle) || b.invoice_number.includes(needle) ||
        (digits.length >= 3 && (phoneOf.get(b.party_id) ?? '').includes(digits)))
      .sort((a, b) => {
        const la = statusOf(a) === 'OVERDUE' ? 0 : 1, lb = statusOf(b) === 'OVERDUE' ? 0 : 1;
        return tab === 'completed' ? b.invoice_date.localeCompare(a.invoice_date) : la - lb || a.invoice_date.localeCompare(b.invoice_date);
      });
  }, [bills, tab, dir, partyId, billFrom, billTo, dueFrom, dueTo, q, phoneOf]);

  const setTab = (x: Tab) => setParams(x === 'completed' ? { tab: 'completed' } : {});
  const activeFilters = [partyId, billFrom, billTo, dueFrom, dueTo].filter(Boolean).length;
  const field = 'w-full h-12 px-3 rounded-xl border-2 border-slate-200 bg-white text-base focus:border-indigo-600 focus:outline-none';
  const cards = [
    { label: t('total_receivable'), v: summary.rec, amtCls: 'text-emerald-700' },
    { label: t('total_payable'), v: summary.pay, amtCls: 'text-rose-700' },
    { label: t('overdue_receivable'), v: summary.odRec, amtCls: 'text-amber-700' },
    { label: t('overdue_payable'), v: summary.odPay, amtCls: 'text-amber-700' }
  ];

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2.5 overflow-hidden min-w-0">
      <div className="shrink-0 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">{t('nav_dues')}</h1>
        </div>

        {/* One compact row of 4 neutral white KPI cards with coloured amount */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {cards.map(c => (
            <div key={c.label} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <p className="text-xs font-semibold text-slate-500 truncate">{c.label}</p>
              <p className={`text-base sm:text-lg font-extrabold tabular-nums truncate ${c.amtCls}`}>{bills ? rs(c.v) : '…'}</p>
            </div>
          ))}
        </div>

        {/* One row of tabs + direction pills */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="grid grid-cols-2 gap-1.5 min-w-[220px]" role="tablist">
            {(['pending', 'completed'] as Tab[]).map(x => (
              <button key={x} role="tab" aria-selected={tab === x} onClick={() => setTab(x)}
                className={`h-9 px-3 rounded-xl text-sm font-bold ${tab === x ? 'bg-indigo-700 text-white' : 'bg-white border border-slate-200 text-slate-700'}`}>
                {x === 'pending' ? t('tab_pending') : t('tab_completed')}
              </button>
            ))}
          </div>

          <div className="flex gap-1.5 overflow-x-auto">
            {(['all', 'collect', 'pay'] as Dir[]).map(d => (
              <button key={d} onClick={() => setDir(d)}
                className={`h-9 px-3.5 shrink-0 rounded-full text-sm font-semibold ${dir === d ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-700'}`}>
                {d === 'all' ? t('dir_all') : d === 'collect' ? t('tab_collect') : t('tab_pay')}
              </button>
            ))}
          </div>
        </div>

        {/* One row of search + Filters */}
        <div className="flex gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder={`${t('search_party')} / ${t('bill_no')}`} className={`${field} h-10 pl-9 text-sm`} />
          </div>
          <button onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters}
            className={`h-10 px-3.5 shrink-0 rounded-xl border text-sm font-semibold flex items-center gap-2 ${activeFilters ? 'border-indigo-600 bg-indigo-50 text-indigo-800' : 'border-slate-200 bg-white'}`}>
            <SlidersHorizontal className="w-4 h-4" /> {t('filters')}{activeFilters ? ` (${activeFilters})` : ''}
          </button>
        </div>
        {showFilters && (
          <div className="rounded-2xl bg-white border border-slate-200 p-3 grid gap-2.5 sm:grid-cols-2">
            <label className="text-sm font-semibold sm:col-span-2">{t('party_filter')}
              <select value={partyId} onChange={e => setPartyId(e.target.value)} className={`${field} mt-1`}>
                <option value="">{t('any')}</option>
                {parties.slice().sort((a, b) => a.name.localeCompare(b.name)).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className="text-sm font-semibold">{t('bill_date_range')} · {t('from_date')}<input type="date" value={billFrom} onChange={e => setBillFrom(e.target.value)} className={`${field} mt-1`} /></label>
            <label className="text-sm font-semibold">{t('bill_date_range')} · {t('to_date')}<input type="date" value={billTo} onChange={e => setBillTo(e.target.value)} className={`${field} mt-1`} /></label>
            <label className="text-sm font-semibold">{t('due_date_range')} · {t('from_date')}<input type="date" value={dueFrom} onChange={e => setDueFrom(e.target.value)} className={`${field} mt-1`} /></label>
            <label className="text-sm font-semibold">{t('due_date_range')} · {t('to_date')}<input type="date" value={dueTo} onChange={e => setDueTo(e.target.value)} className={`${field} mt-1`} /></label>
            {!!activeFilters && (
              <button onClick={() => { setPartyId(''); setBillFrom(''); setBillTo(''); setDueFrom(''); setDueTo(''); }}
                className="h-11 rounded-xl border-2 border-slate-200 text-sm font-semibold sm:col-span-2">{t('clear_filters')}</button>
            )}
          </div>
        )}
      </div>

      {bills === null && <p className="py-8 text-center text-base text-slate-500">{t('loading')}</p>}
      {bills && !list.length && <p className="py-10 text-center text-lg text-slate-500">{t('nothing_pending')}</p>}

      {list.length > 0 && (
        <div ref={listScrollRef} className="flex-1 min-h-0 overflow-y-auto pb-4">
          <div className="grid gap-3 lg:grid-cols-2">
        {list.map(b => {
          const st = statusOf(b);
          const collect = b.type === 'SALE';
          const credit = b.grand_total_paise - (b.return_paise ?? 0) - b.paid_paise;
          const retTaxPaise = (b.returns ?? []).reduce(
            (s, r) => s + (r.tax_paise ?? ((r.cgst_paise ?? 0) + (r.sgst_paise ?? 0) + (r.igst_paise ?? 0))),
            0
          );
          return (
            <article key={b.id} className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3 min-w-0">
              <button onClick={() => navigate(`/history?bill=${b.id}`)} className="w-full text-left">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-slate-900 truncate">{b.party_name}</p>
                    <p className="text-sm text-slate-600">{t(`kind_${b.type}` as any)} · #{b.invoice_number} · {fmtDate(b.invoice_date)}{b.due_date ? ` · ${t('due_date')} ${fmtDate(b.due_date)}` : ''}</p>
                  </div>
                  <StatusBadge status={st} className="shrink-0" />
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-sm text-slate-600 [&>span]:min-w-0">
                  <span>{t('bill_total')}<b className="block text-base text-slate-900 tabular-nums">{rs(b.grand_total_paise)}</b></span>
                  <span>
                    {t('returned')}
                    <b className="block text-base text-slate-900 tabular-nums">{rs(b.return_paise ?? 0)}</b>
                    {(b.return_paise ?? 0) > 0 && retTaxPaise > 0 && (
                      <span className="block text-[11px] text-slate-500">incl. GST {rs(retTaxPaise)}</span>
                    )}
                  </span>
                  <span>
                    {t('paid')}
                    <b className="block text-base text-slate-900 tabular-nums">{rs(b.paid_paise)}</b>
                    {b.payments && b.payments.length > 0 && (
                      <span className="block text-xs font-normal text-emerald-700">
                        {fmtDate(b.payments[b.payments.length - 1].payment_date)}
                      </span>
                    )}
                  </span>
                </div>
                {b.payments && b.payments.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-100 flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                    <span className="font-semibold text-slate-700">Payment date(s):</span>
                    {b.payments.map((p, idx) => (
                      <span key={p.id || idx} className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                        {fmtDate(p.payment_date)}: <b className="text-emerald-700 tabular-nums">{rs(p.amount_paise)}</b>
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-2">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Balance due</span>
                  <p className={`text-2xl font-extrabold tabular-nums ${collect ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {tab === 'pending' ? rs(b.pending_paise) : credit < 0 ? `${t('credit')} ${rs(-credit)}` : rs(0)}
                  </p>
                </div>
              </button>
              {tab === 'pending' && (
                <div className="flex gap-2">
                  <button onClick={() => shell.openPayment(b.id)} className={`flex-1 h-12 rounded-xl text-white text-base font-bold ${collect ? 'bg-emerald-700' : 'bg-rose-700'}`}>
                    {collect ? t('collect') : t('pay')}
                  </button>
                  {collect && phoneOf.get(b.party_id) && (
                    <button onClick={() => openWhatsApp(phoneOf.get(b.party_id)!, reminderMessage(shop?.name ?? '', b.party_name, b))}
                      className="h-12 px-4 rounded-xl bg-[#25D366] text-white text-base font-bold flex items-center gap-2">
                      <MessageCircle className="w-5 h-5" /> {t('remind')}
                    </button>
                  )}
                </div>
              )}
            </article>
          );
        })}
          </div>
        </div>
      )}
    </div>
  );
};
