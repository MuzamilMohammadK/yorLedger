import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingBag, Truck, ArrowDownLeft, ArrowUpRight, ChevronDown, ChevronUp, Bell } from 'lucide-react';
import { formatPaiseToINR } from '@yorbalance/shared';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { useLive } from '../lib/useLiveData';
import { useShell } from '../components/layout/AppShell';
import { BillRow } from '../components/simple/BillRow';
import { DashboardCharts } from '../components/dashboard/DashboardCharts';

/** Home: what do I get, what do I owe, and the four things a shop does every day. */
export const DashboardPage: React.FC = () => {
  const { shop } = useAuth();
  const { t } = useI18n();
  const shell = useShell();
  const navigate = useNavigate();
  const [showTrend, setShowTrend] = useState(false);
  const rs = (p: number) => formatPaiseToINR(p, true);

  const { data: sum } = useLive(() => api.getHomeSummary(), []);
  const { data: recent } = useLive(() => api.getRecentTransactions(5), []);
  const { data: reminders } = useLive(() => api.getRemindersDue(), []);
  const { data: charts } = useLive(() => (showTrend ? api.getDashboardCharts('this_fy') : Promise.resolve(null)), [showTrend]);

  const actions = [
    { label: t('kind_SALE'), icon: ShoppingBag, cls: 'bg-emerald-600', onClick: () => shell.openNewBill({ kind: 'SALE' }) },
    { label: t('kind_PURCHASE'), icon: Truck, cls: 'bg-sky-600', onClick: () => shell.openNewBill({ kind: 'PURCHASE' }) },
    { label: t('got_money'), icon: ArrowDownLeft, cls: 'bg-emerald-800', onClick: () => navigate('/dues?tab=collect') },
    { label: t('gave_money'), icon: ArrowUpRight, cls: 'bg-rose-700', onClick: () => navigate('/dues?tab=pay') }
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">{t('hello', { name: shop?.owner_name?.split(' ')[0] ?? '' })}</h1>

      {/* Money position */}
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => navigate('/dues?tab=collect')} className="text-left rounded-2xl p-4 bg-emerald-50 border-2 border-emerald-200">
          <p className="text-base font-semibold text-emerald-900">{t('to_collect')}</p>
          <p className="text-2xl sm:text-3xl font-extrabold text-emerald-800 break-all">{sum ? rs(sum.to_collect) : '…'}</p>
          {!!sum?.late_collect && <p className="mt-1 text-sm font-semibold text-rose-700">{t('overdue', { amount: rs(sum.late_collect) })}</p>}
        </button>
        <button onClick={() => navigate('/dues?tab=pay')} className="text-left rounded-2xl p-4 bg-rose-50 border-2 border-rose-200">
          <p className="text-base font-semibold text-rose-900">{t('to_pay')}</p>
          <p className="text-2xl sm:text-3xl font-extrabold text-rose-800 break-all">{sum ? rs(sum.to_pay) : '…'}</p>
          {!!sum?.late_pay && <p className="mt-1 text-sm font-semibold text-rose-700">{t('overdue', { amount: rs(sum.late_pay) })}</p>}
        </button>
      </div>

      {/* Daily actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {actions.map(a => (
          <button key={a.label} onClick={a.onClick}
            className={`${a.cls} min-h-[96px] rounded-2xl text-white flex flex-col items-center justify-center gap-2 shadow-sm active:scale-[0.98]`}>
            <a.icon className="w-8 h-8" />
            <span className="text-lg font-bold">{a.label}</span>
          </button>
        ))}
      </div>

      {/* Simple totals */}
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          [t('today_sales'), sum?.today_sales],
          [t('month_sales'), sum?.month_sales],
          [t('month_purchases'), sum?.month_purchases]
        ].map(([label, v]) => (
          <div key={label as string} className="rounded-2xl bg-white border border-slate-200 p-3">
            <p className="text-sm text-slate-600 leading-tight">{label}</p>
            <p className="text-base sm:text-lg font-bold text-slate-900 break-all">{v === undefined ? '…' : rs(v as number)}</p>
          </div>
        ))}
      </div>

      {/* Reminders */}
      {!!reminders?.length && (
        <section>
          <h2 className="text-lg font-bold text-slate-900 mb-2 flex items-center gap-2"><Bell className="w-5 h-5 text-amber-600" /> {t('reminders')}</h2>
          <div className="space-y-2">
            {reminders.slice(0, 5).map(b => <BillRow key={b.id} bill={b} onClick={() => shell.openPayment(b.id)} />)}
          </div>
        </section>
      )}

      {/* Recent */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-bold text-slate-900">{t('recent_bills')}</h2>
          <button onClick={() => navigate('/history')} className="h-10 px-3 text-base font-semibold text-indigo-700">{t('see_all')}</button>
        </div>
        {recent && !recent.transactions.length && (
          <p className="p-6 rounded-2xl bg-white border border-dashed border-slate-300 text-center text-base text-slate-600">{t('empty_home')}</p>
        )}
        <div className="space-y-2">
          {recent?.transactions.map(b => <BillRow key={b.id} bill={b} onClick={() => navigate(`/history?bill=${b.id}`)} />)}
        </div>
      </section>

      {/* Trend charts, on request (keeps the home screen light) */}
      <button onClick={() => setShowTrend(!showTrend)}
        className="w-full h-12 rounded-xl bg-white border border-slate-200 text-base font-semibold text-slate-700 flex items-center justify-center gap-2">
        {showTrend ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />} {t('trend')}
      </button>
      {showTrend && charts && <DashboardCharts charts={charts.charts} />}
    </div>
  );
};
