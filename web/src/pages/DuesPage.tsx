import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, MessageCircle, SlidersHorizontal } from 'lucide-react';
import { formatPaiseToINR } from '@yorbalance/shared';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { useLive } from '../lib/useLiveData';
import { useShell } from '../components/layout/AppShell';
import { statusOf } from '../components/simple/BillRow';
import { openWhatsApp, reminderMessage } from '../lib/whatsapp';

type Tab = 'pending' | 'completed';
type Dir = 'all' | 'collect' | 'pay';
const BADGE: Record<string, string> = {
  SETTLED: 'bg-emerald-100 text-emerald-800', PENDING: 'bg-amber-100 text-amber-900', PARTIAL: 'bg-sky-100 text-sky-900', OVERDUE: 'bg-rose-100 text-rose-800'
};

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
  const rs = (p: number) => formatPaiseToINR(p, true);

  const { data: bills } = useLive(() => api.getAllBills(), []);
  const { data: partyData } = useLive(() => api.getParties(), []);
  const parties = partyData?.parties ?? [];
  const phoneOf = useMemo(() => new Map(parties.map(p => [p.id, p.phone])), [parties]);

  // §10.2 summary cards: always over all open bills, exact paise.
  const summary = useMemo(() => {
    let rec = 0, pay = 0, odRec = 0, odPay = 0;
    for (const b of bills ?? []) {
      if (b.pending_paise <= 0) continue;
      const late = statusOf(b) === 'OVERDUE';
      if (b.type === 'SALE') { rec += b.pending_paise; if (late) odRec += b.pending_paise; }
      else { pay += b.pending_paise; if (late) odPay += b.pending_paise; }
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
    { label: t('total_receivable'), v: summary.rec, cls: 'bg-emerald-50 text-emerald-900 border-emerald-200' },
    { label: t('total_payable'), v: summary.pay, cls: 'bg-rose-50 text-rose-900 border-rose-200' },
    { label: t('overdue_receivable'), v: summary.odRec, cls: 'bg-amber-50 text-amber-900 border-amber-200' },
    { label: t('overdue_payable'), v: summary.odPay, cls: 'bg-amber-50 text-amber-900 border-amber-200' }
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">{t('nav_dues')}</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(c => (
          <div key={c.label} className={`rounded-2xl border-2 p-3 ${c.cls}`}>
            <p className="text-sm font-semibold">{c.label}</p>
            <p className="text-xl sm:text-2xl font-extrabold break-all">{bills ? rs(c.v) : '…'}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2" role="tablist">
        {(['pending', 'completed'] as Tab[]).map(x => (
          <button key={x} role="tab" aria-selected={tab === x} onClick={() => setTab(x)}
            className={`h-12 rounded-xl text-base font-bold ${tab === x ? 'bg-indigo-700 text-white' : 'bg-white border-2 border-slate-200 text-slate-700'}`}>
            {x === 'pending' ? t('tab_pending') : t('tab_completed')}
          </button>
        ))}
      </div>

      <div className="flex gap-2 overflow-x-auto">
        {(['all', 'collect', 'pay'] as Dir[]).map(d => (
          <button key={d} onClick={() => setDir(d)}
            className={`h-11 px-4 shrink-0 rounded-full text-base font-semibold ${dir === d ? 'bg-slate-800 text-white' : 'bg-white border-2 border-slate-200 text-slate-700'}`}>
            {d === 'all' ? t('dir_all') : d === 'collect' ? t('tab_collect') : t('tab_pay')}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="w-5 h-5 absolute left-3 top-3.5 text-slate-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={`${t('search_party')} / ${t('bill_no')}`} className={`${field} pl-10`} />
        </div>
        <button onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters}
          className={`h-12 px-4 rounded-xl border-2 text-base font-semibold flex items-center gap-2 ${activeFilters ? 'border-indigo-600 bg-indigo-50 text-indigo-800' : 'border-slate-200 bg-white'}`}>
          <SlidersHorizontal className="w-5 h-5" /> {t('filters')}{activeFilters ? ` (${activeFilters})` : ''}
        </button>
      </div>
      {showFilters && (
        <div className="rounded-2xl bg-white border border-slate-200 p-4 grid gap-3 sm:grid-cols-2">
          <label className="text-base font-semibold sm:col-span-2">{t('party_filter')}
            <select value={partyId} onChange={e => setPartyId(e.target.value)} className={`${field} mt-1`}>
              <option value="">{t('any')}</option>
              {parties.slice().sort((a, b) => a.name.localeCompare(b.name)).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="text-base font-semibold">{t('bill_date_range')} · {t('from_date')}<input type="date" value={billFrom} onChange={e => setBillFrom(e.target.value)} className={`${field} mt-1`} /></label>
          <label className="text-base font-semibold">{t('bill_date_range')} · {t('to_date')}<input type="date" value={billTo} onChange={e => setBillTo(e.target.value)} className={`${field} mt-1`} /></label>
          <label className="text-base font-semibold">{t('due_date_range')} · {t('from_date')}<input type="date" value={dueFrom} onChange={e => setDueFrom(e.target.value)} className={`${field} mt-1`} /></label>
          <label className="text-base font-semibold">{t('due_date_range')} · {t('to_date')}<input type="date" value={dueTo} onChange={e => setDueTo(e.target.value)} className={`${field} mt-1`} /></label>
          {!!activeFilters && (
            <button onClick={() => { setPartyId(''); setBillFrom(''); setBillTo(''); setDueFrom(''); setDueTo(''); }}
              className="h-12 rounded-xl border-2 border-slate-200 text-base font-semibold sm:col-span-2">{t('clear_filters')}</button>
          )}
        </div>
      )}

      {bills === null && <p className="py-8 text-center text-base text-slate-500">{t('loading')}</p>}
      {bills && !list.length && <p className="py-10 text-center text-lg text-slate-500">{t('nothing_pending')}</p>}

      <div className="grid gap-3 lg:grid-cols-2">
        {list.map(b => {
          const st = statusOf(b);
          const collect = b.type === 'SALE';
          const credit = b.grand_total_paise - (b.return_paise ?? 0) - b.paid_paise;
          return (
            <article key={b.id} className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3">
              <button onClick={() => navigate(`/history?bill=${b.id}`)} className="w-full text-left">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-slate-900 truncate">{b.party_name}</p>
                    <p className="text-sm text-slate-600">{t(`kind_${b.type}` as any)} · #{b.invoice_number} · {fmtDate(b.invoice_date)}{b.due_date ? ` · ${t('due_date')} ${fmtDate(b.due_date)}` : ''}</p>
                  </div>
                  <span className={`shrink-0 px-2 py-1 rounded-full text-sm font-bold ${BADGE[st]}`}>{t(`status_${st}` as any)}</span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-sm text-slate-600 [&_b]:text-sm sm:[&_b]:text-base [&_b]:break-all [&>span]:min-w-0">
                  <span>{t('bill_total')}<b className="block text-base text-slate-900">{rs(b.grand_total_paise)}</b></span>
                  <span>{t('returned')}<b className="block text-base text-slate-900">{rs(b.return_paise ?? 0)}</b></span>
                  <span>{t('paid')}<b className="block text-base text-slate-900">{rs(b.paid_paise)}</b></span>
                </div>
                <p className={`mt-2 text-2xl font-extrabold ${collect ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {tab === 'pending' ? rs(b.pending_paise) : credit < 0 ? `${t('credit')} ${rs(-credit)}` : rs(0)}
                </p>
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
  );
};
