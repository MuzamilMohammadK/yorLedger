import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal } from 'lucide-react';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { useLive } from '../lib/useLiveData';
import { todayIST } from '../lib/data/util';
import { BillRow } from '../components/simple/BillRow';
import { TransactionsTable, TxRow } from '../components/simple/TransactionsTable';
import { BillDetailsSheet } from '../components/simple/BillDetailsSheet';

const KINDS = ['ALL', 'SALE', 'PURCHASE', 'JOB_WORK', 'PAYMENT', 'RETURN'] as const;
const STATUSES = ['ALL', 'PENDING', 'PARTIAL', 'OVERDUE', 'SETTLED'] as const;
const PAGE = 50;

/** §9 History: every bill, payment and return, with search, filters, pagination and details. */
export const HistoryPage: React.FC = () => {
  const { t, fmtDate } = useI18n();
  const [params, setParams] = useSearchParams();
  const [kind, setKind] = useState<typeof KINDS[number]>('ALL');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [partyId, setPartyId] = useState(params.get('party') ?? '');
  const [status, setStatus] = useState<typeof STATUSES[number]>('ALL');
  const [minAmt, setMinAmt] = useState('');
  const [maxAmt, setMaxAmt] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const openId = params.get('bill');

  const { data: partyData } = useLive(() => api.getParties(), []);
  const { data } = useLive(
    () => api.getHistory({
      type: kind as any, search: q || undefined, startDate: from || undefined, endDate: to || undefined,
      partyId: partyId || undefined, minAmount: minAmt ? Number(minAmt) : undefined, maxAmount: maxAmt ? Number(maxAmt) : undefined,
      limit: 100000
    }),
    [kind, q, from, to, partyId, minAmt, maxAmt]
  );
  const { data: openBill } = useLive(
    () => (openId ? api.getHistoryDetails(openId).then(r => r.transaction).catch(() => null) : Promise.resolve(null)),
    [openId]
  );

  // Payment status applies to bills (payments and returns have no due).
  const rows: TxRow[] = useMemo(() => {
    const all = (data?.transactions ?? []) as TxRow[];
    return status === 'ALL' ? all : all.filter(r => r.item_kind === 'TRANSACTION' && r.status === status);
  }, [data, status]);
  const page = rows.slice(0, shown);

  const groups = useMemo(() => {
    const today = todayIST();
    const y = new Date(`${today}T00:00:00Z`); y.setUTCDate(y.getUTCDate() - 1);
    const yesterday = y.toISOString().slice(0, 10);
    const out: { label: string; rows: TxRow[] }[] = [];
    for (const r of page) {
      const label = r.invoice_date === today ? t('today') : r.invoice_date === yesterday ? t('yesterday') : fmtDate(r.invoice_date);
      if (!out.length || out[out.length - 1].label !== label) out.push({ label, rows: [] });
      out[out.length - 1].rows.push(r);
    }
    return out;
  }, [page, t, fmtDate]);

  const open = (r: TxRow) => {
    const next = new URLSearchParams(params);
    next.set('bill', r.item_kind && r.item_kind !== 'TRANSACTION' ? (r.transaction_id ?? r.id) : r.id);
    setParams(next);
  };
  const close = () => { const next = new URLSearchParams(params); next.delete('bill'); setParams(next); };
  const active = [from, to, partyId, status !== 'ALL' ? status : '', minAmt, maxAmt].filter(Boolean).length;
  const clear = () => { setFrom(''); setTo(''); setPartyId(''); setStatus('ALL'); setMinAmt(''); setMaxAmt(''); };
  const field = 'w-full h-12 px-3 rounded-xl border-2 border-slate-200 bg-white text-base focus:border-indigo-600 focus:outline-none';

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">{t('nav_history')}</h1>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {KINDS.map(k => (
          <button key={k} onClick={() => { setKind(k); setShown(PAGE); }}
            className={`h-11 px-4 shrink-0 rounded-full text-base font-semibold ${kind === k ? 'bg-indigo-700 text-white' : 'bg-white border-2 border-slate-200 text-slate-700'}`}>
            {k === 'ALL' ? t('kinds_ALL') : t(`kind_${k}` as any)}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="w-5 h-5 absolute left-3 top-3.5 text-slate-400" />
          <input value={q} onChange={e => { setQ(e.target.value); setShown(PAGE); }} placeholder={`${t('search_party')} / ${t('bill_no')}`} className={`${field} pl-10`} />
        </div>
        <button onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters}
          className={`h-12 px-4 rounded-xl border-2 text-base font-semibold flex items-center gap-2 ${active ? 'border-indigo-600 bg-indigo-50 text-indigo-800' : 'border-slate-200 bg-white'}`}>
          <SlidersHorizontal className="w-5 h-5" /> {t('filters')}{active ? ` (${active})` : ''}
        </button>
      </div>

      {showFilters && (
        <div className="rounded-2xl bg-white border border-slate-200 p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-base font-semibold">{t('from_date')}<input type="date" value={from} onChange={e => setFrom(e.target.value)} className={`${field} mt-1`} /></label>
          <label className="text-base font-semibold">{t('to_date')}<input type="date" value={to} onChange={e => setTo(e.target.value)} className={`${field} mt-1`} /></label>
          <label className="text-base font-semibold">{t('party_filter')}
            <select value={partyId} onChange={e => setPartyId(e.target.value)} className={`${field} mt-1`}>
              <option value="">{t('any')}</option>
              {(partyData?.parties ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="text-base font-semibold">{t('payment_status')}
            <select value={status} onChange={e => setStatus(e.target.value as any)} className={`${field} mt-1`}>
              {STATUSES.map(s => <option key={s} value={s}>{s === 'ALL' ? t('any') : t(`status_${s}` as any)}</option>)}
            </select>
          </label>
          <label className="text-base font-semibold">{t('amount_from')}<input inputMode="numeric" value={minAmt} onChange={e => setMinAmt(e.target.value.replace(/\D/g, ''))} className={`${field} mt-1`} /></label>
          <label className="text-base font-semibold">{t('amount_to')}<input inputMode="numeric" value={maxAmt} onChange={e => setMaxAmt(e.target.value.replace(/\D/g, ''))} className={`${field} mt-1`} /></label>
          {!!active && <button onClick={clear} className="h-12 rounded-xl border-2 border-slate-200 text-base font-semibold sm:col-span-2 lg:col-span-3">{t('clear_filters')}</button>}
        </div>
      )}

      {data && <p className="text-base text-slate-600">{t('results_count', { n: rows.length })}</p>}
      {data === null && <p className="py-8 text-center text-base text-slate-500">{t('loading')}</p>}
      {data && !rows.length && <p className="py-10 text-center text-lg text-slate-500">{t('no_bills')}</p>}

      {/* Phones: cards grouped by date */}
      <div className="md:hidden space-y-4">
        {groups.map(g => (
          <section key={g.label}>
            <h2 className="text-base font-bold text-slate-500 mb-2">{g.label}</h2>
            <div className="space-y-2">{g.rows.map(r => <BillRow key={`${r.item_kind}-${r.id}`} bill={r} onClick={() => open(r)} />)}</div>
          </section>
        ))}
      </div>
      {/* Desktop: table with original amount, returns, paid, remaining, status */}
      <div className="hidden md:block"><TransactionsTable rows={page} onOpen={open} detailed /></div>

      {rows.length > shown && (
        <button onClick={() => setShown(shown + PAGE)} className="w-full h-12 rounded-xl bg-white border-2 border-slate-200 text-base font-semibold">
          {t('show_more')} ({shown} / {rows.length})
        </button>
      )}

      {openBill && <BillDetailsSheet bill={openBill} onClose={close} />}
    </div>
  );
};
