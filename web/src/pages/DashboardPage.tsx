import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserPlus, ShoppingBag, Truck, Scissors, Wallet, Camera, Receipt, Clock, CheckCircle2, IndianRupee, Scale, ArrowLeftRight } from 'lucide-react';
import { DashboardPeriod, formatPaiseToINR } from '@yorbalance/shared';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { useLive } from '../lib/useLiveData';
import { useShell } from '../components/layout/AppShell';
import { DashboardCharts } from '../components/dashboard/DashboardCharts';
import { TransactionsTable } from '../components/simple/TransactionsTable';

const PERIODS: DashboardPeriod[] = ['this_month', 'last_30_days', 'this_quarter', 'this_fy', 'all_time'];
const PERIOD_KEY = 'yorledger_dash_period';

/** §6 Dashboard: summary cards with a period selector, charts, recent transactions, quick actions. */
export const DashboardPage: React.FC = () => {
  const { shop } = useAuth();
  const { t } = useI18n();
  const shell = useShell();
  const navigate = useNavigate();
  const [period, setPeriodState] = useState<DashboardPeriod>(() => {
    try { return (localStorage.getItem(PERIOD_KEY) as DashboardPeriod) || 'this_month'; } catch { return 'this_month'; }
  });
  const setPeriod = (p: DashboardPeriod) => { setPeriodState(p); try { localStorage.setItem(PERIOD_KEY, p); } catch { /* optional */ } };

  const { data } = useLive(() => api.getDashboard(period), [period]);
  const { data: recent } = useLive(() => api.getRecentTransactions(10), []);
  const f = data?.figures;
  const rs = (p?: number) => (p === undefined ? '…' : formatPaiseToINR(p, true));

  const cards = [
    { icon: Receipt, title: t('card_total_tx'), value: f ? String(f.total_transactions) : '…', sub: f ? t('card_total_tx_sub', { b: f.bills_count, p: f.payments_count, r: f.returns_count }) : '', tone: 'text-slate-900' },
    { icon: Clock, title: t('card_pending'), value: rs(f?.pending_amount), sub: f ? t('card_pending_sub', { n: f.pending_count }) : '', tone: 'text-amber-700' },
    { icon: CheckCircle2, title: t('card_settled'), value: rs(f?.settled_amount), sub: f ? t('card_settled_sub', { n: f.settled_count }) : '', tone: 'text-emerald-700' },
    { icon: IndianRupee, title: t('card_total_value'), value: rs(f?.total_value), sub: t('card_total_value_sub'), tone: 'text-slate-900' },
    { icon: Scale, title: t('card_net'), value: rs(f?.net_balance), sub: f ? `${t('card_net_sub')} · ${t('to_collect')} ${rs(f.to_collect)} · ${t('to_pay')} ${rs(f.to_pay)}` : t('card_net_sub'),
      tone: f && f.net_balance < 0 ? 'text-rose-700' : 'text-emerald-700' },
    { icon: ArrowLeftRight, title: t('card_svp'), value: f ? `${rs(f.sales)}` : '…', sub: f ? `${t('purchases')} ${rs(f.purchases)} · ${t('job_work')} ${rs(f.job_work)}` : '', tone: 'text-emerald-700' }
  ];

  const actions = [
    { label: t('add_party'), icon: UserPlus, cls: 'bg-slate-800', onClick: () => navigate('/parties?new=1') },
    { label: t('new_sale'), icon: ShoppingBag, cls: 'bg-emerald-700', onClick: () => shell.openNewBill({ kind: 'SALE' }) },
    { label: t('new_purchase'), icon: Truck, cls: 'bg-sky-700', onClick: () => shell.openNewBill({ kind: 'PURCHASE' }) },
    { label: t('new_job_work'), icon: Scissors, cls: 'bg-amber-700', onClick: () => shell.openNewBill({ kind: 'JOB_WORK' }) },
    { label: t('view_dues'), icon: Wallet, cls: 'bg-rose-700', onClick: () => navigate('/dues') },
    { label: t('scan_bill'), icon: Camera, cls: 'bg-indigo-700', onClick: shell.openScan }
  ];

  return (
    <div className="space-y-6">
      {/* §6.2 header content (brand, shop, notifications and profile are in the app bar) */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('welcome_back', { name: shop?.owner_name ?? '' })}</h1>
        <p className="text-base text-slate-600">{shop?.name}</p>
      </div>

      {/* §6.6 quick actions */}
      <section>
        <h2 className="sr-only">{t('quick_actions')}</h2>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {actions.map(a => (
            <button key={a.label} onClick={a.onClick}
              className={`${a.cls} min-h-[84px] rounded-2xl text-white flex flex-col items-center justify-center gap-1 px-1 text-center active:scale-[0.98]`}>
              <a.icon className="w-7 h-7" />
              <span className="text-sm sm:text-base font-bold leading-tight">{a.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* §6.3 period selector + six summary cards */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-1" role="tablist" aria-label={t('period')}>
          {PERIODS.map(p => (
            <button key={p} role="tab" aria-selected={period === p} onClick={() => setPeriod(p)}
              className={`h-11 px-4 shrink-0 rounded-full text-base font-semibold ${period === p ? 'bg-indigo-700 text-white' : 'bg-white border-2 border-slate-200 text-slate-700'}`}>
              {t(`period_${p}` as any)}
            </button>
          ))}
        </div>
        {f && <p className="text-sm text-slate-500">{f.from} → {f.to}</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {cards.map(c => (
            <div key={c.title} className="rounded-2xl bg-white border border-slate-200 p-4">
              <p className="text-base font-semibold text-slate-600 flex items-center gap-2"><c.icon className="w-5 h-5" /> {c.title}</p>
              <p className={`mt-1 text-2xl font-extrabold break-all ${c.tone}`}>{c.value}</p>
              <p className="mt-1 text-sm text-slate-500">{c.sub}</p>
            </div>
          ))}
        </div>
      </section>

      {/* §6.4 charts */}
      {data && (data.figures.bills_count ? <DashboardCharts series={data.series} />
        : <p className="p-6 rounded-2xl bg-white border border-dashed border-slate-300 text-center text-base text-slate-600">{t('no_data_period')}</p>)}

      {/* §6.5 recent transactions */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-bold text-slate-900">{t('recent_tx')}</h2>
          <button onClick={() => navigate('/history')} className="h-11 px-3 rounded-lg text-base font-semibold text-indigo-700">{t('view_all')}</button>
        </div>
        {recent && !recent.transactions.length && (
          <p className="p-6 rounded-2xl bg-white border border-dashed border-slate-300 text-center text-base text-slate-600">{t('empty_home')}</p>
        )}
        {recent && <TransactionsTable rows={recent.transactions} onOpen={r => navigate(`/history?bill=${r.id}`)} />}
      </section>
    </div>
  );
};
