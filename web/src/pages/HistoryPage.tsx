import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { useLive } from '../lib/useLiveData';
import { todayIST } from '../lib/data/util';
import { BillRow } from '../components/simple/BillRow';
import { BillDetailsSheet } from '../components/simple/BillDetailsSheet';

const KINDS = ['ALL', 'SALE', 'PURCHASE', 'JOB_WORK', 'PAYMENT', 'RETURN'] as const;
const PAGE = 50;

/** All bills, payments and returns — newest first, grouped by day. */
export const HistoryPage: React.FC = () => {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const [kind, setKind] = useState<typeof KINDS[number]>('ALL');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [shown, setShown] = useState(PAGE);
  const openId = params.get('bill');

  const { data } = useLive(
    () => api.getHistory({ type: kind as any, search: q || undefined, startDate: from || undefined, endDate: to || undefined, limit: 100000 }),
    [kind, q, from, to]
  );
  const { data: openBill } = useLive(
    () => (openId ? api.getHistoryDetails(openId).then(r => r.transaction).catch(() => null) : Promise.resolve(null)),
    [openId]
  );

  const groups = useMemo(() => {
    const today = todayIST();
    const y = new Date(`${today}T00:00:00Z`); y.setUTCDate(y.getUTCDate() - 1);
    const yesterday = y.toISOString().slice(0, 10);
    const out: { label: string; rows: any[] }[] = [];
    for (const r of (data?.transactions ?? []).slice(0, shown)) {
      const label = r.invoice_date === today ? t('today') : r.invoice_date === yesterday ? t('yesterday') : r.invoice_date;
      if (!out.length || out[out.length - 1].label !== label) out.push({ label, rows: [] });
      out[out.length - 1].rows.push(r);
    }
    return out;
  }, [data, shown, t]);

  // Payments and returns open the bill they belong to.
  const open = (r: any) => setParams({ bill: r.item_kind === 'TRANSACTION' ? r.id : r.transaction_id });

  const field = 'h-12 px-3 rounded-xl border-2 border-slate-200 bg-white text-base focus:border-indigo-600 focus:outline-none';
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">{t('nav_history')}</h1>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" data-no-swipe>
        {KINDS.map(k => (
          <button key={k} onClick={() => { setKind(k); setShown(PAGE); }}
            className={`h-11 px-4 shrink-0 rounded-full text-base font-semibold ${kind === k ? 'bg-indigo-700 text-white' : 'bg-white border-2 border-slate-200 text-slate-700'}`}>
            {k === 'ALL' ? t('kinds_ALL') : t(`kind_${k}` as any)}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="w-5 h-5 absolute left-3 top-3.5 text-slate-400" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={t('search_party')} className={`${field} w-full pl-10`} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} aria-label="From" className={field} />
        <input type="date" value={to} onChange={e => setTo(e.target.value)} aria-label="To" className={field} />
      </div>

      {data === null && <p className="py-8 text-center text-base text-slate-500">{t('loading')}</p>}
      {data && !data.transactions.length && <p className="py-10 text-center text-lg text-slate-500">{t('no_bills')}</p>}

      {groups.map(g => (
        <section key={g.label}>
          <h2 className="text-base font-bold text-slate-500 mb-2">{g.label}</h2>
          <div className="space-y-2">
            {g.rows.map(r => <BillRow key={`${r.item_kind}-${r.id}`} bill={r} onClick={() => open(r)} />)}
          </div>
        </section>
      ))}

      {data && data.transactions.length > shown && (
        <button onClick={() => setShown(shown + PAGE)} className="w-full h-12 rounded-xl bg-white border-2 border-slate-200 text-base font-semibold">
          {t('show_more')}
        </button>
      )}

      {openBill && <BillDetailsSheet bill={openBill} onClose={() => setParams({})} />}
    </div>
  );
};
